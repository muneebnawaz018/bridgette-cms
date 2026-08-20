import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

/** Same shape the customer record keeps, so the two always describe an address the same way. */
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
 * What a customer submitted through their invitation, exactly as it arrived.
 *
 * The customer record it created carries the same details, so this is not how the app reads
 * them — it is the evidence behind them. A submission is what somebody asserted on a given day,
 * from a given address, with a given certificate attached; later edits to the customer would
 * destroy that, and a tax exemption in particular has to stay traceable to the document that
 * justified it.
 */
const customerIntakeSchema = new Schema(
  {
    /** The customer this submission created, stamped after the insert rather than before it. */
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    /** The token row this came through, so a submission is traceable to who invited whom. */
    token: { type: Schema.Types.ObjectId, ref: 'CustomerIntakeToken', required: true },

    // ---- What the form asks for. Nothing outside this list is accepted from it. ----
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
    /** The teams they named, kept with the rest of what they said. */
    teams: [{ type: String }],
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

    /** Where it came from. Kept for the audit trail behind a tax exemption. */
    submittedIp: { type: String },
    submittedUserAgent: { type: String },
  },
  { timestamps: true },
);

// Read one way only: what did this customer send, newest first.
customerIntakeSchema.index({ customer: 1, createdAt: -1 });

export type CustomerIntakeDoc = InferSchemaType<typeof customerIntakeSchema>;

export const CustomerIntake: Model<CustomerIntakeDoc> = registerModel<CustomerIntakeDoc>(
  'CustomerIntake',
  customerIntakeSchema,
);
