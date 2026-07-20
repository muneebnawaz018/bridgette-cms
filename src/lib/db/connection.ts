import mongoose from 'mongoose';

/**
 * Cached MongoDB connection (singleton).
 *
 * Next.js hot-reloads modules in dev and reuses warm containers in serverless, which
 * would otherwise open a new connection on every reload/invocation. We cache the
 * connection AND the in-flight promise on `globalThis` so a single pooled connection is
 * shared across reloads and invocations.
 *
 * Note on closing: do NOT close the connection per request in the app. The pool is meant to
 * stay warm and shared. Closing belongs only in one-off scripts, which call
 * `mongoose.disconnect()` directly, as the seed script does when it finishes.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis._mongoose ?? { conn: null, promise: null };
globalThis._mongoose = cache;

// Query logging is opt-in via MONGOOSE_DEBUG=true. It prints (and serializes) every
// collection op, which adds real per-request overhead in dev, so it stays off by default.
if (process.env.MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true);
}

const CONNECT_OPTIONS: mongoose.ConnectOptions = {
  bufferCommands: false,
  maxPoolSize: 10,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 10_000,
  socketTimeoutMS: 45_000,
};

/**
 * Server-side cap on how long any single query may run.
 *
 * Without it, one pathological query (an unindexed scan over a large collection, a
 * regex that degenerates) holds a connection from a pool of 10 for as long as Mongo is
 * willing to work on it. A handful of those and every other request queues behind them,
 * which turns one slow query into a site-wide outage. `maxTimeMS` makes the server abort
 * it instead, so the connection comes back.
 *
 * 10s is far above any query this app makes on purpose and far below anything a user
 * would wait out.
 */
const QUERY_TIMEOUT_MS = Number(process.env.MONGO_QUERY_TIMEOUT_MS ?? 10_000);

// Registered before any model compiles, so it applies to every schema in the app. Guarded
// by a module-level flag because Next's hot reload re-runs this file.
declare global {
  var _mongoTimeoutPluginInstalled: boolean | undefined;
}
if (!globalThis._mongoTimeoutPluginInstalled) {
  globalThis._mongoTimeoutPluginInstalled = true;

  mongoose.plugin((schema: mongoose.Schema) => {
    // Query middleware: find/count/update/delete all expose maxTimeMS().
    schema.pre(
      /^(find|count|distinct|update|delete|replace|estimatedDocumentCount)/,
      function (this: mongoose.Query<unknown, unknown>, next: (err?: Error) => void) {
        if (this.getOptions().maxTimeMS === undefined) this.maxTimeMS(QUERY_TIMEOUT_MS);
        next();
      },
    );

    // Aggregations take it as a pipeline option rather than a query method.
    schema.pre(
      'aggregate',
      function (this: mongoose.Aggregate<unknown>, next: (err?: Error) => void) {
        const options = this.options ?? {};
        if (options.maxTimeMS === undefined) this.option({ maxTimeMS: QUERY_TIMEOUT_MS });
        next();
      },
    );
  });
}

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set. Add it to .env.local');

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, CONNECT_OPTIONS);
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    // Reset so the next call retries instead of awaiting a permanently-rejected promise.
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}

