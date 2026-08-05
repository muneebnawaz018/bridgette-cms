import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  createCustomer,
  listCustomers,
  customerCreateSchemaChecked,
  listCustomerSchema,
} from '@/modules/customers';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// A reseller certificate rides along in the JSON body as a data URL, and base64 inflates a 4MB
// file to about 5.5MB — well past the shared default. Raised here only: every other route keeps
// the tighter limit.
const CUSTOMER_BODY_LIMIT = 6_000_000;

// GET /api/customers — paginated, company-wide list.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.CustomerView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listCustomerSchema.parse(params);
  const result = await listCustomers(actor, query);
  return ok(result);
});

// POST /api/customers — create (admin only).
export const POST = handle(async (req) => {
  assertBodySize(req, CUSTOMER_BODY_LIMIT);
  const actor = await requireWrite(Permission.CustomerCreate);
  const body = customerCreateSchemaChecked.parse(await req.json());
  const customer = await createCustomer(actor, body);
  return ok(customer, 201);
});
