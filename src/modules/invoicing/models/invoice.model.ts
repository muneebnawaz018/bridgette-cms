import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { InvoiceType, InvoiceState, Currency, PaymentMethod } from '../enums';

const { Schema, model, models } = mongoose;

const partySchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
  },
  { _id: false },
);

const itemSchema = new Schema(
  {
    description: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxable: { type: Boolean, default: true },
    discount: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true }, // server-computed
  },
  { _id: false },
);

const reminderSchema = new Schema(
  {
    // Minutes, not hours: the shortest useful reminder is a handful of minutes, and hours
    // would force fractions like 0.0833 to express that. Presets in the form cover the
    // range from 5 minutes to a week.
    thresholdMinutes: { type: Number },
    dueAt: { type: Date },
    sent: { type: Boolean, default: false },
    sentAt: { type: Date },
  },
  { _id: false },
);

const invoiceSchema = new Schema(
  {
    type: { type: String, enum: Object.values(InvoiceType), required: true, index: true },
    number: { type: String, required: true, unique: true, index: true },
    state: {
      type: String,
      enum: Object.values(InvoiceState),
      default: InvoiceState.Draft,
      index: true,
    },

    currency: { type: String, enum: Object.values(Currency), required: true },
    billTo: { type: partySchema, required: true },
    shipTo: { type: partySchema },
    items: { type: [itemSchema], default: [] },

    // Money (server-computed; rounded to 2dp).
    subtotal: { type: Number, default: 0 },
    shippingHandlingTariff: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    totalBeforeTax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 }, // stored per invoice — history never changes
    taxAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0 },
    applyTax: { type: Boolean, default: false }, // PK optional tax flag

    // Type-specific
    cashReceived: { type: Number },
    changeReturned: { type: Number },
    advancePayment: { type: Number },
    remainingBalance: { type: Number },

    paymentMethod: { type: String, enum: Object.values(PaymentMethod) },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date },
    terms: { type: String },
    notes: { type: String },

    reminder: { type: reminderSchema },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cancelledReason: { type: String },

    // Archive: hidden from the default list. Visible to Admin+ or the creator.
    isArchived: { type: Boolean, default: false, index: true },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    archivedAt: { type: Date },
    archiveReason: { type: String },

    // Soft-delete: invoices are never hard-deleted. A deleted invoice is hidden from
    // everyone and visible only to admins (InvoiceViewAllArchived) in the Deleted view.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deleteReason: { type: String },
  },
  { timestamps: true },
);

// Compound indexes matching the list/visibility query patterns.
invoiceSchema.index({ type: 1, state: 1, createdAt: -1 });
invoiceSchema.index({ createdBy: 1, isArchived: 1, createdAt: -1 });
invoiceSchema.index({ isDeleted: 1, isArchived: 1, createdAt: -1 }); // default/archived/deleted views
invoiceSchema.index({ dueDate: 1 }); // overdue sweeps + reminders
invoiceSchema.index({ 'billTo.name': 1 });

export type InvoiceDoc = InferSchemaType<typeof invoiceSchema>;

export const Invoice: Model<InvoiceDoc> =
  (models.Invoice as Model<InvoiceDoc>) ?? model<InvoiceDoc>('Invoice', invoiceSchema);
