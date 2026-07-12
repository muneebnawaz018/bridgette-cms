'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import { AuthCard } from '@/components/auth/AuthCard';
import { apiPost } from '@/lib/api/client';

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [code, setCode] = useState('');
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
    const res = await apiPost('/api/auth/verify', { email, code, password });
    setLoading(false);
    if (res.ok) router.push('/login');
    else setError(res.error ?? 'Verification failed');
  }

  return (
    <form onSubmit={submit}>
      <Stack spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
        <TextField label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} required fullWidth />
        <TextField label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
        <TextField label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required fullWidth />
        <Button type="submit" variant="contained" size="large" disabled={loading} fullWidth>
          {loading ? 'Saving…' : 'Set password'}
        </Button>
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
