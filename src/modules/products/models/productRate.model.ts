import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * ProductRate — a per-customer negotiated price for one product. Its existence means "this
 * customer pays this rate for this product"; absence means they pay the product's default rate.
 *
 * Kept as its own collection (not embedded on Product or Customer) so the same row is the single
 * source of truth for both the product-side and the customer-side pricing views, and so a
 * customer with hundreds of negotiated products never bloats a single document.
 *
 * Overrides are hard-deleted (unlike products/customers): a removed override simply reverts the
 * customer to the default rate, and there is no audit value in keeping the stale number.
 */
const productRateSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    rate: { type: Number, required: true, min: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// One rate per (product, customer). Upserts key on this pair.
productRateSchema.index({ product: 1, customer: 1 }, { unique: true });

export type ProductRateDoc = InferSchemaType<typeof productRateSchema>;

export const ProductRate: Model<ProductRateDoc> =
  (models.ProductRate as Model<ProductRateDoc>) ??
  model<ProductRateDoc>('ProductRate', productRateSchema);
