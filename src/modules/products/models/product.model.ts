import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * Product — a catalogue item with a default USD rate. Per-customer negotiated rates are NOT
 * stored here; they live in the ProductRate collection so pricing stays decoupled from the
 * catalogue. Admins maintain products; every role reads them to fill invoice lines.
 *
 * Products are shared company-wide and never hard-deleted — a removed product is soft-deleted so
 * invoices that referenced it keep an intact audit trail.
 */
const productSchema = new Schema(
  {
    name: { type: String, required: true, index: true },
    // Optional. Unique among live products that HAVE one (partial index below); products with no
    // SKU store the field as undefined so they are simply left out of the unique index.
    sku: { type: String },
    defaultRate: { type: Number, required: true, min: 0 },
    unit: { type: String },
    // The material this product is made of. Optional so the catalogue predating fabrics stays
    // valid; a soft-deleted fabric leaves the ref in place (reads filter it out).
    fabric: { type: Schema.Types.ObjectId, ref: 'Fabric', index: true },
    description: { type: String },
    notes: { type: String },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deletedAt: { type: Date },
    deleteReason: { type: String },
  },
  { timestamps: true },
);

// SKU is unique among live products that have one. The `$exists` guard keeps SKU-less products
// (undefined) out of the index entirely, so any number of them coexist without colliding; a
// soft-deleted SKU also drops out, so it can be reused.
productSchema.index(
  { sku: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, sku: { $exists: true } } },
);
productSchema.index({ isDeleted: 1, name: 1 });

export type ProductDoc = InferSchemaType<typeof productSchema>;

export const Product: Model<ProductDoc> =
  (models.Product as Model<ProductDoc>) ?? model<ProductDoc>('Product', productSchema);
