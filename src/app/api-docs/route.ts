import { ApiReference } from '@scalar/nextjs-api-reference';

// Interactive API docs (Scalar) rendered from our OpenAPI spec.
export const GET = ApiReference({
  url: '/api/openapi',
  theme: 'default',
});
