'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import LockResetRounded from '@mui/icons-material/LockResetRounded';
import { useSnackbar } from 'notistack';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { SessionScopeDialog } from '@/components/settings/SessionScopeDialog';
import { apiPost } from '@/lib/api/client';

const EMPTY = { current: '', next: '', confirm: '' };
const FORM_ID = 'change-password-form';

/**
 * Change-password modal. On success it does NOT close immediately — it opens the
 * session-scope dialog on top (so the user decides where to stay signed in), then both
 * close together.
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [pw, setPw] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setPw((p) => ({ ...p, [k]: e.target.value }));

  const filled = pw.current && pw.next && pw.confirm;

  function close() {
    if (saving) return;
    setPw(EMPTY);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      enqueueSnackbar('New passwords do not match', { variant: 'warning' });
      return;
    }
    if (pw.next.length < 8) {
      enqueueSnackbar('New password must be at least 8 characters', { variant: 'warning' });
      return;
    }
    setSaving(true);
    const res = await apiPost('/api/auth/password', { currentPassword: pw.current, newPassword: pw.next });
    setSaving(false);
    if (res.ok) {
      enqueueSnackbar('Password changed', { variant: 'success' });
      setPw(EMPTY);
      setScopeOpen(true);
    } else {
      enqueueSnackbar(res.error ?? 'Could not change password', { variant: 'error' });
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title="Change password"
        description="Enter your current password, then choose a new one of at least 8 characters."
        icon={<LockResetRounded />}
        maxWidth="xs"
        busy={saving}
        actions={
          <>
            <Button onClick={close} disabled={saving} variant="outlined" color="inherit">
              Cancel
            </Button>
            <SubmitButton type="submit" form={FORM_ID} variant="contained" loading={saving} disabled={!filled}>
              Save
            </SubmitButton>
          </>
        }
      >
        <form id={FORM_ID} onSubmit={submit}>
          <Stack spacing={2}>
            <PasswordField label="Current password" value={pw.current} onChange={set('current')} required fullWidth disabled={saving} autoComplete="current-password" autoFocus />
            <PasswordField label="New password" value={pw.next} onChange={set('next')} required fullWidth disabled={saving} autoComplete="new-password" />
            <PasswordField label="Confirm new password" value={pw.confirm} onChange={set('confirm')} required fullWidth disabled={saving} autoComplete="new-password" />
          </Stack>
        </form>
      </Modal>

      <SessionScopeDialog
        open={scopeOpen}
        onClose={() => {
          setScopeOpen(false);
          onClose();
        }}
      />
    </>
  );
}
