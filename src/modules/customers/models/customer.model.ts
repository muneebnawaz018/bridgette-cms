import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { InvoiceType } from '@/modules/invoicing/enums';

const { Schema, model, models } = mongoose;

/**
 * Customer — a reusable billing party. Admins maintain the record; every role reads it to fill
 * an invoice's `billTo`. Fields align with the invoice `partySchema` (name/email/phone/address)
 * so a customer can populate that block directly, plus `company` for the account name.
 *
 * Customers are shared company-wide (no per-user ownership scoping) and never hard-deleted — a
 * removed customer is soft-deleted so invoices that referenced it keep an intact audit trail.
 */
const customerSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    email: { type: String },
    phone: { type: String },
    company: { type: String },
    address: { type: String },
    notes: { type: String },

    // A reseller is tax-exempt: invoices raised for this customer charge no sales tax. Picking
    // the customer on an invoice auto-applies this instead of a per-invoice toggle.
    reseller: { type: Boolean, default: false },
    // The kind of invoice this customer is usually billed with, so picking them can set the
    // invoice type. Optional — leaving it blank means "no default".
    invoiceType: { type: String, enum: Object.values(InvoiceType) },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Soft-delete: hidden from every list, kept for referential history. Admins only.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deleteReason: { type: String },
  },
  { timestamps: true },
);

// List is name-sorted and search matches name/email/company; index the active set by name.
customerSchema.index({ isDeleted: 1, name: 1 });
customerSchema.index({ email: 1 });

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const Customer: Model<CustomerDoc> =
  (models.Customer as Model<CustomerDoc>) ?? model<CustomerDoc>('Customer', customerSchema);
