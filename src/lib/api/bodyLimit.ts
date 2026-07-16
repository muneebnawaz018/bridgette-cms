/**
 * Reject oversized request bodies BEFORE `req.json()` buffers them into memory.
 *
 * Zod's own size caps (e.g. the avatar data URL) only run after the whole body has been
 * read and parsed, so they protect the database but not the process. This checks the
 * declared Content-Length up front and bails cheaply.
 *
 * Default 1.5MB: comfortably above a resized avatar data URL (~15–50KB) plus the rest of a
 * JSON payload, far below anything that would strain memory.
 */
export const MAX_JSON_BODY_BYTES = 1_500_000;

export function assertBodySize(req: Request, max: number = MAX_JSON_BODY_BYTES): void {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > max) {
    throw new Error('Request body is too large');
  }
}
