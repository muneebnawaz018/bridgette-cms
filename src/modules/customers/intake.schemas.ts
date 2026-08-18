import { z } from 'zod';
import { canBeReseller } from './invoiceType';
import { addressPartsSchema, shippingSchema } from './schemas';

/**
 * What a customer may send through their own intake link.
 *
 * Its own schema rather than a reuse of `customerUpdateSchema`, because the difference between
 * the two IS the security boundary. The admin schema accepts `products`, `productDiscounts`,
 * `invoiceType` and internal `notes`; this one cannot be allowed to, and deriving it by picking
 * fields off the admin schema would silently start accepting whatever gets added there later.
 * Listing the writable set explicitly means new admin fields are closed by default.
 */

const FIELD_MAX = 200;
const ADDRESS_MAX = 500;
const NOTE_MAX = 2000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'That value is too long')
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * The certificate decides whether this customer is charged sales tax, so "a valid file" has to
 * mean more than "some bytes arrived".
 *
 * 5MB, measured on the decoded payload rather than the data URL: base64 inflates by a third, so
 * a limit read off the string would let a 6.6MB file through. The document lands inline in a
 * Mongo record (see the customer model), and Mongo's own ceiling is 16MB.
 */
const MAX_CERT_BYTES = 5 * 1024 * 1024;

/** What a reseller certificate plausibly is: a scan, a photo, a PDF, or a Word document. */
const ALLOWED_CERT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/**
 * First bytes of each accepted format, so the declared MIME type is checked against what the
 * file actually is. Without this, `contentType` is just a string the client chose, and "upload a
 * certificate to become tax-exempt" would accept an empty text file relabelled as a PDF.
 *
 * Word's .docx is a zip (PK\x03\x04) and .doc an OLE compound file; both are listed by their
 * real signature rather than their extension.
 */
const MAGIC: Record<string, readonly number[][]> = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  // RIFF....WEBP — the 4 size bytes in between are skipped by the matcher below.
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  // ftypheic/ftypheix live at offset 4; the check below looks for 'ftyp' there.
  'image/heic': [[0x66, 0x74, 0x79, 0x70]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
};

/** Offset the signature is expected at. HEIC's `ftyp` box starts 4 bytes in. */
const MAGIC_OFFSET: Record<string, number> = { 'image/heic': 4 };

interface DecodedCert {
  bytes: Buffer;
  declaredType: string;
}

/** Split a `data:<mime>;base64,<payload>` URL. Returns null for anything else. */
function decodeDataUrl(value: string): DecodedCert | null {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  const [, declaredType, isBase64, payload] = match;
  if (!isBase64) return null;
  try {
    return { bytes: Buffer.from(payload, 'base64'), declaredType: declaredType.toLowerCase() };
  } catch {
    return null;
  }
}

function magicMatches(bytes: Buffer, contentType: string): boolean {
  const signatures = MAGIC[contentType];
  if (!signatures) return false;
  const offset = MAGIC_OFFSET[contentType] ?? 0;
  return signatures.some((sig) => sig.every((byte, i) => bytes[offset + i] === byte));
}

/**
 * The uploaded certificate. Rejected unless it decodes, is within the size cap, declares an
 * accepted type, and its bytes agree with that type.
 */
export const intakeCertificateSchema = z
  .object({
    data: z.string().min(1, 'Attach the certificate file'),
    name: optionalText(255),
    contentType: optionalText(120),
    size: z.number().nonnegative().optional(),
  })
  .superRefine((cert, ctx) => {
    const decoded = decodeDataUrl(cert.data);
    if (!decoded) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'That file could not be read. Try uploading it again.',
      });
      return;
    }

    if (decoded.bytes.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'That file is empty' });
      return;
    }

    if (decoded.bytes.length > MAX_CERT_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'That file is larger than 5MB',
      });
      return;
    }

    // The URL's own type is what the bytes are checked against; a `contentType` field disagreeing
    // with it is the exact mislabelling this guards.
    const type = decoded.declaredType;
    if (!(ALLOWED_CERT_TYPES as readonly string[]).includes(type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'Upload an image, a PDF, or a Word document',
      });
      return;
    }

    if (!magicMatches(decoded.bytes, type)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['data'],
        message: 'That file does not look like a valid document. Try exporting it again.',
      });
    }
  });

/**
 * The submission itself. Note what is absent and stays absent: `products`, `productDiscounts`,
 * `invoiceType`, `notes`, and `reseller` as a free-standing flag — the exemption follows from a
 * certificate that passed the checks above, never from a field the form can set on its own.
 */
export const customerIntakeSubmitSchema = z
  .object({
    firstName: optionalText(FIELD_MAX),
    lastName: optionalText(FIELD_MAX),
    name: optionalText(FIELD_MAX),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'An email is required')
      .email('Enter a valid email address'),
    /*
     * Required, unlike most of this form. An invoice that needs chasing is chased by phone far
     * more often than by email, and this is the one moment the customer is in front of the
     * question — going back for it later costs a round of messages.
     */
    phone: z
      .string()
      .trim()
      .min(1, 'A phone number is required')
      .max(FIELD_MAX, 'That value is too long'),
    address: optionalText(ADDRESS_MAX),
    addressParts: addressPartsSchema,
    shipping: shippingSchema.optional(),
    customerNote: optionalText(NOTE_MAX),
    resellerCertificate: intakeCertificateSchema.optional(),
  })
  /*
   * A resale certificate only means something against US sales tax, so a Pakistani address and a
   * certificate cannot both be true. The form hides the upload once Pakistan is picked; this is
   * what makes that a rule rather than a UI courtesy, since the payload is the customer's to
   * shape. The submission is refused outright instead of quietly dropping the file: somebody who
   * attached one and got billed Pakistani tax anyway would have no idea why.
   */
  .superRefine((input, ctx) => {
    if (input.resellerCertificate && !canBeReseller(input.addressParts?.country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resellerCertificate', 'data'],
        message: 'Resale certificates apply to US addresses only',
      });
    }
  });

export type CustomerIntakeSubmitInput = z.infer<typeof customerIntakeSubmitSchema>;

export { MAX_CERT_BYTES, ALLOWED_CERT_TYPES };
