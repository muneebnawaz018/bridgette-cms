'use client';

import { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useSnackbar } from 'notistack';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { apiPatch } from '@/lib/api/client';

/** Edit your own name and phone (email/role/status stay read-only and admin-controlled). */
export function EditProfileDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: { name: string; phone: string };
  onSaved: (next: { name: string; phone: string | null }) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }
    setSaving(true);
    const res = await apiPatch<{ name: string; phone: string | null }>('/api/auth/me', {
      name: name.trim(),
      phone: phone.trim(),
    });
    setSaving(false);
    if (res.ok && res.data) {
      enqueueSnackbar('Profile updated', { variant: 'success' });
      onSaved(res.data);
      onClose();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update profile', { variant: 'error' });
    }
  }

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>Edit profile</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth disabled={saving} />
            <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth disabled={saving} placeholder="Optional" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={saving} color="inherit">
            Cancel
          </Button>
          <SubmitButton type="submit" variant="contained" loading={saving}>
            Save changes
          </SubmitButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}
