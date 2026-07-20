import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * One counter per (bucket key, time window). Mongo is the shared store so the limit holds
 * across instances and survives a restart, which an in-process counter cannot do.
 *
 * `expiresAt` carries a TTL index, so expired windows delete themselves and the collection
 * never needs sweeping.
 */
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

export const RateLimitCounter: Model<RateLimitDoc> =
  (models.RateLimitCounter as Model<RateLimitDoc>) ??
  model<RateLimitDoc>('RateLimitCounter', rateLimitSchema);
