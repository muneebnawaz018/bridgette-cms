import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { env } from '@/lib/config/env';
import { Permission, assertCan, Role, UserStatus, User, type SessionUser } from '@/modules/auth';
import { sendMail } from '@/lib/email/mailer';
import { customerIntakeEmail, resellerSetByIntakeEmail } from '@/lib/email/templates';
import { FieldError } from '@/lib/api/errors';
import { COMPANY_CONTACT_US, companyContactFor } from '@/modules/legal/company';
import { Customer } from '../models/customer.model';
import { CustomerIntakeToken } from '../models/customerIntakeToken.model';
import { CustomerIntake } from '../models/customerIntake.model';
import { formatAddress, isBlankAddress } from '../address';
import { canBeReseller, invoiceTypeFor } from '../invoiceType';
import type { CustomerIntakeSubmitInput } from '../intake.schemas';
import { INTAKE_TTL_DAYS } from '../intake.constants';

export { INTAKE_TTL_DAYS };

/**
 * What somebody sees when the address they typed already belongs to a customer.
 *
 * Short, because it is read as a toast across the top of the page. The email box carries the
 * second line, where there is room to say what to do about it — which is also where the reader
 * is already looking once they know it is the email that is wrong.
 */
const ALREADY_ON_FILE = () =>
  new FieldError(
    'email',
    'That email address is already registered with any other user',
    `This email is already used by another customer. Enter a different one, or email ${COMPANY_CONTACT_US.email} for help.`,
  );

