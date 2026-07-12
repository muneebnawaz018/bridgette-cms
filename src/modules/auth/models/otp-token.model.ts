import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { OtpPurpose } from '../enums';

const { Schema, model, models } = mongoose;

const otpTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: Object.values(OtpPurpose), required: true },
    codeHash: { type: String, required: true }, // hashed OTP / token
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

otpTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpTokenDoc = InferSchemaType<typeof otpTokenSchema>;

export const OtpToken: Model<OtpTokenDoc> =
  (models.OtpToken as Model<OtpTokenDoc>) ?? model<OtpTokenDoc>('OtpToken', otpTokenSchema);
