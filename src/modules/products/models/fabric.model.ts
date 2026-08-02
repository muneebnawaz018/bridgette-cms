import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

/**
 * Fabric — the material a product is made of (name, GSM, type). Kept in its own collection so the
 * same fabric can back many products and be corrected in one place.
 *
 * Like products, fabrics are shared company-wide and never hard-deleted: a removed fabric is
 * soft-deleted so products (and the invoices behind them) keep an intact audit trail.
 */
const fabricSchema = new Schema(
  {
    // No `index: true` here — the unique partial index below already covers { name: 1 }, and
    // declaring both makes Mongoose warn about a duplicate.
    name: { type: String, required: true },
    // Grams per square metre. Optional — not every fabric is spec'd by weight.
    gsm: { type: Number, min: 0 },
    // Free text (Knit, Woven, Fleece, …) rather than an enum: the mill's vocabulary changes
    // faster than a deploy does.
    type: { type: String },
    notes: { type: String },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deleteReason: { type: String },
  },
  { timestamps: true },
);

// Name is unique among live fabrics, so the picker never shows two identical entries.
fabricSchema.index({ name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
fabricSchema.index({ isDeleted: 1, name: 1 });

export type FabricDoc = InferSchemaType<typeof fabricSchema>;

export const Fabric: Model<FabricDoc> = registerModel<FabricDoc>('Fabric', fabricSchema);
