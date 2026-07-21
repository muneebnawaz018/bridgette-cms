import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { recordPayment, listPayments, recordPaymentSchema } from '@/modules/payments';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/invoices/:id/payments — ledger for an invoice.
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const { id } = await params;
  return ok(await listPayments(actor, id));
});

// POST /api/invoices/:id/payments — record a payment, recompute balance + state.
export const POST = handle<Ctx>(async (req, { params }) => {
  // Payments can carry a base64 proof image (~a few hundred KB after client compression, up to
  // a few MB), so this route allows a larger body than the default JSON cap. Still well under
  // the platform request limit.
  assertBodySize(req, 5_000_000);
  const actor = await requireWrite(Permission.PaymentRecord);
  const { id } = await params;
  const body = recordPaymentSchema.parse(await req.json());
  return ok(await recordPayment(actor, id, body), 201);
});
