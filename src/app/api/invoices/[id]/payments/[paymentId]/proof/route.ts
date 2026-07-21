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
  const contentType = proof.contentType || 'image/jpeg';
  const filename = (proof.name || 'proof.jpg').replace(/["\r\n]/g, '');

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      // Private: the image can carry account details; never let a shared cache hold it.
      'Cache-Control': 'private, max-age=300',
    },
  });
});
