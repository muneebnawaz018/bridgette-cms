import 'server-only';
import { randomBytes, createHash } from 'node:crypto';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { env } from '@/lib/config/env';
import { Permission, assertCan, Role, UserStatus, User, type SessionUser } from '@/modules/auth';
import { sendMail } from '@/lib/email/mailer';
import { customerIntakeEmail, resellerSetByIntakeEmail } from '@/lib/email/templates';
import { companyContactFor } from '@/modules/legal/company';
import { Customer, type CustomerDoc } from '../models/customer.model';
import { CustomerIntakeToken } from '../models/customerIntakeToken.model';
import { CustomerIntake, type CustomerIntakeDoc } from '../models/customerIntake.model';
import { formatAddress, isBlankAddress } from '../address';
import type { CustomerIntakeSubmitInput } from '../intake.schemas';
import { INTAKE_TTL_DAYS } from '../intake.constants';

export { INTAKE_TTL_DAYS };

/**
 * The fields a customer may fill in, and therefore the only ones an approval can copy across.
 * Enforced here rather than trusted from the review UI: the request names which fields to apply,
 * and a hand-made call could otherwise name `reseller` or `invoiceType`.
 */
export const INTAKE_FIELDS = [
  'name',
  'firstName',
  'lastName',
  'email',
  'phone',
  'address',
  'addressParts',
  'shipping',
] as const;

export type IntakeField = (typeof INTAKE_FIELDS)[number];

/** SHA-256, hex. See the token model for why this is not bcrypt. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Mint a fresh link for one customer and consume any earlier one.
 *
 * Returns the plaintext token exactly once — only its hash is stored, so a lost link cannot be
 * recovered and has to be reissued. That is deliberate: it means a leaked database gives up no
 * working intake URLs.
 */
export async function issueIntakeLink(actor: SessionUser, customerId: string) {
  assertCan(actor.role, Permission.CustomerEdit);
  await connectDb();

  const customer = await Customer.findOne({ _id: customerId, isDeleted: { $ne: true } })
    .select({ name: 1, email: 1, invoiceType: 1 })
    .lean<Pick<CustomerDoc, 'name' | 'email' | 'invoiceType'> & { _id: unknown }>();
  if (!customer) throw new Error('Customer not found');

  // One live link per customer: a reissue invalidates the previous one, so "resend" never leaves
  // two working URLs out there and revoking is simply issuing again.
  await CustomerIntakeToken.updateMany(
    { customer: customerId, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );

  const token = randomBytes(32).toString('base64url');
  const doc = await CustomerIntakeToken.create({
    customer: customerId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INTAKE_TTL_DAYS * 24 * 60 * 60 * 1000),
    createdBy: actor.userId,
  });

  logger.info('customer intake link issued', {
    customerId,
    tokenId: String(doc._id),
    by: actor.userId,
  });

  return {
    tokenId: String(doc._id),
    // The token itself never appears in a log line — only the row id it belongs to.
    url: `${env.appUrl}/intake/${token}`,
    expiresAt: doc.expiresAt,
    customer: {
      id: String(customer._id),
      name: customer.name,
      email: customer.email,
      invoiceType: customer.invoiceType,
    },
  };
}

/** The one place the invite mail is built and sent, so both entry points say the same thing. */
async function deliverInvite(args: {
  to: string;
  url: string;
  tokenId: string;
  customerName?: string;
  invoiceType?: string;
  customerId: string;
}): Promise<boolean> {
  const mail = customerIntakeEmail({
    customerName: args.customerName,
    link: args.url,
    expiresInDays: INTAKE_TTL_DAYS,
    // A PK customer hears from the Sialkot office, not the Chino desk.
    company: companyContactFor(args.invoiceType),
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
      customerId: args.customerId,
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
  }).lean<{ _id: unknown; customer: unknown | null } | null>();
  if (!row) throw new Error('That link has expired or has already been used. Create a new one.');

  /*
   * An open invitation has no customer attached, so there is no name to greet and no default
   * invoice type to pick an office from — the mail goes out generic, from the US entity.
   */
  const customer = row.customer
    ? await Customer.findOne({ _id: row.customer, isDeleted: { $ne: true } })
        .select({ name: 1, invoiceType: 1 })
        .lean<{ name?: string; invoiceType?: string }>()
    : null;
  if (row.customer && !customer) throw new Error('Customer not found');

  const sent = await deliverInvite({
    to,
    url: `${env.appUrl}/intake/${token}`,
    tokenId: String(row._id),
    // A name staff typed wins over the stored one: they are addressing whoever they are about
    // to write to, which on an open invitation is the only name anybody has.
    customerName: greetName?.trim() || customer?.name,
    invoiceType: customer?.invoiceType,
    customerId: row.customer ? String(row.customer) : 'open-invitation',
  });
  if (!sent) throw new Error('The email could not be sent. Copy the link and share it instead.');

  logger.info('customer intake link emailed', {
    customerId: String(row.customer),
    by: actor.userId,
  });
  return { sent: true, to };
}

