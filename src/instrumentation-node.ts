import { startScheduler } from '@/lib/scheduler';
import { sendDueReminders } from '@/modules/invoicing/services/reminder.service';

/**
 * The Node-only half of startup. Kept in its own module so nothing here is even reachable
 * from the edge build: this file pulls in mongoose and nodemailer, and nodemailer needs
 * `stream`, which edge does not have. See instrumentation.ts for why that matters.
 */
export function registerNode(): void {
  // Default 1440 (once a day) to match vercel.json's daily cron, so the sweep cadence is the
  // same whether this in-process timer or the Vercel cron is what fires it.
  const configured = Number(process.env.REMINDER_SWEEP_MINUTES ?? 1440);
  const everyMinutes = Number.isFinite(configured) && configured > 0 ? configured : 1440;

  startScheduler([
    {
      name: 'invoice-reminders',
      everyMinutes,
      run: () => sendDueReminders(),
    },
  ]);
}
