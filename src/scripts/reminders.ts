/**
 * Local test harness for the invoice reminder sweep.
 *
 *   npm run reminders              list every invoice that carries a reminder, and its state
 *   npm run reminders due <NUMBER> back-date that invoice's reminder so the next run fires it
 *   npm run reminders run          run the sweep now, without waiting for the schedule
 *
 * Works wherever you can run the project with a .env, so it is the manual trigger in
 * production too, not only in development.
 *
 * Testing this by hand is otherwise awkward: a reminder only fires once its threshold has
 * passed, so a freshly created invoice always reports "due: 0" and you cannot tell a working
 * sweep from a broken one. `due` removes the waiting.
 *
 * Development only. It talks to whatever MONGODB_URI points at, so do not run it against
 * production data.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const [, , command = 'list', target] = process.argv;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');

  if (command === 'run') {
    // Runs the sweep in this process rather than over HTTP. The app needs no endpoint for
    // this, and there is no shared secret to keep in step between machines. Safe to run
    // while the app is up: each invoice is claimed atomically, so this and the in-app
    // scheduler cannot both send the same reminder.
    const { sendDueReminders } = await import('../modules/invoicing/services/reminder.service');
    const result = await sendDueReminders();
    console.log(`sweep: ${JSON.stringify(result)}`);
    await mongoose.disconnect();
    return;
  }

  await mongoose.connect(uri);
  const invoices = mongoose.connection.collection('invoices');

  if (command === 'due') {
    if (!target) throw new Error('usage: npm run reminders due <INVOICE NUMBER>');
    const when = new Date(Date.now() - 60_000); // a minute ago, so the next sweep picks it up
    const result = await invoices.updateOne(
      { number: target },
      {
        $set: { 'reminder.dueAt': when, 'reminder.sent': false },
        $unset: { 'reminder.sentAt': '' },
      },
    );
    if (result.matchedCount === 0) throw new Error(`no invoice numbered "${target}"`);
    console.log(`${target}: reminder back-dated to ${when.toISOString()} and marked unsent.`);
    console.log('Now run:  npm run reminders run');
    await mongoose.disconnect();
    return;
  }

  const withReminders = await invoices
    .find({ reminder: { $exists: true } })
    .project({ number: 1, state: 1, isArchived: 1, isDeleted: 1, reminder: 1 })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();

  if (withReminders.length === 0) {
    console.log('No invoice has a reminder set.');
    console.log('Create one in the UI with a "remind me after" value, then re-run this.');
  } else {
    console.log(`${withReminders.length} invoice(s) with a reminder:\n`);
    const now = Date.now();
    for (const inv of withReminders) {
      const r = inv.reminder ?? {};
      const dueAt: Date | undefined = r.dueAt;
      // Mirrors the sweep's own filter, so this column explains why something did not fire.
      const eligible =
        !inv.isArchived &&
        !inv.isDeleted &&
        ['pending', 'partiallyPaid', 'overdue'].includes(inv.state) &&
        r.sent === false &&
        dueAt instanceof Date &&
        dueAt.getTime() <= now;

      const why = r.sent
        ? 'already sent'
        : inv.isArchived || inv.isDeleted
          ? 'archived/deleted'
          : !['pending', 'partiallyPaid', 'overdue'].includes(inv.state)
            ? `state=${inv.state}`
            : dueAt && dueAt.getTime() > now
              ? `not due until ${dueAt.toISOString()}`
              : 'ready';

      console.log(
        `  ${String(inv.number).padEnd(18)} ${eligible ? 'WILL FIRE ' : 'skipped   '} ${why}`,
      );
    }
    console.log('\nTo force one:  npm run reminders due <NUMBER>');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('reminders:', err instanceof Error ? err.message : err);
  process.exit(1);
});
