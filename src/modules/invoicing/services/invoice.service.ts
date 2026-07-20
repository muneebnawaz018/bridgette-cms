import 'server-only';
import type { PipelineStage } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Invoice, type InvoiceDoc } from '../models/invoice.model';
import { InvoiceState, DEFAULT_CURRENCY } from '../enums';
import { computePaymentState } from '../state';
import { calcInvoice } from '../calc';
import { issueInvoiceNumber } from '../numbering';
import { invoiceVisibilityFilter, canViewInvoice } from '../visibility';
import type {
  CreateInvoiceInput,
  UpdateInvoiceInput,
  ListInvoiceInput,
  ExportInvoiceInput,
} from '../schemas';

/** Create an invoice. Number is assigned at creation (drafts included). */
export async function createInvoice(actor: SessionUser, input: CreateInvoiceInput) {
  assertCan(actor.role, Permission.InvoiceCreate);
  await connectDb();

  const currency = input.currency ?? DEFAULT_CURRENCY[input.type];
  const calc = calcInvoice({
    type: input.type,
    items: input.items,
    shippingHandlingTariff: input.shippingHandlingTariff,
    invoiceDiscount: input.invoiceDiscount,
    taxRate: input.taxRate,
    applyTax: input.applyTax,
  });

  const items = input.items.map((it, i) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    taxable: it.taxable ?? true,
    discount: it.discount ?? 0,
    lineTotal: calc.lineTotals[i],
  }));

  const number = await issueInvoiceNumber(input.type);

  const reminder =
    input.reminderThresholdHours != null
      ? {
          thresholdHours: input.reminderThresholdHours,
          dueAt: new Date(Date.now() + input.reminderThresholdHours * 3_600_000),
          sent: false,
        }
      : undefined;

  const dueDate = input.dueDate ? new Date(input.dueDate) : undefined;
  const state = input.asDraft
    ? InvoiceState.Draft
    : computePaymentState({ amountPaid: 0, grandTotal: calc.grandTotal, dueDate });

  const doc = await Invoice.create({
    type: input.type,
    number,
    state,
    currency,
    billTo: input.billTo,
    shipTo: input.shipTo,
    items,
    subtotal: calc.subtotal,
    shippingHandlingTariff: calc.shippingHandlingTariff,
    discount: calc.discount,
    totalBeforeTax: calc.totalBeforeTax,
    taxRate: calc.taxRate,
    taxAmount: calc.taxAmount,
    grandTotal: calc.grandTotal,
    amountPaid: 0,
    balanceDue: calc.grandTotal,
    applyTax: input.applyTax ?? false,
    cashReceived: input.cashReceived,
    advancePayment: input.advancePayment,
    remainingBalance: input.advancePayment != null ? calc.grandTotal - input.advancePayment : undefined,
    paymentMethod: input.paymentMethod,
    dueDate,
    terms: input.terms,
    notes: input.notes,
    reminder,
    createdBy: actor.userId,
  });

  return doc.toObject();
}

/** Regex-escape user input — otherwise a search for `a+b` throws, and `.*` scans everything. */
/**
 * Shared filter for the list and the export, so what a user previews is exactly what they
 * download. Dates are whole calendar days in UTC: `from` starts at 00:00:00.000Z and `to`
 * runs to 23:59:59.999Z, both inclusive.
 */
function invoiceMatch(
  actor: SessionUser,
  query: Pick<ListInvoiceInput, 'view' | 'type' | 'search' | 'from' | 'to'>,
): Record<string, unknown> {
  const match: Record<string, unknown> = { ...invoiceVisibilityFilter(actor, query.view) };
  if (query.type) match.type = query.type;

  if (query.search?.trim()) {
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    match.$and = [{ $or: [{ number: rx }, { 'billTo.name': rx }, { 'billTo.email': rx }] }];
  }

  const createdAt: Record<string, Date> = {};
  if (query.from) createdAt.$gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  if (Object.keys(createdAt).length > 0) match.createdAt = createdAt;

  return match;
}

