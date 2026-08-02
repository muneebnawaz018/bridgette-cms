import 'server-only';
import type { PipelineStage } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { clearCustomerRates } from '@/modules/products/services/product.service';
import { Customer, type CustomerDoc } from '../models/customer.model';
import { formatAddress, isBlankAddress } from '../address';
import type { CustomerCreateInput, CustomerUpdateInput, ListCustomerInput } from '../schemas';

/**
 * Customers are shared company-wide: any role holding CustomerView reads every (non-deleted)
 * customer. Only admins (CustomerCreate/Edit/Delete) mutate them. So there is no per-user
 * visibility filter here — the read match is simply "not deleted".
 */
function activeMatch(search?: string): Record<string, unknown> {
  const match: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (search?.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    match.$or = [{ name: rx }, { email: rx }];
  }
  return match;
}

const LIST_PROJECTION = {
  name: 1,
  firstName: 1,
  lastName: 1,
  addressParts: 1,
  email: 1,
  phone: 1,
  address: 1,
  reseller: 1,
  invoiceType: 1,
  products: 1,
  shipping: 1,
  createdAt: 1,
} as const;

/** Paginated customer list (search over name/email). */
export async function listCustomers(
  actor: SessionUser,
  query: ListCustomerInput,
): Promise<Paginated<CustomerDoc>> {
  assertCan(actor.role, Permission.CustomerView);
  await connectDb();

  const stages: PipelineStage[] = [
    { $match: activeMatch(query.search) },
    { $project: LIST_PROJECTION },
  ];
  // Customers read best name-first; aggregatePaginate applies this sort inside its $facet page.
  return aggregatePaginate<CustomerDoc>(
    Customer,
    stages,
    { page: query.page, limit: query.limit },
    { name: 1 },
  );
}

/** Default page size for the picker; hard-capped so a caller can't request the whole book. */
const OPTIONS_PAGE = 20;
const OPTIONS_PAGE_MAX = 50;

/**
 * Paginated list for the invoice customer picker — name + party fields only. With `q` it does a
 * server-side name/email search. Returns one page plus `hasMore` so the dropdown can load
 * the next page as the user scrolls, rather than ever shipping the whole book at once.
 */
export async function listCustomerOptions(
  actor: SessionUser,
  opts: { q?: string; limit?: number; skip?: number } = {},
) {
  assertCan(actor.role, Permission.CustomerView);
  await connectDb();
  const term = opts.q?.trim();
  const limit = Math.min(Math.max(1, opts.limit ?? OPTIONS_PAGE), OPTIONS_PAGE_MAX);
  const skip = Math.max(0, opts.skip ?? 0);

  const filter: Record<string, unknown> = { isDeleted: { $ne: true } };
  if (term) {
    // Escape regex metacharacters so a typed "." or "(" searches literally.
    const safe = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }

  // Fetch one extra row to detect a next page without a separate count query.
  const rows = await Customer.find(filter)
    // `products` and `shipping` ride along: picking a customer on an invoice fills its lines and
    // its SHIP TO block, and a second round trip for either would show as a visible lag.
    .select({
      name: 1,
      email: 1,
      phone: 1,
      address: 1,
      reseller: 1,
      invoiceType: 1,
      products: 1,
      shipping: 1,
    })
    .sort({ name: 1 })
    .skip(skip)
    .limit(limit + 1)
    .lean<CustomerDoc[]>();

  const hasMore = rows.length > limit;
  return { items: hasMore ? rows.slice(0, limit) : rows, hasMore };
}

/** Fetch one customer (excludes soft-deleted). */
export async function getCustomer(actor: SessionUser, id: string) {
  assertCan(actor.role, Permission.CustomerView);
  await connectDb();
  const doc = await Customer.findOne({ _id: id, isDeleted: { $ne: true } }).lean<CustomerDoc>();
  if (!doc) throw new Error('Customer not found');
  return doc;
}

/** "First Last" when the parts are given, else whatever full name the caller sent. */
function fullName(input: {
  name?: string;
  firstName?: string;
  lastName?: string;
}): string | undefined {
  const joined = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  return joined || input.name;
}

/**
 * The shipping block, with its printable one-liner derived the same way the billing one is.
 * `sameAsBilling` stores nothing else: a copy of the billing address would go stale the moment
 * the billing address was corrected, so readers fall back to the billing party instead.
 */
