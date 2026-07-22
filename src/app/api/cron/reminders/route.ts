import { NextResponse } from 'next/server';
import { sendDueReminders } from '@/modules/invoicing/services/reminder.service';
import { logger } from '@/lib/logger/logger';

/**
 * Invoice reminder sweep, triggered by Vercel Cron.
 *
 * Vercel is serverless: the process is suspended the moment a response is sent, so the
 * in-process `setInterval` scheduler (instrumentation.ts) never fires here. This route is the
 * real trigger on Vercel — the platform pings it on the schedule in vercel.json, and it runs
 * the same sweep the timer would have. Nothing third-party: the schedule lives in the repo.
 *
 * Every hit sends a reminder for each overdue, unpaid invoice — there is no repeat guard, so
 * hitting this route (Vercel's daily cron, or a manual Run) mails those invoices again each
 * time. With the daily schedule that lands as one reminder a day until each invoice is paid.
 */

// nodemailer + mongoose need Node APIs; the edge runtime has neither.
export const runtime = 'nodejs';
// Must execute on every hit — never prerendered or cached.
export const dynamic = 'force-dynamic';
// Give the sweep room to make its SMTP round trips (Hobby caps at 60s).
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  // Vercel Cron attaches `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set. Reject
  // anything without it so the public can't trigger a mail sweep by hitting the URL.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Fail closed: an unset secret in production means the endpoint is unprotected. Refuse
    // rather than run an open mail trigger.
    logger.error('cron reminders hit but CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 503 });
  }

  try {
    const result = await sendDueReminders();
    logger.info('cron reminder sweep finished', result);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('cron reminder sweep failed', { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
