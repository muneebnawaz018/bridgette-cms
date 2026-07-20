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
  assertBodySize(req);
  const actor = await requireWrite(Permission.PaymentRecord);
  const { id } = await params;
  const body = recordPaymentSchema.parse(await req.json());
  return ok(await recordPayment(actor, id, body), 201);
});
