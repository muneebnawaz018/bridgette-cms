import { handle, ok } from '@/lib/api/respond';
import { requireLimited } from '@/lib/security/guard';
import { LIMITS } from '@/lib/security/rateLimit';
import { Permission } from '@/modules/auth';
import { issueOpenInvite } from '@/modules/customers';

/*
 * POST /api/customers/invite — an open invitation for somebody not in the system yet.
 *
 * Creates no customer. The record is written when they submit the form, from what they tell us,
 * so a link nobody answers leaves nothing behind and clicking the button is not a write to the
 * customer list.
 *
 * Still rate-limited, and still needs CustomerCreate: a link handed out is a record that can be
 * created, even if the creating happens later.
 */
export const POST = handle(async () => {
  const actor = await requireLimited(
    Permission.CustomerCreate,
    'intake:invite',
    LIMITS.intakeInvitePerUser,
  );
  const invite = await issueOpenInvite(actor);

  return ok({ url: invite.url, expiresAt: invite.expiresAt });
});
