import 'server-only';
import pino from 'pino';

/**
 * Structured logger backed by pino.
 *
 * - Production: newline-delimited JSON on stdout (ready for log shipping / transports).
 * - Development: pretty, colorized output via pino-pretty.
 *
 * The public interface (info/warn/error/request) is stable — swapping the backend only
 * touches this file. Server-only (pino uses Node APIs; not for the edge runtime).
 */
const isProd = process.env.NODE_ENV === 'production';

const base = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  base: undefined, // drop pid/hostname noise
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
        },
      }),
});

function line(level: 'info' | 'warn' | 'error', message: string, meta?: unknown): void {
  if (meta !== undefined) base[level]({ meta }, message);
  else base[level](message);
}

export const logger = {
  info: (message: string, meta?: unknown) => line('info', message, meta),
  warn: (message: string, meta?: unknown) => line('warn', message, meta),
  error: (message: string, meta?: unknown) => line('error', message, meta),

  /** morgan-style API request log with structured fields. */
  request(method: string, path: string, status: number, durationMs: number, meta?: unknown) {
    const fields = {
      method,
      path,
      status,
      durationMs: Number(durationMs.toFixed(1)),
      ...(meta !== undefined ? { err: meta } : {}),
    };
    const msg = `${method} ${path} ${status} ${durationMs.toFixed(1)}ms`;
    if (status >= 500) base.error(fields, msg);
    else if (status >= 400) base.warn(fields, msg);
    else base.info(fields, msg);
  },
};
