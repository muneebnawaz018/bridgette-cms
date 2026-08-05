import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

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
    /*
     * Both halves of "what this customer pays for this product", and both optional: a row may
     * carry a negotiated rate, a negotiated discount, or one of each. A row with neither is
     * meaningless and is deleted rather than stored.
     */
    rate: { type: Number, min: 0 },
    /*
     * Percentage off this product for this customer. Takes precedence over the product's own
     * standing discount when a line is added to an invoice; absent means the product default
     * applies. Zero is a real value here and means "no discount for this customer", which is
     * not the same as having no opinion.
     */
    discountPercent: { type: Number, min: 0, max: 100 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// One rate per (product, customer). Upserts key on this pair.
productRateSchema.index({ product: 1, customer: 1 }, { unique: true });

export type ProductRateDoc = InferSchemaType<typeof productRateSchema>;

export const ProductRate: Model<ProductRateDoc> = registerModel<ProductRateDoc>(
  'ProductRate',
  productRateSchema,
);