/** Mongo's unique-index violation. */
function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/** SHA-256, hex. See the token model for why this is not bcrypt. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Building and sending the invitation, kept in one place. */
async function deliverInvite(args: {
  to: string;
  url: string;
  tokenId: string;
  customerName?: string;
}): Promise<boolean> {
  const mail = customerIntakeEmail({
    customerName: args.customerName,
    link: args.url,
    expiresInDays: INTAKE_TTL_DAYS,
    /*
     * From the US entity. An invitation goes out before there is a record, so there is no
     * country to pick an office from — the form is where they tell us where they are.
     */
    company: companyContactFor(undefined),
  });

  try {
    await sendMail({ to: args.to, ...mail });
    await CustomerIntakeToken.updateOne(
      { _id: args.tokenId },
      { $set: { emailedAt: new Date(), emailedTo: args.to } },
    );
    return true;
  } catch (err) {
    logger.error('customer intake email failed', {
      tokenId: args.tokenId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Email a link that already exists, to an address staff type in.
 *
 * The token travels back from the client rather than being looked up, because only its hash is
 * stored — there is no way to rebuild a URL server-side. It is verified here all the same: the
 * hash must match a live, unconsumed row, so a caller cannot have this send an arbitrary string.
 *
 * The address is used for delivery and nothing else. It is deliberately NOT written to
 * `customer.email`: this is where the invitation goes, which is often a shared inbox or whoever
 * asked for the link, while the billing address is one of the things the customer is being asked
 * to supply. Writing it here would quietly answer a question we are still asking. The token row
 * keeps it, so there is a record of where the invite was sent.
 */
export async function emailExistingIntakeLink(
  actor: SessionUser,
  token: string,
  to: string,
  greetName?: string,
) {
  assertCan(actor.role, Permission.CustomerEdit);
  await connectDb();

  const row = await CustomerIntakeToken.findOne({
    tokenHash: hashToken(token),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean<{ _id: unknown } | null>();
  if (!row) throw new Error('That link has expired or has already been used. Create a new one.');

  const sent = await deliverInvite({
    to,
    url: `${env.appUrl}/intake/${token}`,
    tokenId: String(row._id),
    // The only name anybody has at this point: the customer states their own on the form.
    customerName: greetName?.trim() || undefined,
  });
  if (!sent) throw new Error('The email could not be sent. Copy the link and share it instead.');

  logger.info('customer intake link emailed', {
    tokenId: String(row._id),
    by: actor.userId,
  });
  return { sent: true, to };
}

/**
 * Mint an invitation — a one-time link for somebody who is not in the system yet.
 *
 * The only kind of link there is. A customer is either typed in by staff or created by answering
 * one of these; a record already on file is never sent one, so nothing a stranger submits can
 * reach a customer somebody already verified.
 *
 * Creates no customer. The record is written when they submit, from what they actually tell us,
 * so clicking "Invite" never leaves a half-empty row for staff to clean up and a link nobody
 * answers costs nothing but a token that expires on its own.
 *
 * A link creates at most one customer: it is consumed on submission, so an invitation that gets
 * forwarded adds one record, not a stream of them.
 */
export async function issueOpenInvite(actor: SessionUser) {
  assertCan(actor.role, Permission.CustomerCreate);
  await connectDb();

  const token = randomBytes(32).toString('base64url');
  const doc = await CustomerIntakeToken.create({
    customer: null,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INTAKE_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdBy: actor.userId,
  });

  logger.info('open customer invitation issued', { tokenId: String(doc._id), by: actor.userId });

  return {
    tokenId: String(doc._id),
    url: `${env.appUrl}/intake/${token}`,
    expiresAt: doc.expiresAt,
  };
}

interface OpenIntake {
  tokenId: string;
}

/**
 * Check that a token opens something, or return null.
 *
 * Nothing about anybody comes back. An invitation belongs to no record until it is answered, and
 * a link that is forwarded, or found in a shared inbox, must not be a way to read one.
 */
export async function openIntake(token: string): Promise<OpenIntake | null> {
  await connectDb();
  const row = await CustomerIntakeToken.findOne({ tokenHash: hashToken(token) });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return { tokenId: String(row._id) };
}

/** The printable one-liner, derived the same way the admin path derives it. */
function printable(parts: CustomerIntakeSubmitInput['addressParts'], fallback?: string) {
  return isBlankAddress(parts) ? fallback : formatAddress(parts);
}

function shippingBlock(input: CustomerIntakeSubmitInput) {
  const ship = input.shipping;
  if (!ship || ship.sameAsBilling !== false) return { sameAsBilling: true };
  const parts = isBlankAddress(ship.addressParts) ? undefined : ship.addressParts;
  return {
    sameAsBilling: false,
    name: ship.name,
    phone: ship.phone,
    addressParts: parts,
    address: parts ? formatAddress(parts) : undefined,
  };
}

export interface SubmitIntakeMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * Tell the admins a customer just made themselves tax-exempt.
 *
 * Every failure here is swallowed. The exemption and the submission are already written; a mail
 * server having a bad afternoon must not roll that back or hand the customer an error for
 * something that succeeded. The log line is the durable record either way.
 */
async function notifyResellerSet(customerId: string, customerName: string, fileName?: string) {
  try {
    const admins = await User.find({
      role: { $in: [Role.SuperAdmin, Role.Admin] },
      status: UserStatus.Active,
    })
      .select('email')
      .lean<Array<{ email?: string }>>();

    const to = admins.map((a) => a.email).filter((e): e is string => Boolean(e));
    if (to.length === 0) return;

    const mail = resellerSetByIntakeEmail({
      customerName,
      customerLink: `${env.appUrl}/customers?customer=${customerId}`,
      certificateName: fileName,
    });
    await Promise.all(to.map((address) => sendMail({ to: address, ...mail })));
  } catch (err) {
    logger.error('reseller-set notification failed', {
      customerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Accept a submission, create the customer, and consume the link.
 *
 * Everything applies on arrival — the exemption a certificate carries included. There is no
 * approval step because there is nothing to approve against: the record did not exist a moment
 * ago, so the submission is not overwriting anybody's work. The submission itself is kept as the
 * evidence behind what was written, the certificate and the submitter's IP with it.
 */
export async function submitIntake(
  token: string,
  input: CustomerIntakeSubmitInput,
  meta: SubmitIntakeMeta = {},
) {
  await connectDb();

  const tokenHash = hashToken(token);

  /*
   * Read the token, but leave it live. It is spent further down, at the moment the customer
   * record is actually written — a submission that gets refused leaves the link usable, so
   * somebody who typed the wrong email address can correct it and try again rather than being
   * told to ask for a new invitation.
   */
  const row = await CustomerIntakeToken.findOne({
    tokenHash,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).lean<{ _id: unknown; createdBy: unknown } | null>();
  if (!row) throw new Error('This link has expired or has already been used');

  const name =
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.name || undefined;
  const addressParts = isBlankAddress(input.addressParts) ? undefined : input.addressParts;
  const shipping = shippingBlock(input);

  /*
   * The billing country decides both of the things the form never asks about. The schema already
   * refuses a Pakistani address carrying a certificate, so this repeats the rule rather than
   * introducing it — the service is exported and a future caller reaching it directly must not
   * be able to make a PK customer tax-exempt.
   */
  const country = input.addressParts?.country;
  const certificate = canBeReseller(country) ? input.resellerCertificate : undefined;
  const invoiceType = invoiceTypeFor(country, Boolean(certificate));

  /*
   * An email already on file ends this here.
   *
   * A link creates a customer; it never edits one. Whoever holds this URL is not necessarily the
   * customer it names — invitations get forwarded, and sit in shared inboxes — so letting a
   * submission land on an existing record would make a link a way to rewrite billing details
   * somebody already verified. They are told to get in touch instead, which is a person's job to
   * answer, not a form's. The link survives this: nothing was written, so there is nothing for
   * spending it to protect.
   */
  const existing = await Customer.findOne({ email: input.email, isDeleted: { $ne: true } })
    .select({ _id: 1 })
    .lean<{ _id: unknown } | null>();
  if (existing) {
    logger.warn('customer intake refused: email already on file', {
      customerId: String(existing._id),
      tokenId: String(row._id),
      ip: meta.ip,
    });
    throw ALREADY_ON_FILE();
  }

  /*
   * Spend the link, in one atomic findOneAndUpdate, and only then write the customer.
   *
   * The filter repeats the conditions the read enforced, so of two requests racing — a
   * double-tapped submit button, or a form posted twice from a flaky connection — only the one
   * that flips `consumedAt` proceeds. Checking and updating separately would let both through,
   * and on an invitation that means two customer records, not two harmless duplicates.
   */
  const claimed = await CustomerIntakeToken.findOneAndUpdate(
    { _id: row._id, consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
  ).lean<{ _id: unknown } | null>();
  if (!claimed) throw new Error('This link has expired or has already been used');

  let doc;
  try {
    doc = await Customer.create({
      name: name ?? input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      address: printable(input.addressParts, input.address),
      addressParts,
      shipping,
      reseller: Boolean(certificate),
      resellerCertificate: certificate,
      // Derived, never asked for: see `invoiceTypeFor`.
      invoiceType,
      // Whoever issued the invitation owns the record, so it is not left ownerless.
      createdBy: row.createdBy,
    });
  } catch (err) {
    /*
     * Nothing was created, so the link goes back to being usable — the same reasoning as the
     * refusal above, applied to a failure nobody chose. The duplicate-key case is the check
     * above losing a race with another submission claiming that address a moment earlier; it
     * gets the same wording, since to the person reading it the situation is identical.
     */
    await CustomerIntakeToken.updateOne({ _id: row._id }, { $set: { consumedAt: null } });
    if (isDuplicateKey(err)) throw ALREADY_ON_FILE();
    throw err;
  }

  const customerId = String(doc._id);

  // Bind the token to the record it made, so the trail from invitation to customer holds.
  await CustomerIntakeToken.updateOne({ _id: row._id }, { $set: { customer: customerId } });

  const intake = await CustomerIntake.create({
    customer: customerId,
    token: row._id,
    name,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    address: printable(input.addressParts, input.address),
    addressParts,
    shipping,
    customerNote: input.customerNote,
    resellerCertificate: certificate,
    setReseller: Boolean(certificate),
    submittedIp: meta.ip,
    submittedUserAgent: meta.userAgent,
  });

  /*
   * Where the exemption came from. The flag and the certificate went on with the record above;
   * this records the submission that carried them, so a tax position can always be traced to the
   * document and the moment it arrived.
   */
  if (certificate) {
    await Customer.updateOne(
      { _id: customerId },
      {
        $set: {
          resellerSource: { via: 'intake', intake: intake._id, at: new Date(), ip: meta.ip },
        },
      },
    );

    logger.info('reseller exemption set from customer intake', {
      customerId,
      intakeId: String(intake._id),
      ip: meta.ip,
    });

    // Told, not asked: the exemption is already live. This exists so it is noticed now rather
    // than a month later, on an invoice that quietly charged no sales tax.
    await notifyResellerSet(customerId, name ?? input.email, certificate.name);
  }

  logger.info('customer intake submitted', {
    customerId,
    intakeId: String(intake._id),
    withCertificate: Boolean(certificate),
    invoiceType,
  });

  return { id: String(intake._id), customerId, name: name ?? '', created: true };
}
