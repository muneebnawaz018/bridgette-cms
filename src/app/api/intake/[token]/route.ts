import { handle, ok, fail } from '@/lib/api/respond';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';
import { openIntake, submitIntake, customerIntakeSubmitSchema } from '@/modules/customers';

type Ctx = { params: Promise<{ token: string }> };

/*
 * The customer-facing intake endpoint — the only unauthenticated write in the app, so the
 * boundaries are drawn here rather than left to the caller.
 *
 * A 5MB certificate arrives as a base64 data URL, which inflates it by a third, so this route
 * carries its own body ceiling. The shared 1.5MB default would reject a legitimate scan.
 */
const INTAKE_BODY_LIMIT = 8_000_000;

/**
 * GET — what the form needs to render: the customer's name, and nothing else.
 *
 * A bad, expired or spent token is a flat 404 with the same wording in every case. Telling the
 * difference between "no such link" and "that link was already used" would confirm which tokens
 * exist, and the customer's next step is identical either way: ask for a new one.
 */
export const GET = handle<Ctx>(async (req, { params }) => {
  await enforce(`intake:open:${clientIp(req)}`, LIMITS.intakeOpenPerIp);
  const { token } = await params;

  const intake = await openIntake(token);
  if (!intake) return fail('This link is no longer valid. Ask us for a new one.', 404);

  // Nothing about anybody comes back: an invitation belongs to no record until it is answered.
  return ok({ valid: true });
});

/** POST — submit the form. Consumes the link; a second attempt gets the same 404 as above. */
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req, INTAKE_BODY_LIMIT);
  const ip = clientIp(req);
  await enforce(`intake:submit:${ip}`, LIMITS.intakeSubmitPerIp);

  const { token } = await params;
  const body = customerIntakeSubmitSchema.parse(await req.json());

  const result = await submitIntake(token, body, {
    ip,
    // Trimmed: this is stored on the submission for the audit trail, not parsed, and a header
    // that long is either a bug or someone probing.
    userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? undefined,
  });

  return ok({ submitted: true, name: result.name });
});
