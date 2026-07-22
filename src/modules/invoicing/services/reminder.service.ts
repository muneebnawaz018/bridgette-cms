import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { env } from '@/lib/config/env';
import { sendMail } from '@/lib/email/mailer';
import { reminderEmail } from '@/lib/email/templates';
import { formatMoney } from '@/lib/format/money';
import { User } from '@/modules/auth/models/user.model';
import { UserStatus } from '@/modules/auth/enums';
import { Role } from '@/modules/auth/rbac';
import { Invoice } from '../models/invoice.model';
import { InvoiceState } from '../enums';

/**
 * Invoice reminder sweep.
 *
 * An invoice can carry `reminder.thresholdHours`, which the create path turns into a
 * `reminder.dueAt` timestamp. Nothing acted on it until now: the field was collected, stored
 * and then ignored, so the UI promised a reminder that could never arrive. This is the piece
 * that makes the promise true.
 *
 * Reminders are internal. They nudge the person who raised the invoice to chase it or record
 * a payment, which is exactly what the template already says. Nothing is sent to the client.
 */

/** States where a reminder still makes sense: finalized, with money outstanding. */
const OPEN_STATES = [InvoiceState.Pending, InvoiceState.PartiallyPaid, InvoiceState.Overdue];

/**
 * How long to wait before reminding again on the same still-unpaid invoice. The sweep chases
 * an overdue invoice about once a day until it is paid, archived or deleted, rather than
 * nudging once and going quiet.
 *
 * Set below the minimum gap between daily sweeps (24h, less the cron's ~1h flexible window on
 * either side ≈ 22h) so a day is never accidentally skipped, yet well above any same-day manual
 * re-run so one calendar day never sends twice.
 */
const REMIND_EVERY_MS = 20 * 60 * 60 * 1000;

export interface ReminderSweepResult {
  /** Invoices whose reminder came due in this sweep. */
  due: number;
  sent: number;
  /** Due, but nobody was left to notify. */
  skipped: number;
  /** Claimed then failed to send; released so the next sweep retries. */
  failed: number;
}

type Recipient = { email: string; name: string };

/**
 * Who hears about this invoice.
 *
 * The creator AND every active admin, together. The person who raised the invoice needs the
 * nudge to chase it, and the admins want oversight of anything ageing — so both are notified,
 * not one or the other. If the creator's account has since been disabled or deleted, only the
 * admins remain, which still keeps an orphaned invoice from ageing silently.
 *
 * Merged and de-duplicated by email, so an admin who is themselves the creator is mailed once.
 */
async function recipientsFor(createdBy: unknown): Promise<Recipient[]> {
  const [creator, admins] = await Promise.all([
    User.findById(createdBy)
      .select('email name status')
      .lean<{ email?: string; name?: string; status?: string }>(),
    User.find({
      role: { $in: [Role.SuperAdmin, Role.Admin] },
      status: UserStatus.Active,
    })
      .select('email name')
      .lean<Array<{ email?: string; name?: string }>>(),
  ]);

  // First writer wins per email (case-insensitive), so the creator's own entry isn't
  // overwritten by their admin row and nobody is mailed twice.
  const byEmail = new Map<string, Recipient>();
  const add = (email?: string, name?: string) => {
    if (!email) return;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { email, name: name ?? 'there' });
  };

  if (creator?.status === UserStatus.Active) add(creator.email, creator.name);
  for (const a of admins) add(a.email, a.name);

  return [...byEmail.values()];
}

/**
 * Send every reminder that has come due, then keep chasing each still-unpaid one about once a
 * day (see REMIND_EVERY_MS) until it is paid, archived or deleted. An invoice reminded within
 * the cooldown is left alone, so a given invoice is mailed at most once per day.
 *
 * `limit` caps one sweep so a long backlog cannot turn a single cron tick into a thousand
 * SMTP round trips; the remainder is picked up by the next tick.
 */
export async function sendDueReminders(limit = 100): Promise<ReminderSweepResult> {
  await connectDb();
  const now = new Date();
  const resendBefore = new Date(now.getTime() - REMIND_EVERY_MS);
  const result: ReminderSweepResult = { due: 0, sent: 0, skipped: 0, failed: 0 };

  // Eligible = overdue, still open, and either never reminded or last reminded before the
  // cooldown. Reused verbatim as the atomic claim guard below, so two overlapping ticks can't
  // both mail the same invoice: the first stamps `sentAt = now`, which fails this guard for
  // the second.
  const notRecentlySent = {
    $or: [
      { 'reminder.sentAt': { $exists: false } },
      { 'reminder.sentAt': null },
      { 'reminder.sentAt': { $lte: resendBefore } },
    ],
  };

  const candidates = await Invoice.find({
    'reminder.dueAt': { $lte: now },
    state: { $in: OPEN_STATES },
    isDeleted: false,
    isArchived: false,
    ...notRecentlySent,
  })
    .select('_id number createdBy reminder.sentAt grandTotal amountPaid currency dueDate billTo.name')
    .limit(limit)
    .lean<
      Array<{
        _id: unknown;
        number: string;
        createdBy: unknown;
        reminder?: { sentAt?: Date };
        grandTotal?: number;
        amountPaid?: number;
        currency?: string;
        dueDate?: Date;
        billTo?: { name?: string };
      }>
    >();

  result.due = candidates.length;

  for (const invoice of candidates) {
    const prevSentAt = invoice.reminder?.sentAt ?? null;
    // Claim before sending. The cooldown guard is re-checked atomically, so a second tick that
    // read this same invoice finds it already stamped for `now` and skips it.
    const claimed = await Invoice.findOneAndUpdate(
      { _id: invoice._id, ...notRecentlySent },
      { $set: { 'reminder.sent': true, 'reminder.sentAt': now } },
    ).lean();
    if (!claimed) continue;

    const recipients = await recipientsFor(invoice.createdBy);
    if (recipients.length === 0) {
      // Nobody to tell. Leave it stamped so it waits a cooldown rather than warning every tick.
      result.skipped += 1;
      logger.warn('invoice reminder had no recipient', {
        invoiceId: String(invoice._id),
        number: invoice.number,
      });
      continue;
    }

    const link = `${env.appUrl}/invoices/${String(invoice._id)}`;
    try {
      const balanceDue = (invoice.grandTotal ?? 0) - (invoice.amountPaid ?? 0);
      const mail = reminderEmail({
        invoiceNumber: invoice.number,
        link,
        amountDue: formatMoney(invoice.currency, balanceDue),
        dueDate: invoice.dueDate
          ? new Date(invoice.dueDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : undefined,
        billTo: invoice.billTo?.name,
      });
      await Promise.all(recipients.map((r) => sendMail({ to: r.email, ...mail })));
      result.sent += 1;
    } catch (err) {
      // Roll the stamp back to its previous value so the next sweep retries this invoice
      // instead of waiting a whole cooldown from this failed attempt.
      await Invoice.updateOne(
        { _id: invoice._id },
        prevSentAt
          ? { $set: { 'reminder.sentAt': prevSentAt } }
          : { $unset: { 'reminder.sentAt': '' }, $set: { 'reminder.sent': false } },
      );
      result.failed += 1;
      logger.error('invoice reminder failed to send', {
        invoiceId: String(invoice._id),
        number: invoice.number,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
