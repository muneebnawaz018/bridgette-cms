import mongoose, { type Model, type InferSchemaType } from 'mongoose';

const { Schema, model, models } = mongoose;

/**
 * When each scheduled job last actually ran.
 *
 * This is what makes the in-process scheduler survive restarts. A `setInterval` counts from
 * process start, so on a host that recycles the app (Passenger idling it out, a deploy, a
 * crash) a six-hour timer can be reset at hour five, every time, and the job silently never
 * runs. Elapsed time is measured against this row instead, so a restart costs nothing and a
 * job that came due while the app was down runs on the next tick after it comes back.
 *
 * The row doubles as the lock. Claiming is a conditional update, so two instances — or a
 * cron call landing at the same moment as a tick — cannot both take the same run.
 */
const jobRunSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    lastRunAt: { type: Date, required: true },
    lastResult: { type: Schema.Types.Mixed },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

export type JobRunDoc = InferSchemaType<typeof jobRunSchema>;

export const JobRun: Model<JobRunDoc> =
  (models.JobRun as Model<JobRunDoc>) ?? model<JobRunDoc>('JobRun', jobRunSchema);