/**
 * Mint an open invitation — a link for somebody who is not in the system yet.
 *
 * Creates no customer. The record is written when they submit, from what they actually tell us,
 * so clicking "Invite" never leaves a half-empty row for staff to clean up and a link nobody
 * answers costs nothing but a token that expires on its own.
 *
 * A link can create at most one customer: it is consumed on submission, so an invitation that
 * gets forwarded adds one record, not a stream of them.
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
    customer: {
      id: '',
      name: undefined as string | undefined,
      email: undefined as string | undefined,
      invoiceType: undefined as string | undefined,
    },
  };
}

interface OpenIntake {
  tokenId: string;
  /** Null for an open invitation: the customer does not exist until the form is submitted. */
  customerId: string | null;
  /** Greeting only. No address, email or phone — a forwarded link must not leak the record. */
  customerName: string;
}

/**
 * Resolve a token to the intake it opens, or null.
 *
 * Returns nothing about the customer beyond their name. The form opens blank by design: if it
 * echoed back the stored address and phone, forwarding the link — or finding it in a shared
 * inbox — would be enough to read someone's details without ever submitting anything.
 */
export async function openIntake(token: string): Promise<OpenIntake | null> {
  await connectDb();
  const row = await CustomerIntakeToken.findOne({ tokenHash: hashToken(token) });
  if (!row) return null;
  if (row.consumedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  // An open invitation has nobody attached yet, so there is no name to greet and nothing to
  // check for deletion — the form simply opens.
  if (!row.customer) {
    return { tokenId: String(row._id), customerId: null, customerName: '' };
  }

  const customer = await Customer.findOne({ _id: row.customer, isDeleted: { $ne: true } })
    .select({ name: 1 })
    .lean<{ name?: string }>();
  // A customer deleted after the invite went out takes their link with them.
  if (!customer) return null;

  return {
    tokenId: String(row._id),
    customerId: String(row.customer),
    customerName: customer.name ?? '',
  };
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
 * Accept a submission and consume the link.
 *
 * The identity fields land as a proposal for staff to approve. The reseller certificate is the
 * exception: it applies to the customer immediately, exemption included, because chasing that
 * document is the friction this feature exists to remove. The submission still records the file
 * and the fact that it set the flag, so the exemption can always be traced to its evidence.
 */
export async function submitIntake(
  token: string,
  input: CustomerIntakeSubmitInput,
  meta: SubmitIntakeMeta = {},
) {
  await connectDb();

  /*
   * Consume the token first, in one atomic findOneAndUpdate, and only then write anything.
   *
   * Reading it and updating it afterwards leaves a window: a double-tapped submit button, or a
   * form posted twice from a flaky connection, would pass the read on both requests — and on an
   * open invitation that means two customers, not just two submissions. The filter carries the
   * same conditions the read enforced, so whichever request updates the row first is the only
   * one that proceeds.
   */
  const row = await CustomerIntakeToken.findOneAndUpdate(
    { tokenHash: hashToken(token), consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
  ).lean<{ _id: unknown; customer: unknown; createdBy: unknown } | null>();
  if (!row) throw new Error('This link has expired or has already been used');

  const name =
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.name || undefined;
  const addressParts = isBlankAddress(input.addressParts) ? undefined : input.addressParts;
  const shipping = shippingBlock(input);

  /*
   * Which record this belongs to.
   *
   * An open invitation has none yet. Before creating one, look for a live customer already using
   * this email: someone sent an open link who is in fact on file should update that record rather
   * than become a second copy of themselves — and the unique email index would refuse the insert
   * anyway, with a message meaning nothing to the person filling in the form.
   */
  let customerId = row.customer ? String(row.customer) : null;
  let created = false;

  if (!customerId) {
    const existing = await Customer.findOne({
      email: input.email,
      isDeleted: { $ne: true },
    })
      .select({ _id: 1 })
      .lean<{ _id: unknown } | null>();

    if (existing) {
      // Falls through to the normal path: staff review it against what is already stored.
      customerId = String(existing._id);
    } else {
      /*
       * Applied on arrival rather than held for approval. Approval exists to stop a submission
       * silently overwriting something staff had already verified — and on a record that did not
       * exist a moment ago there is nothing to overwrite. Holding it back would only mean a
       * customer who filled in the form still does not appear anywhere.
       */
      const doc = await Customer.create({
        name: name ?? input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        address: printable(input.addressParts, input.address),
        addressParts,
        shipping,
        reseller: Boolean(input.resellerCertificate),
        resellerCertificate: input.resellerCertificate,
        // Whoever issued the invitation owns the record, so it is not left ownerless.
        createdBy: row.createdBy,
      });
      customerId = String(doc._id);
      created = true;
    }

    // Bind the token to whatever it resolved to, so the trail from invitation to record holds.
    await CustomerIntakeToken.updateOne({ _id: row._id }, { $set: { customer: customerId } });
  }

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
    resellerCertificate: input.resellerCertificate,
    setReseller: Boolean(input.resellerCertificate),
    createdCustomer: created,
    // A record created from this submission has nothing pending about it.
    status: created ? 'approved' : 'pending',
    appliedFields: created ? [...INTAKE_FIELDS] : [],
    submittedIp: meta.ip,
    submittedUserAgent: meta.userAgent,
  });

  /*
   * The exemption, for a submission landing on a record that already existed. A newly created
   * customer got it in the insert above.
   *
   * `reseller` is only ever turned on here — never off — so a customer re-submitting cannot
   * revoke an exemption staff granted, and the certificate is kept even if the flag is later
   * cleared, because the invoices raised under it still need their evidence.
   */
  if (input.resellerCertificate) {
    if (!created) {
      await Customer.updateOne(
        { _id: customerId },
        {
          $set: {
            reseller: true,
            resellerCertificate: input.resellerCertificate,
            resellerSource: { via: 'intake', intake: intake._id, at: new Date(), ip: meta.ip },
          },
        },
      );
    } else {
      await Customer.updateOne(
        { _id: customerId },
        {
          $set: {
            resellerSource: { via: 'intake', intake: intake._id, at: new Date(), ip: meta.ip },
          },
        },
      );
    }

    logger.info('reseller exemption set from customer intake', {
      customerId,
      intakeId: String(intake._id),
      ip: meta.ip,
    });

    // Told, not asked: the exemption is already live. This exists so it is noticed now rather
    // than a month later, on an invoice that quietly charged no sales tax.
    await notifyResellerSet(customerId, name ?? input.email, input.resellerCertificate.name);
  }

  logger.info('customer intake submitted', {
    customerId,
    intakeId: String(intake._id),
    createdCustomer: created,
    withCertificate: Boolean(input.resellerCertificate),
  });

  return { id: String(intake._id), customerId, name: name ?? '', created };
}

/** Pending submissions for one customer, newest first. */
export async function listIntakes(actor: SessionUser, customerId: string) {
  assertCan(actor.role, Permission.CustomerView);
  await connectDb();
  return (
    CustomerIntake.find({ customer: customerId })
      // The certificate's bytes are megabytes and the review screen only needs to know it arrived.
      .select({ 'resellerCertificate.data': 0 })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean<CustomerIntakeDoc[]>()
  );
}

const DUPLICATE_EMAIL = 'Another customer already uses that email address';

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: number }).code === 11000);
}

