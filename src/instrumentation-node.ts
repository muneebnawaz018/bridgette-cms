import { startScheduler } from '@/lib/scheduler';
import { sendDueReminders } from '@/modules/invoicing/services/reminder.service';

/**
 * The Node-only half of startup. Kept in its own module so nothing here is even reachable
 * from the edge build: this file pulls in mongoose and nodemailer, and nodemailer needs
 * `stream`, which edge does not have. See instrumentation.ts for why that matters.
 */
export function registerNode(): void {
  const configured = Number(process.env.REMINDER_SWEEP_MINUTES ?? 360);
  const everyMinutes = Number.isFinite(configured) && configured > 0 ? configured : 360;

  startScheduler([
    {
      name: 'invoice-reminders',
      everyMinutes,
      run: () => sendDueReminders(),
    },
  ]);
}
