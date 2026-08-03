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
  try {
    const info = await getTransporter().sendMail({
      from: env.smtp.from,
      to,
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
    if (info.rejected?.length) {
      logger.error('email recipient rejected by the mail server', {
        to,
        subject,
        rejected: info.rejected,
        response: info.response,
      });
      throw new Error(`The mail server refused ${info.rejected.join(', ')}: ${info.response ?? ''}`);
    }

    if (!info.accepted?.length) {
      logger.error('email accepted by nobody', { to, subject, response: info.response });
      throw new Error(`The mail server did not accept the message: ${info.response ?? 'no reply'}`);
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
