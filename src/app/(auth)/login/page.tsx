'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MuiLink from '@mui/material/Link';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { apiPost } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await apiPost('/api/auth/login', { email, password });
    setLoading(false);
    if (res.ok) {
      enqueueSnackbar('Signed in', { variant: 'success' });
      router.push('/dashboard');
    } else {
      enqueueSnackbar(res.error ?? 'Login failed', { variant: 'error' });
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Bridgette Enterprises — Management Portal">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            fullWidth
            autoComplete="email"
            disabled={loading}
          />
          <PasswordField
            label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            fullWidth
            autoComplete="current-password"
            disabled={loading}
          />
          <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
            {loading ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
          <MuiLink
            component={Link}
            href="/forgot-password"
            variant="body2"
            align="center"
            sx={loading ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
          >
            Forgot password?
          </MuiLink>
        </Stack>
      </form>
    </AuthCard>
  );
}
