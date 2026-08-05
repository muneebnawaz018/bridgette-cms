import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger/logger';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.smtp.host,
    port: env.smtp.port,
    secure: env.smtp.secure,
    auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
  });
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Files to attach. Deliberately narrower than nodemailer's own attachment type: content is a
   * Buffer we already hold, never a path or a URL the mail server would have to go and fetch.
   */
  attachments?: MailAttachment[];
}

/**
 * Send a transactional email.
 *
 * The transport's reply is logged rather than discarded: a 250 with the address in
 * `accepted` is the only proof the mail server took the message. Without this, a message
 * silently refused (or accepted and later bounced) looks identical to a successful send,
 * which makes "the email never arrived" impossible to diagnose.
 */
export async function sendMail({
  to,
  subject,
  html,
  text,
  attachments,
}: SendMailInput): Promise<void> {
  /*
   * The office is blind-copied on everything, so there is an internal record of every message
   * that left the building. Applied here rather than at each call site: a copy that depends on
   * whoever wrote the caller is a copy that will be missing from whichever one gets added next.
   */
  const admin = env.superAdminEmail.trim().toLowerCase();
  // Not copied to itself when the admin is already the recipient — a duplicate in the envelope
  // reads as a bug in the mailbox that receives it.
  const bcc = admin && admin !== to.trim().toLowerCase() ? admin : undefined;

  try {
    const info = await getTransporter().sendMail({
      from: env.smtp.from,
      to,
      bcc,
      subject,
      html,
      text,
      attachments,
    });

    /*
     * Resolving is not the same as delivered, and the difference matters: a caller that reports
     * "emailed to …" on the strength of a resolved promise will happily say so about a message
     * the server refused. Nodemailer reports per-recipient outcomes instead of throwing, so the
     * two failure shapes are checked here and turned into errors:
     *
     *   rejected — the server explicitly refused this recipient
     *   accepted empty — nobody was taken, which is a refusal without the courtesy of saying so
     *
     * What this still cannot promise is delivery. The mail server has accepted responsibility;
     * whether it lands in an inbox, a spam folder or a later bounce is beyond this process.
     */
    /*
     * Judged on the intended recipient, not on the whole envelope. Now that a blind copy rides
     * along, a bounced internal address would otherwise fail a send the customer received
     * perfectly well. `accepted` and `rejected` hold bare addresses, so `to` is compared
     * case-insensitively against them rather than by identity.
     */
    const listed = (addresses: unknown): string[] =>
      (Array.isArray(addresses) ? addresses : [])
        .map((a) => (typeof a === 'string' ? a : ((a as { address?: string })?.address ?? '')))
        .map((a) => a.toLowerCase());

    const wanted = to.trim().toLowerCase();
    const rejected = listed(info.rejected);
    const accepted = listed(info.accepted);

    if (rejected.includes(wanted)) {
      logger.error('email recipient rejected by the mail server', {
        to,
        subject,
        rejected: info.rejected,
        response: info.response,
      });
      throw new Error(`The mail server refused ${to}: ${info.response ?? ''}`);
    }

    if (!accepted.includes(wanted)) {
      logger.error('email recipient not accepted', {
        to,
        subject,
        accepted: info.accepted,
        response: info.response,
      });
      throw new Error(`The mail server did not accept ${to}: ${info.response ?? 'no reply'}`);
    }

    if (rejected.length) {
      // The recipient got it; something else on the envelope did not. Worth knowing about, but
      // not a failed send.
      logger.warn('email partially rejected', { to, subject, rejected: info.rejected });
    }

    logger.info('email sent', {
      to,
      subject,
      // Named, not counted: "which file went out" is the question after a customer says the
      // attachment was wrong.
      attachments: attachments?.map((a) => a.filename),
      messageId: info.messageId,
      accepted: info.accepted,
      response: info.response,
    });
  } catch (err) {
    logger.error('email send failed', {
      to,
      subject,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