/** The list payload — deliberately without the heavy items[] array. */
const LIST_PROJECTION = {
  number: 1,
  type: 1,
  state: 1,
  currency: 1,
  grandTotal: 1,
  amountPaid: 1,
  balanceDue: 1,
  isArchived: 1,
  isDeleted: 1,
  createdBy: 1,
  createdAt: 1,
  'billTo.name': 1,
  'billTo.email': 1,
} as const;

/** Paginated, role-scoped invoice list. */
export async function listInvoices(
  actor: SessionUser,
  query: ListInvoiceInput,
): Promise<Paginated<InvoiceDoc>> {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

  const stages: PipelineStage[] = [
    { $match: invoiceMatch(actor, query) },
    { $project: LIST_PROJECTION },
  ];
  return aggregatePaginate<InvoiceDoc>(Invoice, stages, {
    page: query.page,
    limit: query.limit,
  });
}

/** Hard ceiling on one export, so a stray "All" never tries to buffer the whole collection. */
export const EXPORT_LIMIT = 5000;

/**
 * Every invoice matching the filters, newest first, for a file export. Capped at
 * EXPORT_LIMIT; `truncated` tells the caller the file is short so it can say so rather than
 * silently hand over a partial export.
 */
export async function exportInvoices(
  actor: SessionUser,
  query: ExportInvoiceInput,
): Promise<{ rows: InvoiceDoc[]; total: number; truncated: boolean }> {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

  const match = invoiceMatch(actor, query);
  const total = await Invoice.countDocuments(match);
  const rows = await Invoice.find(match)
    .select(LIST_PROJECTION)
    .sort({ createdAt: -1 })
    .limit(EXPORT_LIMIT)
    .lean<InvoiceDoc[]>();

  return { rows, total, truncated: total > rows.length };
}

export interface TypeTotals {
  count: number;
  invoiced: number;
  outstanding: number;
}
export interface InvoiceStats {
  total: number;
  /** Pipeline counts for the current calendar month only — see `pipelineMonth`. */
  byState: Record<string, number>;
  /** ISO start of the month `byState` covers, so the UI can label the period truthfully
   *  instead of assuming the client clock agrees with the server. */
  pipelineMonth: string;
  byType: Record<string, TypeTotals>; // { tax: {...}, cash: {...}, pk: {...} }
}

const round2 = (n: number) => Math.round((n ?? 0) * 100) / 100;

/** Aggregated dashboard stats over the invoices this user may see (split by invoice type). */
export async function getInvoiceStats(actor: SessionUser): Promise<InvoiceStats> {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

  // The pipeline reports the current calendar month; the type totals stay lifetime-to-date.
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [row] = await Invoice.aggregate([
    // Stats cover the active set only (archived + deleted excluded).
    { $match: invoiceVisibilityFilter(actor, 'active') },
    {
      $facet: {
        type: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              invoiced: { $sum: '$grandTotal' },
              outstanding: { $sum: '$balanceDue' },
            },
          },
        ],
        state: [
          { $match: { createdAt: { $gte: monthStart, $lt: nextMonthStart } } },
          { $group: { _id: '$state', count: { $sum: 1 } } },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ]);

  const byState: Record<string, number> = {};
  for (const s of row?.state ?? []) byState[s._id] = s.count;

  const byType: Record<string, TypeTotals> = {};
  for (const t of row?.type ?? []) {
    byType[t._id] = {
      count: t.count,
      invoiced: round2(t.invoiced),
      outstanding: round2(t.outstanding),
    };
  }

  return { total: row?.total?.[0]?.n ?? 0, byState, pipelineMonth: monthStart.toISOString(), byType };
}

/** Fetch one invoice, enforcing archive visibility. */
export async function getInvoice(actor: SessionUser, id: string) {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();
  const doc = await Invoice.findById(id).lean<InvoiceDoc>();
  if (!doc) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, doc)) throw new Error('Forbidden: invoice not visible');
  return doc;
}

