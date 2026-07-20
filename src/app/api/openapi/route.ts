import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi/spec';
import { getSession } from '@/modules/auth';

/**
 * Serves the raw OpenAPI document (consumed by the Scalar UI at /api-docs).
 *
 * Signed-in only in production. The spec is a complete map of the API: every route, every
 * parameter, every shape. That is a gift to anyone probing the app and no use at all to a
 * stranger, so it stays behind the same session as the rest of the product. Development
 * leaves it open so the docs are usable before you have an account.
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.json(openApiSpec);
}
