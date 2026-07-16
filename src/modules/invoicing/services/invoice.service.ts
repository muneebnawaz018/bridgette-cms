import 'server-only';
import type { PipelineStage } from 'mongoose';
import { connectDb } from '@/lib/db/connection';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Invoice, type InvoiceDoc } from '../models/invoice.model';
import { InvoiceState, DEFAULT_CURRENCY } from '../enums';
import { computePaymentState } from '../state';
import { calcInvoice } from '../calc';
import { issueInvoiceNumber } from '../numbering';
import { invoiceVisibilityFilter, canViewInvoice } from '../visibility';
import type { CreateInvoiceInput, UpdateInvoiceInput, ListInvoiceInput } from '../schemas';

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

/** Paginated, role-scoped invoice list. */
export async function listInvoices(
  actor: SessionUser,
  query: ListInvoiceInput,
): Promise<Paginated<InvoiceDoc>> {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

  const match: Record<string, unknown> = { ...invoiceVisibilityFilter(actor, query.view) };
  if (query.type) match.type = query.type;
  if (query.search) {
    const rx = new RegExp(query.search.trim(), 'i');
    match.$and = [{ $or: [{ number: rx }, { 'billTo.name': rx }, { 'billTo.email': rx }] }];
  }

  // Project only what the list UI needs — drop the heavy items[] array from the payload.
  const stages: PipelineStage[] = [
    { $match: match },
    {
      $project: {
        number: 1,
        type: 1,
        state: 1,
        currency: 1,
        grandTotal: 1,
        balanceDue: 1,
        isArchived: 1,
        isDeleted: 1,
        createdBy: 1,
        createdAt: 1,
        'billTo.name': 1,
        'billTo.email': 1,
      },
    },
  ];
  return aggregatePaginate<InvoiceDoc>(Invoice, stages, {
    page: query.page,
    limit: query.limit,
  });
}

export interface TypeTotals {
  count: number;
  invoiced: number;
  outstanding: number;
}
export interface InvoiceStats {
  total: number;
  byState: Record<string, number>;
  byType: Record<string, TypeTotals>; // { tax: {...}, cash: {...}, pk: {...} }
}

const round2 = (n: number) => Math.round((n ?? 0) * 100) / 100;

/** Aggregated dashboard stats over the invoices this user may see (split by invoice type). */
export async function getInvoiceStats(actor: SessionUser): Promise<InvoiceStats> {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

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
        state: [{ $group: { _id: '$state', count: { $sum: 1 } } }],
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

  return { total: row?.total?.[0]?.n ?? 0, byState, byType };
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
  if (doc.isDeleted) throw new Error('Deleted invoices cannot be archived');
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
  doc.isDeleted = true;
  doc.deletedBy = actor.userId as unknown as InvoiceDoc['deletedBy'];
  doc.deletedAt = new Date();
  doc.deleteReason = reason;
  await doc.save();
  return doc.toObject();
}
