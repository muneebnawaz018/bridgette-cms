import { colors } from '@/lib/colors';

const BRAND = colors.brand.red;

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee">
    <div style="background:${BRAND};height:6px"></div>
    <div style="padding:28px">
      <h1 style="margin:0 0 12px;font-size:20px;color:${colors.brand.black}">${title}</h1>
      ${body}
      <p style="margin-top:28px;font-size:12px;color:#888">Bridgette Enterprises LLC, Management Portal</p>
    </div>
  </div></body></html>`;
}

export function otpEmail(name: string, code: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Your Bridgette Portal verification code',
    html: shell(
      'Verify your account',
      `<p>Hi ${name},</p><p>Use this code to verify your account and set your password:</p>
       <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:${BRAND}">${code}</p>
       <p style="font-size:13px;color:#666">This code expires in 15 minutes.</p>`,
    ),
    text: `Hi ${name}, your Bridgette Portal verification code is ${code} (expires in 15 minutes).`,
  };
}

export function resetPasswordEmail(
  name: string,
  link: string,
): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your Bridgette Portal password',
    html: shell(
      'Reset your password',
      `<p>Hi ${name},</p><p>Click below to set a new password. If you didn't request this, ignore this email.</p>
       <p><a href="${link}" style="display:inline-block;background:${BRAND};color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Reset password</a></p>
       <p style="font-size:13px;color:#666">This link expires in 30 minutes.</p>`,
    ),
    text: `Hi ${name}, reset your Bridgette Portal password: ${link} (expires in 30 minutes).`,
  };
}

export function changeEmailOtpEmail(name: string, code: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Confirm your new Bridgette Portal email',
    html: shell(
      'Confirm your new email',
      `<p>Hi ${name},</p><p>Use this code to confirm this address as your new sign-in email:</p>
       <p style="font-size:28px;font-weight:bold;letter-spacing:4px;color:${BRAND}">${code}</p>
       <p style="font-size:13px;color:#666">This code expires in 15 minutes. If you didn't request this, ignore this email.</p>`,
    ),
    text: `Hi ${name}, your Bridgette Portal email-change code is ${code} (expires in 15 minutes).`,
  };
}

export function reminderEmail(
  invoiceNumber: string,
  link: string,
): { subject: string; html: string; text: string } {
  return {
    subject: `Reminder: invoice ${invoiceNumber} needs attention`,
    html: shell(
      'Invoice reminder',
      `<p>Invoice <strong>${invoiceNumber}</strong> has reached its reminder threshold and is still open.</p>
       <p><a href="${link}" style="color:${BRAND}">Open invoice</a></p>`,
    ),
    text: `Invoice ${invoiceNumber} has reached its reminder threshold and is still open: ${link}`,
  };
}
