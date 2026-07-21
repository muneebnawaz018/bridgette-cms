'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Chip from '@mui/material/Chip';
import EditRounded from '@mui/icons-material/EditRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, userStatusTone } from '@/components/ui/StatusChip';
import { useSession } from '@/components/auth/SessionProvider';
import { useApi } from '@/lib/api/useApi';
import { useRetainedWhileClosing } from '@/lib/api/useRetained';
import { apiPatch } from '@/lib/api/client';
import { fileToAvatarDataUrl } from '@/lib/image/avatar';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatPhone } from '@/lib/format/countries';
import { ROLE_LABEL } from '@/lib/format/labels';
import { redA } from '@/lib/colors';

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
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
      >
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  );
}

export function UserDetailsModal({
  id,
  onClose,
  onEdit,
  onChanged,
  canManage = false,
}: {
  id: string | null;
  onClose: () => void;
  onEdit?: (id: string) => void;
  /**
   * Called after this modal changes the user, so the list behind it can revalidate. Its own
   * `mutate` only covers `/api/auth/users/:id`; the grid reads a different SWR key and would
   * otherwise keep showing a photo that has already been deleted.
   */
  onChanged?: () => void;
  canManage?: boolean;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { userId: currentUserId } = useSession();
  // keepPreviousData:false so a different user never briefly shows the last one's record;
  // useRetainedWhileClosing keeps this one on screen through the close animation instead of
  // flashing the error state.
  const {
    data: liveUser,
    isLoading,
    mutate,
  } = useApi<UserDetail>(id ? `/api/auth/users/${id}` : null, {
    keepPreviousData: false,
    // This modal draws its own loader inside the dialog, so it must not also raise the
    // app-wide overlay: that would be two loaders for one fetch.
    globalLoading: false,
  });
  const user = useRetainedWhileClosing(liveUser, Boolean(id));

  const [uploading, setUploading] = useState(false);
  // Picking a photo already confirms before it replaces anything (see AvatarPicker); deleting
  // one did not, so a single stray click destroyed it with no way back.
  const [confirmRemove, setConfirmRemove] = useState(false);

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
      onChanged?.();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update the photo', { variant: 'error' });
    }
  }

  async function pickAvatar(file: File) {
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256);
      await saveAvatar(dataUrl);
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not read that image', {
        variant: 'error',
      });
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
          <Button onClick={onClose} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
            Close
          </Button>
          {canEditUser && onEdit && user && (
            <Button
              variant="contained"
              startIcon={<EditRounded />}
              onClick={() => onEdit(user._id)}
            >
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
          {/* Identity band — avatar + role/status. The tinted full-width surface fills what was
              an awkward empty top-right, and the chips read as proper badges rather than tiny pills. */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              textAlign: { xs: 'center', sm: 'left' },
              gap: 2.5,
              p: 2,
              borderRadius: 2,
              bgcolor: redA(0.05),
              border: 1,
              borderColor: 'divider',
            }}
          >
            <AvatarPicker
              src={user.avatarUrl}
              fallback={(user.name || user.email).charAt(0).toUpperCase()}
              title={user.name}
              size={88}
              canEdit={canEditUser}
              uploading={uploading}
              onPick={pickAvatar}
            />

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                justifyContent={{ xs: 'center', sm: 'flex-start' }}
                sx={{ '& .MuiChip-root': { height: 28, borderRadius: 1.5, fontSize: '0.8rem' } }}
              >
                <Chip
                  label={ROLE_LABEL[user.role] ?? user.role}
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 700 }}
                />
                <StatusChip label={user.status} tone={userStatusTone[user.status] ?? 'neutral'} />
                {user.isProtected && <Chip label="Protected" variant="outlined" />}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {user.jobTitle || 'No job title set'}
              </Typography>
              {canEditUser && hasPhoto && (
                <Button
                  onClick={() => setConfirmRemove(true)}
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
          </Box>

          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Field label="Phone" value={formatPhone(user.phone) || 'Not set'} />
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
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}
                >
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

      <ConfirmDialog
        open={confirmRemove}
        title="Remove photo?"
        description="This deletes the current photo. A new one can be uploaded at any time."
        confirmLabel="Remove"
        confirmIcon={<DeleteOutlineRounded />}
        confirmColor="error"
        loading={uploading}
        onConfirm={() => {
          setConfirmRemove(false);
          void saveAvatar(null);
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </Modal>
  );
}
