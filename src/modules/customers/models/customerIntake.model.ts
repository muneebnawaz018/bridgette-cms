import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

/** Same shape the customer record keeps, so an approved field copies across unchanged. */
const addressPartsSchema = () =>
  new Schema(
    {
      country: { type: String, enum: ['US', 'PK'], default: 'US' },
      line1: { type: String },
      line2: { type: String },
      city: { type: String },
      state: { type: String, uppercase: true, trim: true },
      zip: { type: String },
      zipPlus4: { type: String },
    },
    { _id: false },
  );

/**
 * What a customer submitted through their intake link — held as a proposal, not applied.
 *
 * Stored separately from the Customer rather than written straight onto it, for two reasons: a
 * forwarded link must not be able to silently overwrite an address staff have already verified,
 * and a submission is evidence of what the customer asserted on a given day, which an in-place
 * update would destroy.
 *
 * The one exception is the reseller certificate, which applies on submission — see the service.
 * Even then the file and the claim are recorded here, so the exemption can be traced back to the
 * document that justified it.
 */
const customerIntakeSchema = new Schema(
  {
    /*
     * Set once the submission has a record to belong to. For an open invitation that is the
     * customer this submission created, stamped after the insert rather than before it.
     */
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    /** The token row this came through, so a submission is traceable to who invited whom. */
    token: { type: Schema.Types.ObjectId, ref: 'CustomerIntakeToken', required: true },

    // ---- The customer-writable set. Nothing outside this list is accepted from the form. ----
    name: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    addressParts: { type: addressPartsSchema(), default: undefined },
    shipping: {
      type: new Schema(
        {
          sameAsBilling: { type: Boolean, default: true },
          name: { type: String },
          phone: { type: String },
          address: { type: String },
          addressParts: { type: addressPartsSchema(), default: undefined },
        },
        { _id: false },
      ),
      default: undefined,
    },
    /*
     * The customer's own message — kept apart from `customer.notes`, which is an internal staff
     * field. Merging the two would put private remarks in front of the customer and let them
     * overwrite what staff had written.
     */
    customerNote: { type: String },

    resellerCertificate: {
      type: new Schema(
        {
          data: { type: String, required: true },
          name: { type: String },
          contentType: { type: String },
          size: { type: Number },
        },
        { _id: false },
      ),
      default: undefined,
    },
    /** Whether this submission is what turned the customer's exemption on. */
    setReseller: { type: Boolean, default: false },

    // ---- Review ----
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    /*
     * How this submission was handled.
     *
     * An open invitation creates the customer from what arrived, so there is nothing for staff
     * to approve — there was no prior value to overwrite, which is the only thing approval
     * protects. Those land already applied, and this says so.
     */
    createdCustomer: { type: Boolean, default: false },
    /** Which fields staff accepted, so a partial approval records what it took. */
    appliedFields: [{ type: String }],
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },

    /** Where it came from. Kept for the audit trail behind a tax exemption. */
    submittedIp: { type: String },
    submittedUserAgent: { type: String },
  },
  { timestamps: true },
);

// The review screen asks "anything pending for this customer?" on every customer it opens.
customerIntakeSchema.index({ customer: 1, status: 1, createdAt: -1 });

export type CustomerIntakeDoc = InferSchemaType<typeof customerIntakeSchema>;

export const CustomerIntake: Model<CustomerIntakeDoc> = registerModel<CustomerIntakeDoc>(
  'CustomerIntake',
  customerIntakeSchema,
);
