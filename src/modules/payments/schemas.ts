import { z } from 'zod';
import { PaymentMethod } from '@/modules/invoicing/enums';
import { proofRequired, MAX_PROOF_BYTES } from './methodFields';

/**
 * An attached proof of payment: a compressed image, stored as a base64 data URL.
 *
 * Both the data-URL mime and the declared `contentType` are pinned to a raster-image
 * allowlist. Without that, `data:text/html;…` or a scriptable `image/svg+xml` passed the old
 * `startsWith('data:')` check, got stored verbatim, and the proof route served them back
 * inline — stored XSS on the app origin the moment someone opened the proof. The client only
 * ever produces JPEG, so this rejects nothing a real upload sends.
 */
const PROOF_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|heic);base64,[A-Za-z0-9+/]+=*$/i;
const PROOF_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/heic',
]);
const proofSchema = z.object({
  data: z.string().min(1).regex(PROOF_DATA_URL, 'Proof must be a PNG, JPEG, WEBP, GIF or HEIC image'),
  name: z.string().min(1).max(200),
  contentType: z
    .string()
    .min(1)
    .max(100)
    .refine((t) => PROOF_CONTENT_TYPES.has(t.toLowerCase()), 'Unsupported image type'),
  size: z.number().int().nonnegative(),
});

export const recordPaymentSchema = z
  .object({
    amount: z.number().positive('Amount must be greater than zero'),
    method: z.nativeEnum(PaymentMethod),
    reference: z.string().optional(),
    account: z.string().optional(),
    notes: z.string().max(2000).optional(),
    paidAt: z.string().datetime().optional(),
    allowOverpay: z.boolean().optional(),
    /** Method-specific fields, keyed as in PAYMENT_METHOD_FIELDS. */
    details: z.record(z.string().max(500)).optional(),
    proof: proofSchema.optional(),
  })
  // Proof is mandatory for every method except cash.
  .refine((v) => !proofRequired(v.method) || Boolean(v.proof), {
    message: 'A proof of payment is required for this method',
    path: ['proof'],
  })
  // Guard the stored size against a client that lies about `size`: the base64 string itself is
  // the real cost. ~1.4x covers base64 overhead plus the data-URL prefix.
  .refine((v) => !v.proof || v.proof.data.length <= Math.ceil(MAX_PROOF_BYTES * 1.4), {
    message: 'The proof image is too large',
    path: ['proof'],
  });

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
