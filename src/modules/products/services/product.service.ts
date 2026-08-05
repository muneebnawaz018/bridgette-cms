import 'server-only';
import type { PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Product, type ProductDoc } from '../models/product.model';
import { ProductRate } from '../models/productRate.model';
import { Customer } from '@/modules/customers/models/customer.model';
import type { ProductCreateInput, ProductUpdateInput, ListProductInput } from '../schemas';

/** Lean docs from a projection carry `_id`, which InferSchemaType omits. */
type LeanProduct = ProductDoc & { _id: Types.ObjectId };

/**
 * Products are shared company-wide: any role holding ProductView reads the (non-deleted)
 * catalogue. Only admins mutate. Reads match "not deleted".
 */
function activeMatch(search?: string): Record<string, unknown> {
  const match: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (search?.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    match.$or = [{ name: rx }, { sku: rx }];
  }
  return match;
}

const LIST_PROJECTION = {
  name: 1,
  sku: 1,
  defaultRate: 1,
  discount: 1,
  unit: 1,
  // The edit dialog is opened from a list row, so anything it edits has to be projected here.
  // Left out, the field opens blank and a save writes that blank back over the stored value.
  description: 1,
  fabric: 1,
  fabricName: '$fabricDoc.name',
  fabricGsm: '$fabricDoc.gsm',
  createdAt: 1,
} as const;

// The list shows the fabric by name, so join it in rather than making the grid resolve ids.
const FABRIC_LOOKUP: PipelineStage[] = [
  {
    $lookup: {
      from: 'fabrics',
      localField: 'fabric',
      foreignField: '_id',
      as: 'fabricDoc',
    },
  },
  { $unwind: { path: '$fabricDoc', preserveNullAndEmptyArrays: true } },
];

/** A duplicate SKU surfaces as a Mongo 11000; translate it to a field-level message. */
function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/** Paginated product list (search over name/sku), name-sorted. */
export async function listProducts(
  actor: SessionUser,
  query: ListProductInput,
): Promise<Paginated<ProductDoc>> {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();

  const stages: PipelineStage[] = [
    { $match: activeMatch(query.search) },
    ...FABRIC_LOOKUP,
    { $project: LIST_PROJECTION },
  ];
  return aggregatePaginate<ProductDoc>(
    Product,
    stages,
    { page: query.page, limit: query.limit },
    { name: 1 },
  );
}

export const OPTIONS_LIMIT = 2000;

/**
 * Lightweight product list for the invoice line picker. With a `customerId` each item carries
 * everything the line needs, so picking one costs no further lookup:
 *
 *  - `linked`   — on the customer's own product list. These sort to the front under their own
 *                 heading. They lead rather than filter the list: a customer with none linked
 *                 would otherwise have an empty picker, and a one-off item still has to be
 *                 billable.
 *  - `rate`     — the customer's negotiated rate where a ProductRate exists, else the catalogue
 *                 rate. `negotiated` says which of the two it is.
 *  - `discount` — the product's standing percentage, prefilled onto the line.
 */
export async function listProductOptions(actor: SessionUser, customerId?: string) {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();

  const validCustomer = Boolean(customerId && Types.ObjectId.isValid(customerId));
  const customerOid = validCustomer ? new Types.ObjectId(customerId) : null;

  const [products, rateRows, customer] = await Promise.all([
    Product.find({ isDeleted: { $ne: true } })
      .select({ name: 1, sku: 1, unit: 1, defaultRate: 1, discount: 1, description: 1 })
      .sort({ name: 1 })
      .limit(OPTIONS_LIMIT)
      .lean<LeanProduct[]>(),
    customerOid
      ? ProductRate.find({ customer: customerOid }).select({ product: 1, rate: 1 }).lean()
      : Promise.resolve([]),
    customerOid
      ? Customer.findById(customerOid).select({ products: 1 }).lean<{ products?: unknown[] }>()
      : Promise.resolve(null),
  ]);

  const overrides = new Map<string, number>();
  for (const r of rateRows) overrides.set(String(r.product), r.rate);
  const linkedIds = new Set((customer?.products ?? []).map((id) => String(id)));

  const items = products.map((p) => {
    const id = String(p._id);
    const override = overrides.get(id);
    return {
      _id: id,
      name: p.name,
      // What the line on the invoice should read. The name identifies the product to staff;
      // this is the wording the customer sees, which is why it is a separate field.
      description: p.description ?? '',
      sku: p.sku ?? '',
      unit: p.unit ?? '',
      defaultRate: p.defaultRate,
      discount: p.discount ?? 0,
      rate: override ?? p.defaultRate,
      negotiated: override != null,
      linked: linkedIds.has(id),
    };
  });

  // Stable within each group: the DB sort already ordered by name, and sort() is stable, so
  // linked products keep their alphabetical order and the rest follow in theirs.
  return items.sort((a, b) => Number(b.linked) - Number(a.linked));
}

export async function getProduct(actor: SessionUser, id: string) {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();
  const doc = await Product.findOne({ _id: id, isDeleted: { $ne: true } }).lean<ProductDoc>();
  if (!doc) throw new Error('Product not found');
  return doc;
}

