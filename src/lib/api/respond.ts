import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from '@/lib/logger/logger';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/** Map a thrown error to a JSON error response. */
function errorResponse(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return fail('Validation failed', 422, err.flatten());
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  if (message === 'Unauthorized') return fail(message, 401);
  if (message.startsWith('Forbidden')) return fail(message, 403);
  return fail(message, 400);
}

/**
 * Wraps a route handler:
 * - turns thrown errors into clean JSON responses (Zod→422, Unauthorized→401, Forbidden→403)
 * - logs every request morgan-style: METHOD /path STATUS durationMs
 */
export function handle<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<NextResponse>,
): (req: Request, ctx: Ctx) => Promise<NextResponse> {
  return async (req: Request, ctx: Ctx) => {
    const start = performance.now();
    const path = new URL(req.url).pathname;
    let res: NextResponse;
    let errMeta: unknown;
    try {
      res = await fn(req, ctx);
    } catch (err) {
      res = errorResponse(err);
      errMeta = err instanceof Error ? err.message : err;
    }
    logger.request(req.method, path, res.status, performance.now() - start, errMeta);
    return res;
  };
}
