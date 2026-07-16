import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jti: { type: String, required: true, unique: true }, // matches the token's jti claim
    tokenHash: { type: String, required: true }, // hashed token value
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    // Why the token was revoked: 'logout' (normal sign-out) vs intentional 'revoked' /
    // 'password' / 'admin'. Only the intentional ones surface in the sessions audit list.
    revokedReason: { type: String, default: null },
    userAgent: { type: String },
    ip: { type: String },
    location: { type: String }, // "City, Region, Country" resolved from ip (best-effort)
  },
  { timestamps: true },
);

// Auto-purge expired tokens.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema>;

export const RefreshToken: Model<RefreshTokenDoc> =
  (models.RefreshToken as Model<RefreshTokenDoc>) ??
  model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
