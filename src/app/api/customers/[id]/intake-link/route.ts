import { handle, ok } from '@/lib/api/respond';
import { requireWrite } from '@/lib/security/guard';
import { Permission } from '@/modules/auth';
import { issueIntakeLink } from '@/modules/customers';

type Ctx = { params: Promise<{ id: string }> };

/*
 * POST /api/customers/:id/intake-link — mint a link for a customer already on file.
 *
 * Minting only. Sending it lives at /api/customers/intake-link/email, because issuing
 * invalidates the previous link: an endpoint that did both would mean "also email this" quietly
 * broke the URL staff had already copied or sent over WhatsApp.
 */
export const POST = handle<Ctx>(async (_req, { params }) => {
  const actor = await requireWrite(Permission.CustomerEdit);
  const { id } = await params;
  const invite = await issueIntakeLink(actor, id);

  return ok({ url: invite.url, expiresAt: invite.expiresAt });
});
