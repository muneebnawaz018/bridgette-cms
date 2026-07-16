'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { apiPatch } from '@/lib/api/client';

const FORM_ID = 'edit-profile-form';

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
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Edit profile"
      icon={<EditRounded />}
      maxWidth="xs"
      busy={saving}
      actions={
        <>
          <Button onClick={onClose} disabled={saving} color="inherit">
            Cancel
          </Button>
          <SubmitButton type="submit" form={FORM_ID} variant="contained" loading={saving}>
            Save changes
          </SubmitButton>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth disabled={saving} autoFocus />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth disabled={saving} placeholder="Optional" />
        </Stack>
      </form>
    </Modal>
  );
}
