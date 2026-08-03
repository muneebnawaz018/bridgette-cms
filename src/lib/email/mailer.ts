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

    logger.info('email sent', {
      to,
      subject,
      // Named, not counted: "which file went out" is the question after a customer says the
      // attachment was wrong.
      attachments: attachments?.map((a) => a.filename),
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });

    // Some servers accept the connection but refuse the recipient.
    if (info.rejected?.length) {
      logger.warn('email recipient rejected by the mail server', { to, rejected: info.rejected });
    }
  } catch (err) {
    logger.error('email send failed', {
      to,
      subject,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
