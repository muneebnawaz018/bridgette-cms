'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppLink } from '@/components/ui/AppLink';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MuiLink from '@mui/material/Link';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';
import { apiPost } from '@/lib/api/client';

export default function LoginPage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  // The challenge only appears once the server says this account has failed too often, so
  // someone signing in normally never meets it.
  const [captchaNeeded, setCaptchaNeeded] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const set = (k: 'email' | 'password') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Warm the dashboard while the password is still being typed, so signing in doesn't wait
  // on a cold route.
  useEffect(() => {
    router.prefetch('/dashboard');
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const res = await apiPost('/api/auth/login', {
      ...form,
      ...(captchaToken ? { turnstileToken: captchaToken } : {}),
    });

    if (!res.ok) {
      setLoading(false);
      // The server decides when a challenge is required; the form just obeys.
      if ((res.details as { captchaRequired?: boolean } | undefined)?.captchaRequired) {
        setCaptchaNeeded(true);
      }
      // A token is single-use, so clear it whatever went wrong.
      setCaptchaToken(null);
      enqueueSnackbar(res.error ?? 'Login failed', { variant: 'error' });
      return;
    }

    enqueueSnackbar('Signed in', { variant: 'success' });
    // `loading` deliberately stays true. It holds the global overlay open across the
    // navigation; clearing it here left the login form sitting there looking idle while the
    // dashboard loaded, which read as nothing having happened. This page unmounts on
    // arrival, which releases the overlay. `replace` so Back doesn't return to a form the
    // user is already past.
    router.replace('/dashboard');

    // Failsafe: if that navigation never lands, don't strand the user behind an overlay
    // with no way out. A no-op once this page has unmounted.
    window.setTimeout(() => setLoading(false), 10_000);
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
          {captchaNeeded && <TurnstileWidget onToken={setCaptchaToken} />}
          {/* Static label: the global overlay is what says a request is in flight. */}
          <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
            Sign in
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
