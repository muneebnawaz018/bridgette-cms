'use client';

import { useState } from 'react';
import Link from 'next/link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import MuiLink from '@mui/material/Link';
import { AuthCard } from '@/components/auth/AuthCard';
import { apiPost } from '@/lib/api/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await apiPost('/api/auth/forgot', { email });
    setLoading(false);
    setSent(true);
  }

  return (
    <AuthCard title="Forgot password" subtitle="We'll email you a reset link">
      {sent ? (
        <Stack spacing={2}>
          <Alert severity="success">
            If an account exists for {email}, a reset link is on its way.
          </Alert>
          <MuiLink component={Link} href="/login" variant="body2" align="center">
            Back to sign in
          </MuiLink>
        </Stack>
      ) : (
        <form onSubmit={submit}>
          <Stack spacing={2}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <MuiLink component={Link} href="/login" variant="body2" align="center">
              Back to sign in
            </MuiLink>
          </Stack>
        </form>
      )}
    </AuthCard>
  );
}
