'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { StatusChip, type Tone } from '@/components/ui/StatusChip';
import { useSession } from '@/components/auth/SessionProvider';
import { useApi } from '@/lib/api/useApi';
import { useRetainedWhileClosing } from '@/lib/api/useRetained';
import { apiPatch } from '@/lib/api/client';
import { fileToAvatarDataUrl } from '@/lib/image/avatar';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatPhone } from '@/lib/format/countries';

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  admin: 'Administrator',
  accountant: 'Accountant / Manager',
  sales: 'Sales',
  readOnly: 'Read only',
};
const STATUS_TONE: Record<string, Tone> = { active: 'success', invited: 'warning', disabled: 'neutral' };

interface UserDetail {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
  avatarUrl?: string | null;
  role: string;
  status: string;
  isProtected?: boolean;
  isSuperAdmin?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ py: 0.75 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  );
}

export function UserDetailsModal({
  id,
  onClose,
  onEdit,
  canManage = false,
}: {
  id: string | null;
  onClose: () => void;
  onEdit?: (id: string) => void;
  canManage?: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { userId: currentUserId } = useSession();
  // keepPreviousData:false so a different user never briefly shows the last one's record;
  // useRetainedWhileClosing keeps this one on screen through the close animation instead of
  // flashing the error state.
  const { data: liveUser, isLoading, mutate } = useApi<UserDetail>(id ? `/api/auth/users/${id}` : null, { keepPreviousData: false });
  const user = useRetainedWhileClosing(liveUser, Boolean(id));

  const [uploading, setUploading] = useState(false);

  // The protected Super Admin is locked: only the account holder may edit it. Everyone else
  // with UserManage can edit any other user.
  const isSelf = Boolean(user) && user!._id === currentUserId;
  const canEditUser = canManage && Boolean(user) && (!user!.isProtected || isSelf);
  const hasPhoto = Boolean(user?.avatarUrl);

  async function saveAvatar(next: string | null) {
    if (!id) return;
    setUploading(true);
    const res = await apiPatch(`/api/auth/users/${id}`, { avatarUrl: next });
    setUploading(false);
    if (res.ok) {
      enqueueSnackbar(next ? 'Photo updated' : 'Photo removed', { variant: 'success' });
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update the photo', { variant: 'error' });
    }
  }

  async function pickAvatar(file: File) {
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256);
      await saveAvatar(dataUrl);
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not read that image', { variant: 'error' });
    }
  }

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={user ? user.name : 'User'}
      description={user ? user.email : undefined}
      maxWidth="md"
      busy={uploading}
      actions={
        <>
          <Button onClick={onClose} variant="outlined" color="inherit">Close</Button>
          {canEditUser && onEdit && user && (
            <Button variant="contained" startIcon={<EditRounded />} onClick={() => onEdit(user._id)}>
              Edit
            </Button>
          )}
        </>
      }
    >
      {isLoading && !user ? (
        <BrandLoader minHeight={200} label={null} size={64} />
      ) : !user ? (
        <Typography color="error">Could not load this user.</Typography>
      ) : (
        <Stack spacing={2.5}>
          <Stack direction="row" spacing={2.5} alignItems="center">
            <AvatarPicker
              src={user.avatarUrl}
              fallback={(user.name || user.email).charAt(0).toUpperCase()}
              title={user.name}
              size={96}
              canEdit={canEditUser}
              uploading={uploading}
              onPick={pickAvatar}
            />

            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={ROLE_LABEL[user.role] ?? user.role} color="primary" variant="outlined" size="small" sx={{ fontWeight: 700 }} />
                <StatusChip label={user.status} tone={STATUS_TONE[user.status] ?? 'neutral'} />
                {user.isProtected && <Chip label="Protected" size="small" variant="outlined" />}
              </Box>
              {user.jobTitle && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {user.jobTitle}
                </Typography>
              )}
              {canEditUser && hasPhoto && (
                <Button
                  onClick={() => void saveAvatar(null)}
                  disabled={uploading}
                  size="small"
                  color="inherit"
                  startIcon={<DeleteOutlineRounded fontSize="small" />}
                  sx={{ mt: 1 }}
                >
                  Remove photo
                </Button>
              )}
            </Box>
          </Stack>

          <Divider />

          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Field label="Job title" value={user.jobTitle || 'Not set'} />
              <Field label="Phone" value={formatPhone(user.phone) || "Not set"} />
              <Field label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Field label="Member since" value={formatDate(user.createdAt)} />
              <Field label="Last login" value={formatDateTime(user.lastLoginAt, 'Never')} />
            </Grid>
          </Grid>

          {user.notes && (
            <>
              <Divider />
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Internal notes
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                  {user.notes}
                </Typography>
              </Box>
            </>
          )}
        </Stack>
      )}
    </Modal>
  );
}
