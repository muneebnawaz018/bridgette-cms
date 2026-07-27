import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  getCustomer,
  updateCustomer,
  deleteCustomer,
  customerUpdateSchema,
  deleteCustomerSchema,
} from '@/modules/customers';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/customers/:id
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.CustomerView);
  const { id } = await params;
  const customer = await getCustomer(actor, id);
  return ok(customer);
});

// PATCH /api/customers/:id — edit (admin only).
export const PATCH = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.CustomerEdit);
  const { id } = await params;
  const body = customerUpdateSchema.parse(await req.json());
  const customer = await updateCustomer(actor, id, body);
  return ok(customer);
});

// DELETE /api/customers/:id — soft-delete (never hard-deletes), admin only.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.CustomerDelete);
  const { id } = await params;
  const { reason } = deleteCustomerSchema.parse(await req.json().catch(() => ({})));
  const customer = await deleteCustomer(actor, id, reason);
  return ok(customer);
});
