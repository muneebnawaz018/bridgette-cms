'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { apiPost } from '@/lib/api/client';

type Field = 'email' | 'code' | 'password' | 'confirm';

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [form, setForm] = useState({ email: params.get('email') ?? '', code: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const set = (k: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      enqueueSnackbar('Passwords do not match', { variant: 'warning' });
      return;
    }
    setLoading(true);
    const res = await apiPost('/api/auth/verify', { email: form.email, code: form.code, password: form.password });

    if (!res.ok) {
      setLoading(false);
      enqueueSnackbar(res.error ?? 'Verification failed', { variant: 'error' });
      return;
    }

    enqueueSnackbar('Password set. You can sign in now.', { variant: 'success' });
    // Stays true so the global overlay covers the trip to the login page instead of leaving
    // this form on screen looking idle. Unmounting on arrival releases it.
    router.replace('/login');
    window.setTimeout(() => setLoading(false), 10_000);
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        <TextField label="Email" type="email" value={form.email} onChange={set('email')} required fullWidth disabled={loading} />
        <TextField label="Verification code" value={form.code} onChange={set('code')} required fullWidth disabled={loading} />
        <PasswordField label="New password" value={form.password} onChange={set('password')} required fullWidth disabled={loading} />
        <PasswordField label="Confirm password" value={form.confirm} onChange={set('confirm')} required fullWidth disabled={loading} />
        <SubmitButton type="submit" variant="contained" size="large" loading={loading} fullWidth>
          {loading ? 'Saving…' : 'Set password'}
        </SubmitButton>
      </Stack>
    </form>
  );
}

export default function SetPasswordPage() {
  return (
    <AuthCard title="Verify your account" subtitle="Enter the code we emailed you and choose a password">
      <Suspense fallback={<BrandLoader label="Loading…" />}>
        <SetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
