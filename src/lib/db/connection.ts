import mongoose from 'mongoose';

/**
 * Cached MongoDB connection (singleton).
 *
 * Next.js hot-reloads modules in dev and reuses warm containers in serverless, which
 * would otherwise open a new connection on every reload/invocation. We cache the
 * connection AND the in-flight promise on `globalThis` so a single pooled connection is
 * shared across reloads and invocations.
 *
 * Note on closing: do NOT close the connection per request in the app — the pool is meant
 * to stay warm and shared. Closing belongs only in one-off scripts/tests (use
 * `disconnectDb`). The seed script disconnects when it finishes.
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

/** Close the connection. Use only in scripts/tests — never per request in the app. */
export async function disconnectDb(): Promise<void> {
  if (cache.conn) {
    await cache.conn.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