function shippingBlock(input: Pick<CustomerUpdateInput, 'shipping'>) {
  const ship = input.shipping;
  if (!ship || ship.sameAsBilling !== false) return { sameAsBilling: true };
  const parts = isBlankAddress(ship.addressParts) ? undefined : ship.addressParts;
  return {
    sameAsBilling: false,
    name: ship.name,
    phone: ship.phone,
    addressParts: parts,
    address: parts ? formatAddress(parts) : undefined,
  };
}

/**
 * The printable address. A filled-in structured address always wins, so the flat string can
 * never drift from the parts; an explicit `address` is only used when there are no parts.
 */
function printableAddress(input: CustomerCreateInput): string | undefined {
  if (!isBlankAddress(input.addressParts)) return formatAddress(input.addressParts);
  return input.address;
}

/** A duplicate email surfaces as a Mongo 11000; translate it to a field-level message. */
function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

const DUPLICATE_EMAIL = 'A customer with that email already exists';

/** Create a customer. Admin only. */
export async function createCustomer(actor: SessionUser, input: CustomerCreateInput) {
  assertCan(actor.role, Permission.CustomerCreate);
  await connectDb();
  try {
    const doc = await Customer.create({
      name: fullName(input),
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      address: printableAddress(input),
      addressParts: isBlankAddress(input.addressParts) ? undefined : input.addressParts,
      shipping: shippingBlock(input),
      products: input.products ?? [],
      notes: input.notes,
      reseller: input.reseller ?? false,
      invoiceType: input.invoiceType,
      createdBy: actor.userId,
    });
    return doc.toObject();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error(DUPLICATE_EMAIL);
    throw err;
  }
}

/** Edit a customer. Admin only. Only provided fields change; blanks clear the field. */
export async function updateCustomer(actor: SessionUser, id: string, input: CustomerUpdateInput) {
  assertCan(actor.role, Permission.CustomerEdit);
  await connectDb();
  const doc = await Customer.findById(id);
  if (!doc || doc.isDeleted) throw new Error('Customer not found');

  if (input.firstName !== undefined) doc.firstName = input.firstName;
  if (input.lastName !== undefined) doc.lastName = input.lastName;
  // Re-derive the full name from whatever the record now holds, so editing just the last name
  // still updates it; a caller sending only `name` keeps setting it directly.
  const derived = fullName({
    name: input.name,
    firstName: input.firstName ?? doc.firstName ?? undefined,
    lastName: input.lastName ?? doc.lastName ?? undefined,
  });
  if (derived) doc.name = derived;
  if (input.email !== undefined) doc.email = input.email;
  if (input.phone !== undefined) doc.phone = input.phone;
  if (input.addressParts !== undefined) {
    const blank = isBlankAddress(input.addressParts);
    doc.addressParts = (blank ? undefined : input.addressParts) as CustomerDoc['addressParts'];
    doc.address = blank ? (input.address ?? '') : formatAddress(input.addressParts);
  } else if (input.address !== undefined) {
    doc.address = input.address;
  }
  if (input.shipping !== undefined) {
    doc.shipping = shippingBlock(input) as unknown as CustomerDoc['shipping'];
  }
  // An empty array is a real value here — it means "unlink everything" — so only an absent
  // field leaves the list alone.
  if (input.products !== undefined) {
    doc.products = input.products as unknown as CustomerDoc['products'];
  }
  if (input.notes !== undefined) doc.notes = input.notes;
  if (input.reseller !== undefined) doc.reseller = input.reseller;
  if (input.invoiceType !== undefined) doc.invoiceType = input.invoiceType;

  try {
    await doc.save();
  } catch (err) {
    if (isDuplicateKey(err)) throw new Error(DUPLICATE_EMAIL);
    throw err;
  }
  return doc.toObject();
}

/**
 * Soft-delete. Customers are never hard-deleted so invoices that referenced them keep their
 * audit trail. Admin only.
 */
export async function deleteCustomer(actor: SessionUser, id: string, reason?: string) {
  assertCan(actor.role, Permission.CustomerDelete);
  await connectDb();
  const doc = await Customer.findById(id);
  if (!doc) throw new Error('Customer not found');
  if (doc.isDeleted) throw new Error('That customer is already deleted');
  doc.isDeleted = true;
  doc.deletedBy = actor.userId as unknown as CustomerDoc['deletedBy'];
  doc.deletedAt = new Date();
  doc.deleteReason = reason;
  await doc.save();
  // Their negotiated rates go with them, the same way deleting a product clears its own. The
  // customer row itself stays for invoice history; the pricing attached to it does not.
  await clearCustomerRates(String(doc._id));
  return doc.toObject();
}
