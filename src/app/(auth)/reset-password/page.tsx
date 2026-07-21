'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import Alert from '@mui/material/Alert';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { apiPost } from '@/lib/api/client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const userId = params.get('uid') ?? '';
  const code = params.get('code') ?? '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const set =
    (k: 'password' | 'confirm') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      enqueueSnackbar('Passwords do not match', { variant: 'warning' });
      return;
    }
    setLoading(true);
    const res = await apiPost('/api/auth/reset', { userId, code, password: form.password });

    if (!res.ok) {
      setLoading(false);
      enqueueSnackbar(res.error ?? 'Reset failed', { variant: 'error' });
      return;
    }

    enqueueSnackbar('Password reset. Sign in with your new password.', { variant: 'success' });
    // See the login page: holding `loading` keeps the overlay up across the navigation.
    router.replace('/login');
    window.setTimeout(() => setLoading(false), 10_000);
  }

  if (!userId || !code) {
    return <Alert severity="error">Invalid or incomplete reset link.</Alert>;
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        <PasswordField
          label="New password"
          value={form.password}
          onChange={set('password')}
          required
          fullWidth
          disabled={loading}
        />
        <PasswordField
          label="Confirm password"
          value={form.confirm}
          onChange={set('confirm')}
          required
          fullWidth
          disabled={loading}
        />
        <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
          {loading ? 'Saving…' : 'Reset password'}
        </SubmitButton>
      </Stack>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Reset password" subtitle="Choose a new password">
      <Suspense fallback={<BrandLoader label="Loading…" />}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