/** Edit an invoice and recompute totals. Refuses archived/cancelled invoices. */
export async function updateInvoice(actor: SessionUser, id: string, input: UpdateInvoiceInput) {
  assertCan(actor.role, Permission.InvoiceEdit);
  await connectDb();
  const doc = await Invoice.findById(id);
  if (!doc) throw new Error('Invoice not found');
  // Same visibility rule the read path applies. Without it, holding the permission plus an
  // id was enough to edit an invoice the caller is not allowed to so much as open.
  if (!canViewInvoice(actor, doc)) throw new Error('Forbidden: invoice not visible');
  if (doc.isDeleted) throw new Error('Deleted invoices cannot be edited');
  if (doc.isArchived) throw new Error('Archived invoices cannot be edited');

  const type = input.type ?? doc.type;
  const items = input.items ?? doc.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    taxable: it.taxable ?? true,
    discount: it.discount ?? 0,
  }));

  const calc = calcInvoice({
    type,
    items,
    shippingHandlingTariff: input.shippingHandlingTariff ?? doc.shippingHandlingTariff,
    invoiceDiscount: input.invoiceDiscount ?? doc.discount,
    taxRate: input.taxRate ?? doc.taxRate,
    applyTax: input.applyTax ?? doc.applyTax,
  });

  doc.set(
    'items',
    items.map((it, i) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxable: it.taxable ?? true,
      discount: it.discount ?? 0,
      lineTotal: calc.lineTotals[i],
    })),
  );
  doc.subtotal = calc.subtotal;
  doc.shippingHandlingTariff = calc.shippingHandlingTariff;
  doc.discount = calc.discount;
  doc.totalBeforeTax = calc.totalBeforeTax;
  doc.taxRate = calc.taxRate;
  doc.taxAmount = calc.taxAmount;
  doc.grandTotal = calc.grandTotal;
  doc.balanceDue = Math.max(0, calc.grandTotal - doc.amountPaid);
  // Recompute payment-driven state (leave explicit drafts as Draft).
  if (doc.state !== InvoiceState.Draft) {
    doc.state = computePaymentState({
      amountPaid: doc.amountPaid,
      grandTotal: calc.grandTotal,
      dueDate: doc.dueDate,
    });
  }
  if (input.billTo) doc.billTo = input.billTo;
  if (input.shipTo) doc.shipTo = input.shipTo;
  if (input.dueDate) doc.dueDate = new Date(input.dueDate);
  if (input.terms !== undefined) doc.terms = input.terms;
  if (input.notes !== undefined) doc.notes = input.notes;

  await doc.save();
  return doc.toObject();
}

/** Archive. Hidden from the default list; visible to Admin+ or creator. Records who/when/reason. */
export async function archiveInvoice(actor: SessionUser, id: string, reason: string) {
  assertCan(actor.role, Permission.InvoiceArchive);
  await connectDb();
  const doc = await Invoice.findById(id);
  if (!doc) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, doc)) throw new Error('Forbidden: invoice not visible');
  if (doc.isDeleted) throw new Error('Deleted invoices cannot be archived');
  if (doc.isArchived) throw new Error('That invoice is already archived');
  doc.isArchived = true;
  doc.archivedBy = actor.userId as unknown as InvoiceDoc['archivedBy'];
  doc.archivedAt = new Date();
  doc.archiveReason = reason;
  await doc.save();
  return doc.toObject();
}

/**
 * Soft-delete. Invoices are never hard-deleted. A deleted invoice is hidden from
 * everyone (including its creator) and visible only to admins in the Deleted view.
 */
export async function deleteInvoice(actor: SessionUser, id: string, reason: string) {
  assertCan(actor.role, Permission.InvoiceDelete);
  await connectDb();
  const doc = await Invoice.findById(id);
  if (!doc) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, doc)) throw new Error('Forbidden: invoice not visible');
  // Deleting twice would overwrite who deleted it, when, and why — the audit trail this
  // soft delete exists to preserve.
  if (doc.isDeleted) throw new Error('That invoice is already deleted');
  doc.isDeleted = true;
  doc.deletedBy = actor.userId as unknown as InvoiceDoc['deletedBy'];
  doc.deletedAt = new Date();
  doc.deleteReason = reason;
  await doc.save();
  return doc.toObject();
}
