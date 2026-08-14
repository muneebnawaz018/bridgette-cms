import mongoose, { type Model, type InferSchemaType } from 'mongoose';
import { registerModel } from '@/lib/db/registerModel';

const { Schema } = mongoose;

/**
 * A single-use link handed to a customer so they can fill in their own details instead of
 * dictating them to staff.
 *
 * `customer` is optional, and which way it goes is the whole difference between the two flows:
 *
 *  - Set, for someone already on file. Issuing a new link consumes the previous one, so a
 *    resend never leaves two working links out there for the same record.
 *  - Unset, for an open invitation. No customer exists yet; one is created from what they
 *    submit. A link can do this exactly once — it is consumed on submission — so a forwarded
 *    invitation can add one record, never a stream of them.
 *
 * Deliberately NOT part of the auth module's OtpToken, which keys on `userId` and grants a
 * session. This grants nothing but the right to submit one form, and keeping the two apart
 * means a scope mistake here can never become an authentication bug.
 */
const customerIntakeTokenSchema = new Schema(
  {
    /** The record this link belongs to. Null until an open invitation is filled in. */
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    /*
     * SHA-256 of the URL token, not bcrypt. The token arrives as the only identifier in the
     * request — there is no customer id to look the row up by first — so the hash has to be
     * queryable, which a per-row bcrypt salt makes impossible. Safe here precisely because the
     * token is 32 random bytes rather than a password: there is nothing to brute-force, and a
     * work factor would only protect against a guessing attack that cannot happen.
     */
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** When the invite email went out; null when staff only copied the link (WhatsApp etc.). */
    emailedAt: { type: Date, default: null },
    emailedTo: { type: String },
  },
  { timestamps: true },
);

// Mongo reaps expired rows on its own — an intake link has no value past its expiry, and the
// consumed ones are equally dead weight once the submission itself records what happened.
customerIntakeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type CustomerIntakeTokenDoc = InferSchemaType<typeof customerIntakeTokenSchema>;

export const CustomerIntakeToken: Model<CustomerIntakeTokenDoc> =
  registerModel<CustomerIntakeTokenDoc>('CustomerIntakeToken', customerIntakeTokenSchema);
