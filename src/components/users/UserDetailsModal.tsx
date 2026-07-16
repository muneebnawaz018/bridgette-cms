'use client';

import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import EditRounded from '@mui/icons-material/EditRounded';
import { Modal } from '@/components/ui/Modal';
import { StatusChip, type Tone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';

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
  // keepPreviousData:false so a different user never briefly shows the last one's record.
  const { data: user, isLoading } = useApi<UserDetail>(id ? `/api/auth/users/${id}` : null, { keepPreviousData: false });
  const fmt = (d?: string) => (d ? new Date(d).toLocaleString() : 'Never');

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={user ? user.name : 'User'}
      description={user ? user.email : undefined}
      maxWidth="sm"
      actions={
        <>
          <Button onClick={onClose} color="inherit">Close</Button>
          {canManage && onEdit && user && !user.isProtected && (
            <Button variant="contained" startIcon={<EditRounded />} onClick={() => onEdit(user._id)}>
              Edit
            </Button>
          )}
        </>
      }
    >
      {isLoading && !user ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 5 }}>
          <CircularProgress size={26} />
        </Box>
      ) : !user ? (
        <Typography color="error">Could not load this user.</Typography>
      ) : (
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 700, fontSize: 24 }}>
              {(user.name || user.email).charAt(0).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip label={ROLE_LABEL[user.role] ?? user.role} color="primary" variant="outlined" size="small" sx={{ fontWeight: 700 }} />
                <StatusChip label={user.status} tone={STATUS_TONE[user.status] ?? 'neutral'} />
                {user.isProtected && <Chip label="Protected" size="small" variant="outlined" />}
              </Box>
            </Box>
          </Stack>
          <Divider />
          <Grid container spacing={1}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Field label="Phone" value={user.phone || 'Not set'} />
              <Field label="Email verified" value={user.emailVerified ? 'Yes' : 'No'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Field label="Member since" value={fmt(user.createdAt)} />
              <Field label="Last login" value={fmt(user.lastLoginAt)} />
            </Grid>
          </Grid>
        </Stack>
      )}
    </Modal>
  );
}
