import 'server-only';
import type { PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Product, type ProductDoc } from '../models/product.model';
import { ProductRate } from '../models/productRate.model';
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
  unit: 1,
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
 * Lightweight product list for the invoice line picker. When `customerId` is given, each item's
 * `rate` is that customer's negotiated rate where one exists, otherwise the default rate — so a
 * picked line lands on the right price with no extra lookup.
 */
export async function listProductOptions(actor: SessionUser, customerId?: string) {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();

  const products = await Product.find({ isDeleted: { $ne: true } })
    .select({ name: 1, sku: 1, unit: 1, defaultRate: 1 })
    .sort({ name: 1 })
    .limit(OPTIONS_LIMIT)
    .lean<LeanProduct[]>();

  const overrides = new Map<string, number>();
  if (customerId && Types.ObjectId.isValid(customerId)) {
    const rows = await ProductRate.find({ customer: new Types.ObjectId(customerId) })
      .select({ product: 1, rate: 1 })
      .lean();
    for (const r of rows) overrides.set(String(r.product), r.rate);
  }

  return products.map((p) => {
    const override = overrides.get(String(p._id));
    return {
      _id: String(p._id),
      name: p.name,
      sku: p.sku ?? '',
      unit: p.unit ?? '',
      defaultRate: p.defaultRate,
      rate: override ?? p.defaultRate,
      negotiated: override != null,
    };
  });
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
      unit: input.unit,
      fabric: input.fabric,
      description: input.description,
      notes: input.notes,
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
  if (input.unit !== undefined) doc.unit = input.unit;
  // undefined (field absent) leaves it alone; an explicit blank clears the link.
  if ('fabric' in input) doc.fabric = (input.fabric ?? null) as unknown as ProductDoc['fabric'];
  if (input.description !== undefined) doc.description = input.description;
  if (input.notes !== undefined) doc.notes = input.notes;

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

// --- Per-customer rate overrides (shared by the product-side and customer-side views) ---

export interface ProductRateRow {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  rate: number;
}

/** Overrides set for one product, joined with customer name/email, name-sorted. */
export async function listProductRates(
  actor: SessionUser,
  productId: string,
): Promise<ProductRateRow[]> {
  assertCan(actor.role, Permission.ProductView);
  await connectDb();
  const rows = await ProductRate.find({ product: productId })
    .populate<{ customer: { _id: Types.ObjectId; name: string; email?: string } }>(
      'customer',
      'name email',
    )
    .lean();
  return rows
    .filter((r) => r.customer) // a deleted customer leaves a dangling ref; skip it
    .map((r) => ({
      customerId: String(r.customer._id),
      customerName: r.customer.name,
      customerEmail: r.customer.email,
      rate: r.rate,
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName));
}

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
export async function removeProductRate(actor: SessionUser, productId: string, customerId: string) {
  assertCan(actor.role, Permission.ProductEdit);
  await connectDb();
  await ProductRate.deleteOne({ product: productId, customer: customerId });
  return { ok: true };
}
