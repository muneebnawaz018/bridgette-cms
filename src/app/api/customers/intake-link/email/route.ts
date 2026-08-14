import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requireLimited } from '@/lib/security/guard';
import { LIMITS } from '@/lib/security/rateLimit';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { Permission } from '@/modules/auth';
import { emailExistingIntakeLink } from '@/modules/customers';

const bodySchema = z.object({
  /** The plaintext token from the URL staff are looking at. Verified against its stored hash. */
  token: z.string().min(1).max(200),
  to: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'An email address is required')
    .email('Enter a valid email address'),
  /*
   * Who to address the message to. Greeting only: it is never written to the customer record,
   * because the customer states their own name on the form and a name typed from memory here
   * would otherwise overwrite the one they actually go by.
   */
  name: z.string().trim().max(160).optional(),
});

/*
 * POST /api/customers/intake-link/email — send an already-minted link to a typed address.
 *
 * Separate from minting on purpose. Issuing a link invalidates the previous one, so an "email
 * it" that re-minted would break the URL staff had already copied or sent over WhatsApp. This
 * sends the exact link in front of them.
 *
 * The address is for delivery only and is never written to the customer record — the customer
 * supplies their own billing email through the form.
 */
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireLimited(
    Permission.CustomerEdit,
    'intake:invite:email',
    LIMITS.intakeInviteEmailPerUser,
  );
  const { token, to, name } = bodySchema.parse(await req.json());

  return ok(await emailExistingIntakeLink(actor, token, to, name));
});
