import { colors } from '@/lib/colors';
import { env } from '@/lib/config/env';

/**
 * Transactional email bodies.
 *
 * Email clients strip <style> blocks, CSS variables and most modern CSS, so everything here
 * is inline and table-based — the one place in this codebase that cannot use the MUI theme.
 * Colors still come from lib/colors so the palette traces back to a single source.
 */

const BRAND = colors.brand.red;
const INK = colors.text.primary;
const MUTED = colors.text.secondary;
const FAINT = colors.ink[400];
const CANVAS = colors.surface.canvas;
const PAPER = colors.surface.paper;
const BORDER = colors.surface.border;

const COMPANY = 'Bridgette Enterprises LLC';
const PRODUCT = 'Bridgette Portal';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape interpolated values — a member's name is admin-supplied and lands inside HTML. */
function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** A button that also renders in Outlook, which ignores padding on inline-block anchors. */
function button(href: string, label: string): string {
  const url = esc(href);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    <tr><td align="center" bgcolor="${BRAND}" style="border-radius:8px">
      <a href="${url}" style="display:inline-block;padding:12px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:${PAPER};text-decoration:none;border-radius:8px">${esc(label)}</a>
    </td></tr>
  </table>
  <p style="margin:0 0 4px;font-size:12px;color:${MUTED}">If the button does not work, paste this into your browser:</p>
  <p style="margin:0;font-size:12px;word-break:break-all"><a href="${url}" style="color:${BRAND}">${url}</a></p>`;
}

/** A verification code, styled to be readable and easy to copy. */
function codeBlock(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    <tr><td align="center" bgcolor="${CANVAS}" style="border:1px solid ${BORDER};border-radius:8px;padding:16px 28px">
      <span style="font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:bold;letter-spacing:8px;color:${BRAND}">${esc(code)}</span>
    </td></tr>
  </table>`;
}