/**
 * Copy the accepted fields onto the customer and close the submission.
 *
 * `fields` is filtered against INTAKE_FIELDS rather than trusted, so naming `reseller` or
 * `products` in a hand-made request applies nothing. An empty list is a valid outcome: it
 * records that staff read the submission and kept the record as it stood.
 */
export async function reviewIntake(
  actor: SessionUser,
  intakeId: string,
  fields: string[],
  decision: 'approved' | 'rejected' = 'approved',
) {
  assertCan(actor.role, Permission.CustomerEdit);
  await connectDb();

  const intake = await CustomerIntake.findById(intakeId);
  if (!intake) throw new Error('Submission not found');
  if (intake.status !== 'pending') throw new Error('This submission has already been reviewed');

  const accepted = (
    decision === 'approved'
      ? fields.filter((f): f is IntakeField => (INTAKE_FIELDS as readonly string[]).includes(f))
      : []
  ) as IntakeField[];

  if (accepted.length > 0) {
    const customer = await Customer.findById(intake.customer);
    if (!customer || customer.isDeleted) throw new Error('Customer not found');

    for (const field of accepted) {
      switch (field) {
        case 'addressParts':
          // The printable one-liner is derived, never accepted on its own, so the two halves of
          // the address cannot be approved into disagreeing with each other.
          customer.addressParts = intake.addressParts as CustomerDoc['addressParts'];
          customer.address = intake.address ?? '';
          break;
        case 'address':
          // Only meaningful when there are no structured parts to derive it from.
          if (!intake.addressParts) customer.address = intake.address ?? '';
          break;
        case 'shipping':
          customer.shipping = intake.shipping as unknown as CustomerDoc['shipping'];
          break;
        case 'name':
          // Never blanked: a submission that gave first/last but no full name leaves the stored
          // one alone rather than emptying the field every list and invoice reads.
          customer.name = intake.name ?? customer.name;
          break;
        default:
          customer.set(field, intake[field] ?? undefined);
      }
    }

    try {
      await customer.save();
    } catch (err) {
      if (isDuplicateKey(err)) throw new Error(DUPLICATE_EMAIL);
      throw err;
    }
  }

  intake.status = decision;
  intake.appliedFields = accepted;
  intake.reviewedBy = actor.userId as unknown as CustomerIntakeDoc['reviewedBy'];
  intake.reviewedAt = new Date();
  await intake.save();

  logger.info('customer intake reviewed', {
    intakeId,
    customerId: String(intake.customer),
    decision,
    applied: accepted,
    by: actor.userId,
  });

  return { id: intakeId, status: decision, applied: accepted };
}
