import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';
import { InvoiceType } from '@/modules/invoicing/enums';

const { Schema } = mongoose;

/**
 * One structured address shape, used for both the billing and the shipping block. A factory
 * rather than a shared instance: mongoose binds a sub-schema to its parent path, so reusing the
 * same object in two places is asking for trouble.
 */
const addressPartsSchema = () =>
  new Schema(
    {
      // 'US' or 'PK'. Same field set either way; only the state list and the US-only +4 add-on
      // differ. Defaulted rather than left optional so an address always states its country — a
      // missing one used to read back as US and quietly relabel a PK address.
      country: { type: String, enum: ['US', 'PK'], default: 'US' },
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      // USPS two-letter code, e.g. 'CA'.
      state: { type: String, uppercase: true, trim: true },
      zip: { type: String },
      zipPlus4: { type: String },
    },
    { _id: false },
  );

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
    // Structured address (street / unit / city / state / ZIP+4). Built by a factory because the
    // shipping block below needs the identical shape — one definition, two uses, no drift.
    addressParts: { type: addressPartsSchema(), default: undefined },

    /*
     * Where goods go, when that is not where the bill goes. `sameAsBilling` is the normal case
     * and the default, in which case the name and address here stay empty and every reader falls
     * back to the billing party — storing a copy would go stale the moment the billing address
     * was corrected.
     */
    shipping: {
      type: new Schema(
        {
          sameAsBilling: { type: Boolean, default: true },
          name: { type: String },
          phone: { type: String },
          address: { type: String },
          addressParts: { type: addressPartsSchema(), default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // The products this customer buys. A plain ref array, so the catalogue a customer works
    // from is a fact on the customer record rather than something inferred from pricing rows.
    // Rate, discount and unit are read from the Product itself — never copied here, so editing
    // the catalogue is enough to change what an invoice offers.
    //
    // Separate from ProductRate, which stays the *exceptional* price for a customer: this
    // array answers "which products", a rate row answers "at what price, unusually".
    products: [{ type: Schema.Types.ObjectId, ref: 'Product', index: true }],

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

export const Customer: Model<CustomerDoc> = registerModel<CustomerDoc>('Customer', customerSchema);
