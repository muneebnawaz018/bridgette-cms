'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { apiPost } from '@/lib/api/client';

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      enqueueSnackbar('Passwords do not match', { variant: 'warning' });
      return;
    }
    setLoading(true);
    const res = await apiPost('/api/auth/verify', { email, code, password });
    setLoading(false);
    if (res.ok) {
      enqueueSnackbar('Password set. You can sign in now.', { variant: 'success' });
      router.push('/login');
    } else {
      enqueueSnackbar(res.error ?? 'Verification failed', { variant: 'error' });
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
        <TextField label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} required fullWidth />
        <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
        <PasswordField label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required fullWidth />
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
      <Suspense fallback={null}>
        <SetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
