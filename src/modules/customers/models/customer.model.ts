import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { InvoiceType } from '@/modules/invoicing/enums';

const { Schema, model, models } = mongoose;

/**
 * Customer — a reusable billing party. Admins maintain the record; every role reads it to fill
 * an invoice's `billTo`. Fields align with the invoice `partySchema` (name/email/phone/address)
 * so a customer can populate that block directly.
 *
 * Customers are shared company-wide (no per-user ownership scoping) and never hard-deleted — a
 * removed customer is soft-deleted so invoices that referenced it keep an intact audit trail.
 */
const customerSchema = new Schema(
  {
    // Full name — kept as the single field invoices and every picker read. It is derived from
    // firstName/lastName when those are given, so the two stay in step without every consumer
    // having to join them.
    name: { type: String, required: true, index: true },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    phone: { type: String },
    // The printable one-line address invoices use. Derived from `addressParts` whenever those
    // are filled in, so the two can never drift; still writable on its own for records that
    // predate the structured form.
    address: { type: String },
    // Structured US address (street / unit / city / state / ZIP+4).
    addressParts: {
      type: new Schema(
        {
          // 'US' (the default) or 'PK'. Same field set either way; only the state list and the
          // US-only +4 add-on differ. Absent on rows that predate the field = US.
          country: { type: String, enum: ['US', 'PK'] },
          line1: { type: String },
          line2: { type: String },
          city: { type: String },
          // USPS two-letter code, e.g. 'CA'.
          state: { type: String, uppercase: true, trim: true },
          zip: { type: String },
          zipPlus4: { type: String },
        },
        { _id: false },
      ),
      default: undefined,
    },
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

// List is name-sorted and search matches name/email; index the active set by name.
customerSchema.index({ isDeleted: 1, name: 1 });

// One live customer per email address. Partial, on three counts: a soft-deleted record must not
// block re-adding that customer later, legacy rows saved before email was mandatory carry no
// email at all, and a plain unique index would treat every one of those missing values as the
// same null and collide. Values are lower-cased in the schema so the comparison is meaningful.
customerSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false, email: { $type: 'string', $gt: '' } },
  },
);

export type CustomerDoc = InferSchemaType<typeof customerSchema>;

export const Customer: Model<CustomerDoc> =
  (models.Customer as Model<CustomerDoc>) ?? model<CustomerDoc>('Customer', customerSchema);
