import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { Currency, PaymentMethod } from '@/modules/invoicing/enums';

const { Schema, model, models } = mongoose;

// Proof of payment — a client-compressed JPEG kept as a base64 data URL. Stored inline rather
// than in external object storage: this app has none configured, and a bounded (~3MB) image per
// payment sits comfortably within a Mongo document.
const proofSchema = new Schema(
  {
    data: { type: String, required: true },
    name: { type: String },
    contentType: { type: String },
    size: { type: Number },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: Object.values(Currency), required: true },
    method: { type: String, enum: Object.values(PaymentMethod), required: true },
    reference: { type: String },
    account: { type: String },
    notes: { type: String },
    // Method-specific fields, keyed as in PAYMENT_METHOD_FIELDS. Free-form object rather than a
    // column per possibility; only ever written whole at creation, never patched.
    details: { type: Schema.Types.Mixed },
    proof: { type: proofSchema },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

paymentSchema.index({ invoiceId: 1, paidAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;

export const Payment: Model<PaymentDoc> =
  (models.Payment as Model<PaymentDoc>) ?? model<PaymentDoc>('Payment', paymentSchema);
