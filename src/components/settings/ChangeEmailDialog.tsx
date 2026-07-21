'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import MailRounded from '@mui/icons-material/MailRounded';
import { useSnackbar } from 'notistack';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { apiPost } from '@/lib/api/client';

const FORM_ID = 'change-email-form';

/**
 * Two-step email change. Step 1 verifies the current password and mails a code to the new
 * address; step 2 confirms that code before the account switches over.
 */
export function ChangeEmailDialog({
  open,
  onClose,
  currentEmail,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  currentEmail: string;
  onChanged: (email: string) => void;
}) {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep('request');
    setNewEmail('');
    setPassword('');
    setCode('');
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    if (step === 'request') {
      const res = await apiPost('/api/auth/email/request', {
        newEmail: newEmail.trim(),
        currentPassword: password,
      });
      setBusy(false);
      if (res.ok) {
        enqueueSnackbar('Verification code sent to the new email', { variant: 'success' });
        setStep('verify');
      } else {
        enqueueSnackbar(res.error ?? 'Could not start email change', { variant: 'error' });
      }
      return;
    }
    const res = await apiPost<{ email: string }>('/api/auth/email/confirm', { code: code.trim() });
    setBusy(false);
    if (res.ok && res.data) {
      enqueueSnackbar('Email updated', { variant: 'success' });
      onChanged(res.data.email);
      reset();
      onClose();
      router.refresh();
    } else {
      enqueueSnackbar(res.error ?? 'Could not confirm the code', { variant: 'error' });
    }
  }

  const canSubmit =
    step === 'request' ? Boolean(newEmail.trim() && password) : code.trim().length >= 4;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Change email"
      description={
        step === 'request'
          ? 'Confirm your password and enter the new email. We will send a code to verify it.'
          : `Enter the code we sent to ${newEmail}.`
      }
      icon={<MailRounded />}
      maxWidth="xs"
      busy={busy}
      actions={
        <>
          {step === 'verify' && (
            <Button
              onClick={() => setStep('request')}
              disabled={busy}
              variant="outlined"
              color="inherit"
              startIcon={<ArrowBackRounded />}
            >
              Back
            </Button>
          )}
          <Button
            onClick={close}
            disabled={busy}
            variant="outlined"
            color="inherit"
            startIcon={<CloseRounded />}
          >
            Cancel
          </Button>
          <SubmitButton
            type="submit"
            form={FORM_ID}
            variant="contained"
            loading={busy}
            disabled={!canSubmit}
            startIcon={step === 'request' ? <SendRounded /> : <CheckRounded />}
          >
            {step === 'request' ? 'Send' : 'Confirm'}
          </SubmitButton>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        {step === 'request' ? (
          <Stack spacing={2}>
            <TextField label="Current email" value={currentEmail} fullWidth disabled />
            <TextField
              label="New email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              fullWidth
              disabled={busy}
              autoFocus
            />
            <PasswordField
              label="Current password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              disabled={busy}
              autoComplete="current-password"
            />
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <TextField
              label="Verification code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              fullWidth
              disabled={busy}
              autoFocus
              inputProps={{
                inputMode: 'numeric',
                maxLength: 6,
                style: { letterSpacing: 6, fontSize: '1.1rem' },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              The code expires in 15 minutes. Check spam if it does not arrive.
            </Typography>
          </Stack>
        )}
      </form>
    </Modal>
  );
}
