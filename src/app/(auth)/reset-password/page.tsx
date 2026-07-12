'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { AuthCard } from '@/components/auth/AuthCard';
import { apiPost } from '@/lib/api/client';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const userId = params.get('uid') ?? '';
  const code = params.get('code') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const res = await apiPost('/api/auth/reset', { userId, code, password });
    setLoading(false);
    if (res.ok) router.push('/login');
    else setError(res.error ?? 'Reset failed');
  }

  if (!userId || !code) {
    return <Alert severity="error">Invalid or incomplete reset link.</Alert>;
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
        <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required fullWidth />
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