export async function createProduct(actor: SessionUser, input: ProductCreateInput) {
  assertCan(actor.role, Permission.ProductCreate);
  await connectDb();
  try {
    const doc = await Product.create({
      name: input.name,
      sku: input.sku,
      defaultRate: input.defaultRate,
      discount: input.discount ?? 0,
      unit: input.unit,
      fabric: input.fabric,
      description: input.description,
      createdBy: actor.userId,
    });
    return doc.toObject();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error('A product with that SKU already exists');
    throw err;
  }
}

export async function updateProduct(actor: SessionUser, id: string, input: ProductUpdateInput) {
  assertCan(actor.role, Permission.ProductEdit);
  await connectDb();
  const doc = await Product.findById(id);
  if (!doc || doc.isDeleted) throw new Error('Product not found');

  if (input.name !== undefined) doc.name = input.name;
  if (input.sku !== undefined) doc.sku = input.sku;
  if (input.defaultRate !== undefined) doc.defaultRate = input.defaultRate;
  if (input.discount !== undefined) doc.discount = input.discount;
  if (input.unit !== undefined) doc.unit = input.unit;
  // Absent leaves it alone; the schema guarantees a present value is a real id (never blank).
  if (input.fabric !== undefined) doc.fabric = input.fabric as unknown as ProductDoc['fabric'];
  if (input.description !== undefined) doc.description = input.description;

  try {
    await doc.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error('A product with that SKU already exists');
    throw err;
  }
  return doc.toObject();
}

/**
 * Soft-delete a product and hard-delete its per-customer overrides (they only make sense while
 * the product is live). The product row itself is kept for invoice audit history.
 */
export async function deleteProduct(actor: SessionUser, id: string, reason?: string) {
  assertCan(actor.role, Permission.ProductDelete);
  await connectDb();
  const doc = await Product.findById(id);
  if (!doc) throw new Error('Product not found');
  if (doc.isDeleted) throw new Error('That product is already deleted');
  doc.isDeleted = true;
  doc.deletedBy = actor.userId as unknown as ProductDoc['deletedBy'];
  doc.deletedAt = new Date();
  doc.deleteReason = reason;
  await doc.save();
  await ProductRate.deleteMany({ product: doc._id });
  return doc.toObject();
}

// --- Per-customer rate overrides, owned from the customer's side ---

export interface CustomerRateRow {
  productId: string;
  productName: string;
  sku: string;
  unit?: string;
  defaultRate: number;
  /** The customer's negotiated rate, or null when they pay the default. */
  rate: number | null;
}

/**
 * Every active product with this customer's negotiated rate merged in (null = pays default).
 * Powers the customer-side pricing view.
 */
export async function listCustomerRates(
  actor: SessionUser,
  customerId: string,
): Promise<CustomerRateRow[]> {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();

  const [products, overrides] = await Promise.all([
    Product.find({ isDeleted: { $ne: true } })
      .select({ name: 1, sku: 1, unit: 1, defaultRate: 1 })
      .sort({ name: 1 })
      .lean<LeanProduct[]>(),
    Types.ObjectId.isValid(customerId)
      ? ProductRate.find({ customer: new Types.ObjectId(customerId) })
          .select({ product: 1, rate: 1 })
          .lean()
      : Promise.resolve([]),
  ]);

  const byProduct = new Map<string, number>();
  for (const r of overrides) byProduct.set(String(r.product), r.rate);

  return products.map((p) => ({
    productId: String(p._id),
    productName: p.name,
    sku: p.sku ?? '',
    unit: p.unit ?? undefined,
    defaultRate: p.defaultRate,
    rate: byProduct.get(String(p._id)) ?? null,
  }));
}

/** Upsert a per-customer rate. Admin only. */
export async function setProductRate(
  actor: SessionUser,
  productId: string,
  customerId: string,
  rate: number,
) {
  assertCan(actor.role, Permission.ProductEdit);
  await connectDb();
  await ProductRate.updateOne(
    { product: productId, customer: customerId },
    { $set: { rate }, $setOnInsert: { createdBy: actor.userId } },
    { upsert: true },
  );
  return { ok: true };
}

/** Remove a per-customer rate (reverts the customer to the default). Admin only. */
/**
 * Drop every negotiated rate belonging to one customer. Called when a customer is deleted — the
 * mirror of deleteProduct clearing a product's rates. Without it the rows outlive the customer
 * and quietly reattach if that id is ever reused.
 *
 * No permission check of its own: the caller has already proven CustomerDelete, which is a
 * stronger right than the ProductEdit this would otherwise ask for.
 */
export async function clearCustomerRates(customerId: string) {
  await connectDb();
  if (!Types.ObjectId.isValid(customerId)) return { deleted: 0 };
  const res = await ProductRate.deleteMany({ customer: new Types.ObjectId(customerId) });
  return { deleted: res.deletedCount ?? 0 };
}

export async function removeProductRate(actor: SessionUser, productId: string, customerId: string) {
  assertCan(actor.role, Permission.ProductEdit);
  await connectDb();
  await ProductRate.deleteOne({ product: productId, customer: customerId });
  return { ok: true };
}
