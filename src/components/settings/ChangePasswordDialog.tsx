'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useSnackbar } from 'notistack';
import { PasswordField } from '@/components/form/PasswordField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SessionScopeDialog } from '@/components/settings/SessionScopeDialog';
import { apiPost } from '@/lib/api/client';

const EMPTY = { current: '', next: '', confirm: '' };

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
      setScopeOpen(true); // chain into the "where to stay signed in" choice
    } else {
      enqueueSnackbar(res.error ?? 'Could not change password', { variant: 'error' });
    }
  }

  return (
    <>
      <Dialog open={open} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Change password</DialogTitle>
        <form onSubmit={submit}>
          <DialogContent>
            <DialogContentText sx={{ color: 'text.secondary', mb: 2 }}>
              Enter your current password, then choose a new one of at least 8 characters.
            </DialogContentText>
            <Stack spacing={2}>
              <PasswordField label="Current password" value={pw.current} onChange={set('current')} required fullWidth disabled={saving} autoComplete="current-password" autoFocus />
              <PasswordField label="New password" value={pw.next} onChange={set('next')} required fullWidth disabled={saving} autoComplete="new-password" />
              <PasswordField label="Confirm new password" value={pw.confirm} onChange={set('confirm')} required fullWidth disabled={saving} autoComplete="new-password" />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={close} disabled={saving} color="inherit">
              Cancel
            </Button>
            <SubmitButton type="submit" variant="contained" loading={saving} disabled={!filled}>
              Update password
            </SubmitButton>
          </DialogActions>
        </form>
      </Dialog>

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
