'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { PhoneField } from '@/components/ui/PhoneField';
import { TextInput } from '@/components/form/fields';
import { updateProfileSchema } from '@/modules/auth/schemas';
import { apiPatch } from '@/lib/api/client';
import { fileToAvatarDataUrl } from '@/lib/image/avatar';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_ISO2 } from '@/lib/format/countries';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

export interface ProfileDraft {
  name: string;
  phone: string;
  avatarUrl: string | null;
}

/**
 * Edit everything about your own profile that Settings does not already own: photo, name and
 * phone. Email and password live in Settings; role and status are admin-controlled. The photo
 * is staged locally and saved with the rest on Save.
 *
 * The phone uses the same country picker and the same E.164 storage as user management. It
 * used to be a plain text box here, which meant the number an admin saved for you and the one
 * you saved yourself were stored in two different formats.
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

  // Typed values live in a ref, so a keystroke never re-renders the dialog. See
  // components/form/fields for why.
  const nameRef = useRef(initial.name);
  const [phone, setPhone] = useState(() => splitPhone(initial.phone));
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatarUrl);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formKey, setFormKey] = useState(0);

  // Reopening should show the current record, not whatever was typed last time.
  useLayoutEffect(() => {
    if (!open) return;
    nameRef.current = initial.name;
    setPhone(splitPhone(initial.phone));
    setAvatarUrl(initial.avatarUrl);
    setErrors({});
    setFormKey((k) => k + 1);
  }, [open, initial.name, initial.phone, initial.avatarUrl]);

  const setName = useCallback((_field: string, value: string) => {
    nameRef.current = value;
  }, []);

  const handlePhone = useCallback((next: { iso2: string; national: string }) => {
    setPhone({ iso2: next.iso2, national: next.national });
  }, []);

  async function pickAvatar(file: File) {
    setProcessing(true);
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file, 256));
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not read that image', {
        variant: 'error',
      });
    } finally {
      setProcessing(false);
    }
  }

  async function submit() {
    // An empty number means "no phone", not an invalid one.
    const e164 = phone.national ? joinPhone(phone.iso2, phone.national) : '';
    const parsed = updateProfileSchema.safeParse({ name: nameRef.current.trim(), phone: e164 });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }

    setErrors({});
    setSaving(true);
    // Only send the photo when it actually changed — no point re-uploading the same bytes.
    const avatarChanged = avatarUrl !== initial.avatarUrl;
    const res = await apiPatch<{ name: string; phone: string | null; avatarUrl: string | null }>(
      '/api/auth/me',
      { ...parsed.data, ...(avatarChanged ? { avatarUrl } : {}) },
    );
    setSaving(false);

    if (!res.ok || !res.data) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(res.error ?? 'Could not update profile', { variant: 'error' });
      return;
    }
    enqueueSnackbar('Profile updated', { variant: 'success' });
    onSaved(res.data);
    onClose();
  }

  const busy = saving || processing;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      icon={<EditRounded />}
      maxWidth="sm"
      busy={busy}
      actions={
        <>
          <Button onClick={onClose} disabled={busy} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
            Cancel
          </Button>
          {/* No spinner here — the global overlay already covers the request. */}
          <Button variant="contained" onClick={submit} disabled={busy} startIcon={<SaveRounded />}>
            Save
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={2.5} sx={{ mt: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AvatarPicker
            src={avatarUrl}
            fallback={(initial.name || '?').charAt(0).toUpperCase()}
            title={initial.name || 'Photo'}
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

        <TextInput
          name="name"
          label="Name"
          defaultValue={initial.name}
          error={Boolean(errors.name)}
          helperText={errors.name}
          required
          autoFocus
          disabled={busy}
          onChange={setName}
        />
        <PhoneField
          iso2={phone.iso2 || DEFAULT_COUNTRY_ISO2}
          national={phone.national}
          onChange={handlePhone}
          error={Boolean(errors.phone)}
          helperText={errors.phone}
          disabled={busy}
        />
      </Stack>
    </Modal>
  );
}
