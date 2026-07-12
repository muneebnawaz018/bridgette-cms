import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { Currency, PaymentMethod } from '@/modules/invoicing/enums';

const { Schema, model, models } = mongoose;

const paymentSchema = new Schema(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, enum: Object.values(Currency), required: true },
    method: { type: String, enum: Object.values(PaymentMethod), required: true },
    reference: { type: String },
    account: { type: String },
    notes: { type: String },
    paidAt: { type: Date, default: Date.now },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

paymentSchema.index({ invoiceId: 1, paidAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;

export const Payment: Model<PaymentDoc> =
  (models.Payment as Model<PaymentDoc>) ?? model<PaymentDoc>('Payment', paymentSchema);
