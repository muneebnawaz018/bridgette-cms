import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Invoice, InvoiceState } from '@/modules/invoicing';
import { canViewInvoice } from '@/modules/invoicing/visibility';
import { Shipment, type ShipmentDoc } from '../models/shipment.model';
import type { ShipmentInput } from '../schemas';

/**
 * Shipping details for an invoice: add, edit, read. Every entry point resolves the invoice first
 * and applies the invoice's own visibility rule, so a shipment is never reachable by anyone who
 * could not open the invoice it belongs to.
 */

/** A bare `YYYY-MM-DD` stored at UTC midnight, so the day never shifts on the way back out. */
function toDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/**
 * The invoice this shipment hangs off, checked for visibility. `write` additionally refuses the
 * invoices nothing should ship against:
 *
 * - Archived and deleted are history, and history does not gain a new tracking number. Same
 *   rule payments apply, for the same reason.
 * - A draft is not an order yet. It carries no commitment to the customer and can still change
 *   its lines, its totals, even the customer it bills, so goods leaving against one would be a
 *   consignment against a document that does not exist. Finalising it is what makes it real.
 */
async function invoiceFor(actor: SessionUser, invoiceId: string, write: boolean) {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, invoice)) throw new Error('Forbidden: invoice not visible');
  if (write) {
    if (invoice.isDeleted) throw new Error('Cannot change shipping on a deleted invoice');
    if (invoice.isArchived) throw new Error('Cannot change shipping on an archived invoice');
    if (invoice.state === InvoiceState.Draft) {
      throw new Error('Finalize this invoice before recording shipping');
    }
  }
  return invoice;
}

/**
 * The invoice's shipment, or null when nothing has shipped yet. Null rather than a 404: "not
 * shipped" is an ordinary answer the dialog renders as its add form, not a failure.
 */
export async function getShipment(
  actor: SessionUser,
  invoiceId: string,
): Promise<ShipmentDoc | null> {
  assertCan(actor.role, Permission.ShipmentView);
  await connectDb();
  await invoiceFor(actor, invoiceId, false);
  return Shipment.findOne({ invoiceId }).lean<ShipmentDoc>();
}

/** Record shipping details against an invoice that has none yet. */
export async function createShipment(
  actor: SessionUser,
  invoiceId: string,
  input: ShipmentInput,
): Promise<ShipmentDoc> {
  assertCan(actor.role, Permission.ShipmentManage);
  await connectDb();
  await invoiceFor(actor, invoiceId, true);

  try {
    const doc = await Shipment.create({
      invoiceId,
      trackingId: input.trackingId,
      agent: input.agent,
      shippedAt: toDay(input.shippedAt),
      eta: input.eta ? toDay(input.eta) : undefined,
      createdBy: actor.userId,
    });
    return doc.toObject();
  } catch (err) {
    // Two people adding shipping to the same invoice at once: the unique index on invoiceId
    // decides it, and the loser is told to reopen rather than shown a raw driver error.
    if (isDuplicateKey(err)) {
      throw new Error('This invoice already has shipping details — reopen them to edit');
    }
    throw err;
  }
}

/**
 * Replace an invoice's shipping details. All four fields are applied, blanks included, so
 * clearing the ETA in the form clears the stored one.
 */
export async function updateShipment(
  actor: SessionUser,
  invoiceId: string,
  input: ShipmentInput,
): Promise<ShipmentDoc> {
  assertCan(actor.role, Permission.ShipmentManage);
  await connectDb();
  await invoiceFor(actor, invoiceId, true);

  // One atomic write rather than read-modify-write, and $unset spelled out: a cleared ETA has
  // to leave the document, not be written back as an undefined the driver quietly drops.
  const doc = await Shipment.findOneAndUpdate(
    { invoiceId },
    {
      $set: {
        trackingId: input.trackingId,
        agent: input.agent,
        shippedAt: toDay(input.shippedAt),
        updatedBy: actor.userId,
        ...(input.eta ? { eta: toDay(input.eta) } : {}),
      },
      ...(input.eta ? {} : { $unset: { eta: 1 } }),
    },
    { new: true },
  ).lean<ShipmentDoc>();
  if (!doc) throw new Error('This invoice has no shipping details yet');
  return doc;
}
