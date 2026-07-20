'use client';

import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { EditProfileDialog } from '@/components/settings/EditProfileDialog';
import { apiPatch } from '@/lib/api/client';
import { fileToAvatarDataUrl } from '@/lib/image/avatar';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatPhone } from '@/lib/format/countries';
import { colors, redA } from '@/lib/colors';

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  admin: 'Administrator',
  accountant: 'Accountant / Manager',
  sales: 'Sales',
  readOnly: 'Read only',
};

// Soft, non-button badge: tinted fill, no heavy border.
const badgeSx = { fontWeight: 700, fontSize: '0.82rem', height: 32, borderRadius: 2, '& .MuiChip-label': { px: 1.5 } } as const;
const neutralBadgeSx = { ...badgeSx, bgcolor: colors.surface.subtle, color: colors.ink[500] };

interface Profile {
  name: string | null;
  email: string;
  role: string;
  status: string | null;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  permissions: string[];
}

// Spacing comes from the grid that lays these out, so every row keeps the same rhythm.
function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      {/* Long unbroken values (an email) must wrap, not spill into the next column. */}
      <Typography variant="body1" sx={{ wordBreak: 'break-word' }}>{value}</Typography>
    </Box>
  );
}

export default function ProfilePage() {
  const { enqueueSnackbar } = useSnackbar();
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/auth/me').then((r) => r.json());
      if (res.ok) setMe(res.data);
      setLoading(false);
    })();
  }, []);

  async function pickAvatar(file: File) {
    setUploading(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 256);
      const res = await apiPatch<{ avatarUrl: string | null }>('/api/auth/me', { avatarUrl: dataUrl });
      if (res.ok && res.data) {
        const next = res.data.avatarUrl;
        setMe((prev) => (prev ? { ...prev, avatarUrl: next } : prev));
        enqueueSnackbar('Photo updated', { variant: 'success' });
      } else {
        enqueueSnackbar(res.error ?? 'Could not update the photo', { variant: 'error' });
      }
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not read that image', { variant: 'error' });
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <BrandLoader overlay label="Loading profile…" />;
  if (!me) return <Typography color="error">Could not load profile.</Typography>;

  return (
    <Box className="rise-in">
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, textAlign: 'center', height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <AvatarPicker
                src={me.avatarUrl}
                fallback={(me.name ?? me.email).charAt(0).toUpperCase()}
                title={me.name ?? 'Photo'}
                size={96}
                canEdit
                uploading={uploading}
                onPick={pickAvatar}
              />
            </Box>
            <Typography variant="h6">{me.name ?? 'Unnamed user'}</Typography>
            <Typography color="text.secondary" gutterBottom noWrap>
              {me.email}
            </Typography>
            <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
              <Chip label={ROLE_LABEL[me.role] ?? me.role} sx={{ ...badgeSx, bgcolor: redA(0.12), color: 'primary.main' }} />
              {me.isSuperAdmin && <Chip label="Protected" sx={neutralBadgeSx} />}
            </Box>
            <Button fullWidth variant="outlined" startIcon={<EditRounded />} sx={{ mt: 2.5 }} onClick={() => setEditOpen(true)}>
              Edit profile
            </Button>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Account details</Typography>
            <Divider sx={{ mb: 1, mt: 1 }} />
            {/* One cell per field so the two columns share row lines — Email then spans the
                full width as just another row, not a detached block after both stacks. */}
            <Grid container spacing={2.5}>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Name" value={me.name ?? 'Not set'} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Status" value={me.status ?? 'Unknown'} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Role" value={ROLE_LABEL[me.role] ?? me.role} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Job title" value={me.jobTitle ?? 'Not set'} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Member since" value={formatDate(me.createdAt)} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Phone" value={formatPhone(me.phone) || "Not set"} /></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><Field label="Last login" value={formatDateTime(me.lastLoginAt, 'Never')} /></Grid>
              <Grid size={{ xs: 12 }}><Field label="Email" value={me.email} /></Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Permissions ({me.permissions.length})
            </Typography>
            <Divider sx={{ mb: 2, mt: 1 }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {me.permissions.map((p) => (
                <Chip key={p} label={p} sx={neutralBadgeSx} />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <EditProfileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ name: me.name ?? '', phone: me.phone ?? '', avatarUrl: me.avatarUrl }}
        onSaved={(next) =>
          setMe((prev) => (prev ? { ...prev, name: next.name, phone: next.phone, avatarUrl: next.avatarUrl } : prev))
        }
      />
    </Box>
  );
}