/** A compact, bordered label/value card — for summarising an invoice, a payment, etc. */
function detailsTable(
  rows: Array<{ label: string; value: string; strong?: boolean; accent?: boolean }>,
): string {
  const body = rows
    .map((r, i) => {
      const divider = i < rows.length - 1 ? `border-bottom:1px solid ${BORDER};` : '';
      const valueColor = r.accent ? BRAND : INK;
      return `<tr>
        <td style="padding:11px 16px;font-size:13px;color:${MUTED};${divider}">${esc(r.label)}</td>
        <td style="padding:11px 16px;font-size:14px;font-weight:${r.strong ? 'bold' : 'normal'};color:${valueColor};text-align:right;${divider}">${esc(r.value)}</td>
      </tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0;background:${CANVAS};border:1px solid ${BORDER};border-radius:10px">${body}</table>`;
}

/**
 * Outer chrome. `preheader` is the grey snippet inboxes show next to the subject — without
 * one, clients pull the first visible words, which reads as noise.
 */
function shell({
  title,
  preheader,
  body,
}: {
  title: string;
  preheader: string;
  body: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:Arial,Helvetica,sans-serif;color:${INK}">
  <div style="display:none;font-size:1px;color:${CANVAS};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS}">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${PAPER};border:1px solid ${BORDER};border-radius:12px;overflow:hidden">
        <tr><td style="background:${BRAND};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 0">
          <p style="margin:0;font-size:13px;font-weight:bold;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Bridgette</p>
          <p style="margin:2px 0 0;font-size:11px;letter-spacing:1px;color:${FAINT};text-transform:uppercase">Management Portal</p>
        </td></tr>
        <tr><td style="padding:18px 32px 32px">
          <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:${INK}">${esc(title)}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 32px 24px;border-top:1px solid ${BORDER}">
          <p style="margin:0 0 4px;font-size:12px;color:${MUTED}">This is an automated message from ${esc(PRODUCT)}. Please do not reply.</p>
          <p style="margin:0;font-size:12px;color:${FAINT}">&copy; ${new Date().getFullYear()} ${esc(COMPANY)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface MailBody {
  subject: string;
  html: string;
  text: string;
}

/**
 * New member invite — verify the address and set a first password.
 *
 * The link goes to /set-password, not /login. An invited account has no password yet, so
 * the sign-in form has nothing to accept and no field for the code — pointing there left
 * new users holding a six-digit number with nowhere to type it. /set-password takes the
 * code and the new password together, and prefilling `email` saves them retyping the
 * address the invite was sent to.
 */
export function otpEmail(name: string, code: string, email: string): MailBody {
  const setPassword = `${env.appUrl}/set-password?email=${encodeURIComponent(email)}`;
  return {
    subject: `Your ${PRODUCT} verification code`,
    html: shell({
      title: `Welcome to ${PRODUCT}`,
      preheader: `Your verification code is ${code}. It expires in 15 minutes.`,
      body: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${esc(name)},</p>
        <p style="margin:0 0 4px;font-size:15px;line-height:1.6">An account has been created for you on ${esc(PRODUCT)}, the management system for ${esc(COMPANY)}. Use the code below to verify your email and set your password:</p>
        ${codeBlock(code)}
        <p style="margin:0 0 12px;font-size:13px;color:${MUTED}">This code expires in <strong>15 minutes</strong>. If it does, ask an administrator to send you a new invitation.</p>
        <p style="margin:0;font-size:13px;color:${MUTED}">Enter it at <a href="${esc(setPassword)}" style="color:${BRAND}">${esc(setPassword)}</a> to finish setting up your account.</p>
        <p style="margin:16px 0 0;font-size:13px;color:${MUTED}">If you were not expecting this invitation, you can ignore this email.</p>`,
    }),
    text: [
      `Hi ${name},`,
      '',
      `An account has been created for you on ${PRODUCT} (${COMPANY}).`,
      `Your verification code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
      `Enter it at ${setPassword} to finish setting up your account.`,
      '',
      'If you were not expecting this invitation, you can ignore this email.',
    ].join('\n'),
  };
}

/** Forgot-password link. */
export function resetPasswordEmail(name: string, link: string): MailBody {
  return {
    subject: `Reset your ${PRODUCT} password`,
    html: shell({
      title: 'Reset your password',
      preheader: 'This password reset link expires in 30 minutes.',
      body: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${esc(name)},</p>
        <p style="margin:0;font-size:15px;line-height:1.6">We received a request to reset the password for your ${esc(PRODUCT)} account. Choose a new one here:</p>
        ${button(link, 'Reset password')}
        <p style="margin:16px 0 0;font-size:13px;color:${MUTED}">This link expires in <strong>30 minutes</strong> and can only be used once.</p>
        <p style="margin:8px 0 0;font-size:13px;color:${MUTED}">If you did not request a reset, ignore this email — your password stays unchanged.</p>`,
    }),
    text: [
      `Hi ${name},`,
      '',
      `We received a request to reset the password for your ${PRODUCT} account.`,
      `Reset it here: ${link}`,
      '',
      'This link expires in 30 minutes and can only be used once.',
      'If you did not request a reset, ignore this email — your password stays unchanged.',
    ].join('\n'),
  };
}

/** Step 2 of an email change — sent to the NEW address. */
export function changeEmailOtpEmail(name: string, code: string): MailBody {
  return {
    subject: `Confirm your new ${PRODUCT} email`,
    html: shell({
      title: 'Confirm your new email',
      preheader: `Your confirmation code is ${code}. It expires in 15 minutes.`,
      body: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">Hi ${esc(name)},</p>
        <p style="margin:0;font-size:15px;line-height:1.6">Use the code below to confirm this address as the new sign-in email for your ${esc(PRODUCT)} account:</p>
        ${codeBlock(code)}
        <p style="margin:0 0 8px;font-size:13px;color:${MUTED}">This code expires in <strong>15 minutes</strong>.</p>
        <p style="margin:0;font-size:13px;color:${MUTED}">If you did not request this change, ignore this email and consider changing your password.</p>`,
    }),
    text: [
      `Hi ${name},`,
      '',
      `Use this code to confirm this address as your new ${PRODUCT} sign-in email: ${code}`,
      '',
      'This code expires in 15 minutes.',
      'If you did not request this change, ignore this email and consider changing your password.',
    ].join('\n'),
  };
}

/**
 * Invoice reminder — an invoice passed its reminder date and is still open. Amount due, due
 * date and the billed-to name are optional so the email still reads correctly when an invoice
 * is missing any of them.
 */
export function reminderEmail(params: {
  invoiceNumber: string;
  link: string;
  total?: string;
  paid?: string;
  amountDue?: string;
  dueDate?: string;
  billTo?: string;
}): MailBody {
  const { invoiceNumber, link, total, paid, amountDue, dueDate, billTo } = params;

  // `total` and `paid` are only passed when part of the invoice has been paid, so a fully
  // unpaid one shows just the amount due (its total) rather than repeating the same figure.
  const rows: Array<{ label: string; value: string; strong?: boolean; accent?: boolean }> = [];
  if (total) rows.push({ label: 'Invoice total', value: total });
  if (paid) rows.push({ label: 'Paid', value: paid });
  if (amountDue) rows.push({ label: 'Amount due', value: amountDue, strong: true, accent: true });
  if (dueDate) rows.push({ label: 'Due date', value: dueDate });
  if (billTo) rows.push({ label: 'Billed to', value: billTo });

  return {
    subject: `Reminder: invoice ${invoiceNumber} needs attention`,
    html: shell({
      title: 'Invoice reminder',
      preheader: `Invoice ${invoiceNumber} is past its reminder date and still unpaid${
        amountDue ? ` — ${amountDue} outstanding` : ''
      }.`,
      body: `<p style="margin:0 0 4px;font-size:15px;line-height:1.6">This is a reminder that invoice <strong>${esc(invoiceNumber)}</strong> has passed its reminder date and is still open. Please review it and record a payment if one has been received.</p>
        ${rows.length ? detailsTable(rows) : ''}
        ${button(link, 'Open invoice')}
        <p style="margin:16px 0 0;font-size:13px;color:${MUTED}">You will keep receiving this daily reminder until the invoice is paid or closed.</p>`,
    }),
    text: [
      `Invoice ${invoiceNumber} has passed its reminder date and is still open.`,
      ...(total ? [`Invoice total: ${total}`] : []),
      ...(paid ? [`Paid: ${paid}`] : []),
      ...(amountDue ? [`Amount due: ${amountDue}`] : []),
      ...(dueDate ? [`Due date: ${dueDate}`] : []),
      ...(billTo ? [`Billed to: ${billTo}`] : []),
      '',
      `Open it here: ${link}`,
      '',
      'You will keep receiving this daily reminder until the invoice is paid or closed.',
    ].join('\n'),
  };
}
