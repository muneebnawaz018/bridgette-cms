import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

/**
 * Where an invoice's goods went: one shipment per invoice.
 *
 * An invoice is a single order that leaves in a single consignment, so this is a 1:1 record
 * rather than a ledger like payments — there is one tracking number to chase, not a list of
 * them. That is enforced by the unique index on `invoiceId`, so two people opening the dialog
 * at once cannot end up with two shipments against the same invoice.
 *
 * Kept out of the invoice document on purpose: an invoice is a financial record that must not
 * change once finalized, and shipping details are edited freely afterwards (an agent updates an
 * ETA, a tracking number is corrected). Separate documents keep those edits away from the money.
 */
const shipmentSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, unique: true },
    /** The carrier's tracking number. Free text — every agent formats theirs differently. */
    trackingId: { type: String, required: true, trim: true },
    /** Who is carrying it: the courier / forwarding agent, as typed. */
    agent: { type: String, required: true, trim: true },
    /**
     * Calendar days, stored at UTC midnight. Neither of these is an instant — nobody records
     * the minute a parcel was handed over — so they are written from the bare `YYYY-MM-DD` the
     * date picker emits and read back the same way, which keeps the day stable regardless of
     * the reader's timezone.
     */
    shippedAt: { type: Date, required: true },
    /** Expected arrival. Optional: a booking often has no date from the agent yet. */
    eta: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type ShipmentDoc = InferSchemaType<typeof shipmentSchema>;

export const Shipment: Model<ShipmentDoc> = registerModel<ShipmentDoc>('Shipment', shipmentSchema);
