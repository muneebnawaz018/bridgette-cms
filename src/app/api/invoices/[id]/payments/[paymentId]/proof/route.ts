import { NextResponse } from 'next/server';
import { handle } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { getPaymentProof } from '@/modules/payments';

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

// GET /api/invoices/:id/payments/:paymentId/proof — the proof image, decoded to bytes and
// served inline so a browser tab renders it. Visibility follows the invoice (same rule the
// ledger applies), so a proof is never reachable by anyone who cannot see the invoice.
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const { id, paymentId } = await params;
  const proof = await getPaymentProof(actor, id, paymentId);

  const base64 = proof.data.slice(proof.data.indexOf(',') + 1);
  const bytes = Buffer.from(base64, 'base64');
  const filename = (proof.name || 'proof.jpg').replace(/["\r\n]/g, '');

  // Defence in depth on top of the write-time allowlist: only known raster types are served
  // inline; anything else is handed back as an opaque download rather than rendered. The CSP
  // neutralises any active content that ever reaches here, and nosniff stops the browser from
  // second-guessing the declared type.
  const INLINE_IMAGE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const declared = (proof.contentType || 'image/jpeg').toLowerCase();
  const inlineable = INLINE_IMAGE.has(declared);
  const contentType = inlineable ? declared : 'application/octet-stream';
  const disposition = inlineable ? 'inline' : 'attachment';

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
      // Private: the image can carry account details; never let a shared cache hold it.
      'Cache-Control': 'private, max-age=300',
    },
  });
});
