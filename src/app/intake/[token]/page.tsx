import type { Metadata } from 'next';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import LinkOffRounded from '@mui/icons-material/LinkOffRounded';
import { openIntake } from '@/modules/customers';
import { colors } from '@/lib/colors';
import { IntakeForm, IntakeShell } from './IntakeForm';

/*
 * The customer-facing intake page. Deliberately outside (dashboard) and outside (auth): it has
 * no session, no rail, and no redirect for signed-in users — a staff member testing their own
 * link should see exactly what the customer sees.
 *
 * The token is resolved here on the server, so an invalid link renders as a plain message rather
 * than a form that only fails once it has been filled in.
 */

export const metadata: Metadata = {
  title: 'Your details',
  // A one-time invitation link has no business in an index.
  robots: { index: false, follow: false },
};

/** Every render depends on token state that changes as links are used. Never cache it. */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ token: string }> };

export default async function IntakePage({ params }: Props) {
  const { token } = await params;
  const intake = await openIntake(token);

  if (!intake) {
    return (
      <IntakeShell>
        <Paper sx={{ p: { xs: 3, sm: 5 }, textAlign: 'center' }}>
          <LinkOffRounded sx={{ fontSize: 52, color: colors.ink[300] }} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 1.5 }}>
            This link is no longer valid
          </Typography>
          {/* Expired, already used and never-existed all read the same on purpose — the customer's
              next step is identical, and distinguishing them would confirm which links exist. */}
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            It may have expired or already been used. Reply to the email we sent you and we will
            send a fresh one.
          </Typography>
        </Paper>
      </IntakeShell>
    );
  }

  return (
    // The heading belongs to the form, not to this page: it has to disappear once the form is
    // submitted, and "fill in your details" sitting above a thank-you card reads as a failure.
    <IntakeShell>
      <IntakeForm token={token} />
    </IntakeShell>
  );
}
