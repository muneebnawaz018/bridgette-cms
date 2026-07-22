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

export interface ReminderSweepResult {
  /** Invoices eligible to remind in this sweep. */
  due: number;
  sent: number;
  /** Eligible, but nobody was left to notify. */
  skipped: number;
  /** Failed to send; retried on the next sweep. */
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
 * Send a reminder for every overdue, still-unpaid invoice, on every sweep. An invoice keeps
 * getting mailed each run until it is paid, archived or deleted — there is no repeat guard, so
 * with the daily cron that lands as one reminder a day, and a manual re-run sends immediately.
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
    state: { $in: OPEN_STATES },
    isDeleted: false,
    isArchived: false,
  })
    .select('_id number createdBy grandTotal amountPaid currency dueDate billTo.name')
    .limit(limit)
    .lean<
      Array<{
        _id: unknown;
        number: string;
        createdBy: unknown;
        grandTotal?: number;
        amountPaid?: number;
        currency?: string;
        dueDate?: Date;
        billTo?: { name?: string };
      }>
    >();

  result.due = candidates.length;

  for (const invoice of candidates) {
    const recipients = await recipientsFor(invoice.createdBy);
    if (recipients.length === 0) {
      result.skipped += 1;
      logger.warn('invoice reminder had no recipient', {
        invoiceId: String(invoice._id),
        number: invoice.number,
      });
      continue;
    }

    const link = `${env.appUrl}/invoices/${String(invoice._id)}`;
    try {
      const grandTotal = invoice.grandTotal ?? 0;
      const paid = invoice.amountPaid ?? 0;
      const balanceDue = grandTotal - paid;
      // Show the total/paid breakdown only when something has been paid; a fully unpaid invoice
      // would otherwise just repeat the same figure as "total" and "amount due".
      const partiallyPaid = paid > 0;
      const mail = reminderEmail({
        invoiceNumber: invoice.number,
        link,
        total: partiallyPaid ? formatMoney(invoice.currency, grandTotal) : undefined,
        paid: partiallyPaid ? formatMoney(invoice.currency, paid) : undefined,
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
      // Stamp only after a successful send, so the invoice view can show when it was last
      // reminded. A failed send leaves the stamp untouched and simply retries next sweep.
      await Invoice.updateOne(
        { _id: invoice._id },
        { $set: { 'reminder.sent': true, 'reminder.sentAt': now } },
      );
      result.sent += 1;
    } catch (err) {
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
