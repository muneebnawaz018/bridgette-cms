import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi/spec';

// Serves the raw OpenAPI document (consumed by the Scalar UI at /api-docs).
export function GET() {
  return NextResponse.json(openApiSpec);
}
