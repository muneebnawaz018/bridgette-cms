'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { apiPatch } from '@/lib/api/client';
import { fileToAvatarDataUrl } from '@/lib/image/avatar';

const FORM_ID = 'edit-profile-form';

export interface ProfileDraft {
  name: string;
  phone: string;
  avatarUrl: string | null;
}

/**
 * Edit everything about your own profile that Settings does not already own: photo, name
 * and phone. Email and password live in Settings; role and status are admin-controlled.
 * The photo is staged locally and saved with the rest on Save.
 */
export function EditProfileDialog({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: ProfileDraft;
  onSaved: (next: { name: string; phone: string | null; avatarUrl: string | null }) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Reopening should show the current record, not whatever was typed last time.
  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setPhone(initial.phone);
    setAvatarUrl(initial.avatarUrl);
  }, [open, initial.name, initial.phone, initial.avatarUrl]);

  async function pickAvatar(file: File) {
    setProcessing(true);
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file, 256));
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not read that image', { variant: 'error' });
    } finally {
      setProcessing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      enqueueSnackbar('Name is required', { variant: 'warning' });
      return;
    }
    setSaving(true);
    // Only send the photo when it actually changed — no point re-uploading the same bytes.
    const avatarChanged = avatarUrl !== initial.avatarUrl;
    const res = await apiPatch<{ name: string; phone: string | null; avatarUrl: string | null }>('/api/auth/me', {
      name: name.trim(),
      phone: phone.trim(),
      ...(avatarChanged ? { avatarUrl } : {}),
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

  const busy = saving || processing;

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Edit profile"
      icon={<EditRounded />}
      maxWidth="sm"
      busy={busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} variant="outlined" color="inherit">
            Cancel
          </Button>
          <SubmitButton type="submit" form={FORM_ID} variant="contained" loading={saving} disabled={processing}>
            Save
          </SubmitButton>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AvatarPicker
              src={avatarUrl}
              fallback={(name || '?').charAt(0).toUpperCase()}
              title={name || 'Photo'}
              size={88}
              canEdit
              uploading={processing}
              onPick={pickAvatar}
            />
            <Box>
              <Typography variant="body2" color="text.secondary">
                Click the photo to view it, or use the edit button to pick a new one.
              </Typography>
              {avatarUrl && (
                <Button
                  onClick={() => setAvatarUrl(null)}
                  disabled={busy}
                  size="small"
                  color="inherit"
                  startIcon={<DeleteOutlineRounded fontSize="small" />}
                  sx={{ mt: 0.5 }}
                >
                  Remove photo
                </Button>
              )}
            </Box>
          </Box>

          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth disabled={busy} autoFocus />
          <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth disabled={busy} placeholder="Optional" />
        </Stack>
      </form>
    </Modal>
  );
}
