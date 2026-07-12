import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/config/env';

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

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendMail({ to, subject, html, text }: SendMailInput): Promise<void> {
  await getTransporter().sendMail({
    from: env.smtp.from,
    to,
    subject,
    html,
    text,
  });
}
