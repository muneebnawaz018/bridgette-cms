import mongoose from 'mongoose';

/**
 * Cached MongoDB connection.
 *
 * Next.js hot-reloads modules in dev, which would open a new connection on every
 * change. We cache the connection (and the in-flight promise) on `globalThis` so a
 * single pooled connection is reused across reloads and across serverless invocations.
 */

const MONGODB_URI = process.env.MONGODB_URI;

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis._mongoose ?? { conn: null, promise: null };
globalThis._mongoose = cache;

export async function connectDb(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Add it to .env.local');
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
