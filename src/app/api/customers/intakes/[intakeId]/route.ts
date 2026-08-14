import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { Permission } from '@/modules/auth';
import { reviewIntake, reviewIntakeSchema } from '@/modules/customers';

type Ctx = { params: Promise<{ intakeId: string }> };

const reviewBody = reviewIntakeSchema.extend({
  decision: z.enum(['approved', 'rejected']).default('approved'),
});

/*
 * POST /api/customers/intakes/:intakeId — apply a submission to the customer record.
 *
 * `fields` names what staff accepted; the service filters it against its own allowlist rather
 * than trusting it, so a hand-made request naming `reseller` or `products` applies nothing. An
 * empty list is legitimate and means "read it, changed nothing".
 */
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.CustomerEdit);
  const { intakeId } = await params;
  const { fields, decision } = reviewBody.parse(await req.json());

  return ok(await reviewIntake(actor, intakeId, fields, decision));
});
