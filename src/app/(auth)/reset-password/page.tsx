'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { useSnackbar } from 'notistack';
import { AuthCard } from '@/components/auth/AuthCard';
import { PasswordField } from '@/components/form/PasswordField';
import { apiPost } from '@/lib/api/client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const userId = params.get('uid') ?? '';
  const code = params.get('code') ?? '';
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
    const res = await apiPost('/api/auth/reset', { userId, code, password });
    setLoading(false);
    if (res.ok) {
      enqueueSnackbar('Password reset — sign in with your new password', { variant: 'success' });
      router.push('/login');
    } else {
      enqueueSnackbar(res.error ?? 'Reset failed', { variant: 'error' });
    }
  }

  if (!userId || !code) {
    return <Alert severity="error">Invalid or incomplete reset link.</Alert>;
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
        <PasswordField label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required fullWidth />
        <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
          {loading ? 'Saving…' : 'Reset password'}
        </Button>
      </Stack>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Reset password" subtitle="Choose a new password">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthCard>
  );
}
