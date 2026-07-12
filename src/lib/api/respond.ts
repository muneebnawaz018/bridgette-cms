import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/**
 * Wraps a route handler: turns thrown errors into clean JSON responses.
 * - ZodError → 400 with field issues
 * - Error message "Unauthorized" → 401, "Forbidden..." → 403
 * - anything else → 400 (or 500 for unexpected)
 */
export function handle<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<NextResponse>,
): (req: Request, ctx: Ctx) => Promise<NextResponse> {
  return async (req: Request, ctx: Ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        return fail('Validation failed', 422, err.flatten());
      }
      const message = err instanceof Error ? err.message : 'Unexpected error';
      if (message === 'Unauthorized') return fail(message, 401);
      if (message.startsWith('Forbidden')) return fail(message, 403);
      return fail(message, 400);
    }
  };
}
