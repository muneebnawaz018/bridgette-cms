import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { env } from '@/lib/config/env';
import { sendMail } from '@/lib/email/mailer';
import { reminderEmail } from '@/lib/email/templates';
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
 * Normally the creator. If that account has since been disabled or deleted, the reminder
 * would otherwise vanish, so it falls back to the admins, who can reassign the work. An
 * invoice quietly ageing because its author left is the failure this avoids.
 */
async function recipientsFor(createdBy: unknown): Promise<Recipient[]> {
  const creator = await User.findById(createdBy)
    .select('email name status')
    .lean<{ email?: string; name?: string; status?: string }>();

  if (creator?.email && creator.status === UserStatus.Active) {
    return [{ email: creator.email, name: creator.name ?? 'there' }];
  }

  const admins = await User.find({
    role: { $in: [Role.SuperAdmin, Role.Admin] },
    status: UserStatus.Active,
  })
    .select('email name')
    .lean<Array<{ email?: string; name?: string }>>();

  return admins
    .filter((a): a is { email: string; name?: string } => Boolean(a.email))
    .map((a) => ({ email: a.email, name: a.name ?? 'there' }));
}

/**
 * Send every reminder that has come due, once each.
 *
 * `limit` caps one sweep so a long backlog cannot turn a single cron tick into a thousand
 * SMTP round trips; the remainder is picked up by the next tick.
 */
export async function sendDueReminders(limit = 100): Promise<ReminderSweepResult> {
  await connectDb();
  const now = new Date();
  const result: ReminderSweepResult = { due: 0, sent: 0, skipped: 0, failed: 0 };

  const candidates = await Invoice.find({
    'reminder.dueAt': { $lte: now },
    'reminder.sent': false,
    state: { $in: OPEN_STATES },
    isDeleted: false,
    isArchived: false,
  })
    .select('_id number createdBy')
    .limit(limit)
    .lean<Array<{ _id: unknown; number: string; createdBy: unknown }>>();

  result.due = candidates.length;

  for (const invoice of candidates) {
    // Claim it before sending. Two overlapping cron ticks would otherwise both read the same
    // row as unsent and mail it twice; the guard on `reminder.sent` means only one wins.
    const claimed = await Invoice.findOneAndUpdate(
      { _id: invoice._id, 'reminder.sent': false },
      { $set: { 'reminder.sent': true, 'reminder.sentAt': now } },
    ).lean();
    if (!claimed) continue;

    const recipients = await recipientsFor(invoice.createdBy);
    if (recipients.length === 0) {
      // Nobody to tell. Leave it claimed rather than retrying every tick forever.
      result.skipped += 1;
      logger.warn('invoice reminder had no recipient', {
        invoiceId: String(invoice._id),
        number: invoice.number,
      });
      continue;
    }

    const link = `${env.appUrl}/invoices/${String(invoice._id)}`;
    try {
      const mail = reminderEmail(invoice.number, link);
      await Promise.all(recipients.map((r) => sendMail({ to: r.email, ...mail })));
      result.sent += 1;
    } catch (err) {
      // Release the claim so the next sweep tries again, rather than silently losing it.
      await Invoice.updateOne(
        { _id: invoice._id },
        { $set: { 'reminder.sent': false }, $unset: { 'reminder.sentAt': '' } },
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
