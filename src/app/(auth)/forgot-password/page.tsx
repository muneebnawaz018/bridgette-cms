'use client';

import { useState } from 'react';
import { AppLink } from '@/components/ui/AppLink';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import MuiLink from '@mui/material/Link';
import { AuthCard } from '@/components/auth/AuthCard';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { apiPost } from '@/lib/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await apiPost('/api/auth/forgot', { email });
    setLoading(false);

    // The result used to be discarded, so the success panel rendered no matter what came
    // back. That hid the per-address rate limit completely: the seventh request in an hour
    // returns 429 and looked identical to the six that worked. It hid real failures too — a
    // dead SMTP server or a 500 still told the user their link was on its way.
    //
    // Showing the error does not leak whether the account exists: a 429 is about how often
    // this address has been *asked for*, which the caller already knows, and the success
    // message stays deliberately non-committal.
    if (!res.ok) {
      setError(res.error ?? 'Could not send the reset link. Try again in a moment.');
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a reset link">
      {sent ? (
        <Stack spacing={2}>
          <Alert severity="success">
            If an account exists for {email}, a reset link is on its way.
          </Alert>
          <MuiLink component={AppLink} href="/login" variant="body2" align="center">
            Back to sign in
          </MuiLink>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              disabled={loading}
            />
            <SubmitButton
              type="submit"
              variant="contained"
              size="large"
              loading={loading}
              fullWidth
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </SubmitButton>
            <MuiLink component={AppLink} href="/login" variant="body2" align="center">
              Back to sign in
            </MuiLink>
          </Stack>
        </form>
      )}
    </AuthCard>
  );
}
