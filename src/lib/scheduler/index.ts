import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { JobRun } from './job-run.model';

/** How often to look. Cheap: one indexed read that usually decides there is nothing to do. */
const TICK_MS = 5 * 60 * 1000;

export interface ScheduledJob {
  name: string;
  everyMinutes: number;
  run: () => Promise<unknown>;
}

async function claim(name: string, everyMinutes: number): Promise<boolean> {
  await connectDb();

  // Ensure the row exists, dated far enough back that the first tick runs immediately.
  await JobRun.updateOne(
    { name },
    { $setOnInsert: { name, lastRunAt: new Date(0) } },
    { upsert: true },
  );

  const dueBefore = new Date(Date.now() - everyMinutes * 60_000);
  const claimed = await JobRun.findOneAndUpdate(
    { name, lastRunAt: { $lte: dueBefore } },
    { $set: { lastRunAt: new Date() } },
  ).lean();

  return Boolean(claimed);
}

async function runIfDue(job: ScheduledJob): Promise<void> {
  let claimed = false;
  try {
    claimed = await claim(job.name, job.everyMinutes);
  } catch (err) {
    // A database blip must not kill the timer, or one bad minute stops every future run.
    logger.error('scheduler could not check whether a job was due', {
      job: job.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (!claimed) return;

  try {
    const result = await job.run();
    await JobRun.updateOne({ name: job.name }, { $set: { lastResult: result, lastError: null } });
    logger.info('scheduled job finished', { job: job.name, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The claim stands, so a failing job waits a full interval instead of retrying in a loop.
    await JobRun.updateOne({ name: job.name }, { $set: { lastError: message } });
    logger.error('scheduled job failed', { job: job.name, error: message });
  }
}

/** Whether to run jobs in this process. Off in development so working on the app cannot
 *  quietly send real email; set SCHEDULER_ENABLED=true to override either way. */
function enabled(): boolean {
  const flag = process.env.SCHEDULER_ENABLED;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

// Next re-evaluates modules on hot reload, and instrumentation can register more than once.
// Without this guard every reload would leave another live timer behind.
const GLOBAL_KEY = '__bridgetteScheduler';
type SchedulerGlobal = typeof globalThis & { [GLOBAL_KEY]?: NodeJS.Timeout };

export function startScheduler(jobs: ScheduledJob[]): void {
  if (!enabled()) {
    logger.info('scheduler disabled in this environment', { nodeEnv: process.env.NODE_ENV });
    return;
  }

  const g = globalThis as SchedulerGlobal;
  if (g[GLOBAL_KEY]) return;

  const tick = () => {
    for (const job of jobs) void runIfDue(job);
  };

  const timer = setInterval(tick, TICK_MS);
  // Never hold the process open on this alone.
  timer.unref?.();
  g[GLOBAL_KEY] = timer;

  logger.info('scheduler started', {
    tickMinutes: TICK_MS / 60_000,
    jobs: jobs.map((j) => `${j.name}@${j.everyMinutes}m`),
  });

  // Catch up straight away: the app may have been down when something came due.
  tick();
}
