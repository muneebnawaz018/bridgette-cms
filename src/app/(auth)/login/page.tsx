'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLink } from '@/components/ui/AppLink';
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
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = (k: 'email' | 'password') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await apiPost('/api/auth/login', form);
    setLoading(false);
    if (res.ok) {
      enqueueSnackbar('Signed in', { variant: 'success' });
      router.push('/dashboard');
    } else {
      enqueueSnackbar(res.error ?? 'Login failed', { variant: 'error' });
    }
  }

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to your account to continue.">
      <form onSubmit={submit}>
        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            fullWidth
            autoComplete="email"
            disabled={loading}
          />
          <PasswordField
            label="Password"
            value={form.password}
            onChange={set('password')}
            required
            fullWidth
            autoComplete="current-password"
            disabled={loading}
          />
          <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
            {loading ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
          <MuiLink
            component={AppLink}
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
