'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import EditRounded from '@mui/icons-material/EditRounded';
import ShieldRounded from '@mui/icons-material/ShieldRounded';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { EditProfileDialog } from '@/components/settings/EditProfileDialog';

interface Profile {
  name: string | null;
  email: string;
  role: string;
  status: string | null;
  phone: string | null;
  isSuperAdmin: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  permissions: string[];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Box>
  );
}

export default function ProfilePage() {
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/auth/me').then((r) => r.json());
      if (res.ok) setMe(res.data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <BrandLoader overlay label="Loading profile…" />;
  if (!me) return <Typography color="error">Could not load profile.</Typography>;

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : 'Never');

  return (
    <Box className="rise-in">
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Avatar sx={{ width: 88, height: 88, bgcolor: 'primary.main', fontSize: 38, fontWeight: 700, mx: 'auto', mb: 2 }}>
              {(me.name ?? me.email).charAt(0).toUpperCase()}
            </Avatar>
            <Typography variant="h6">{me.name ?? 'Unnamed user'}</Typography>
            <Typography color="text.secondary" gutterBottom noWrap>
              {me.email}
            </Typography>
            <Box>
              <Chip label={me.role} color="primary" sx={{ mt: 1 }} />
              {me.isSuperAdmin && <Chip label="Protected" variant="outlined" sx={{ mt: 1, ml: 1 }} />}
            </Box>
            <Button fullWidth variant="outlined" startIcon={<EditRounded />} sx={{ mt: 2.5 }} onClick={() => setEditOpen(true)}>
              Edit profile
            </Button>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="h6">Account details</Typography>
              <Button component={Link} href="/settings" size="small" startIcon={<ShieldRounded />}>
                Security &amp; settings
              </Button>
            </Box>
            <Divider sx={{ mb: 1, mt: 1 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Name" value={me.name ?? 'Not set'} />
                <Field label="Email" value={me.email} />
                <Field label="Phone" value={me.phone ?? 'Not set'} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Field label="Role" value={me.role} />
                <Field label="Status" value={me.status ?? 'Unknown'} />
                <Field label="Member since" value={fmt(me.createdAt)} />
                <Field label="Last login" value={fmt(me.lastLoginAt)} />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" gutterBottom>
              Permissions ({me.permissions.length})
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
              {me.permissions.map((p) => (
                <Chip key={p} label={p} size="small" variant="outlined" />
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <EditProfileDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ name: me.name ?? '', phone: me.phone ?? '' }}
        onSaved={(next) => setMe((prev) => (prev ? { ...prev, name: next.name, phone: next.phone } : prev))}
      />
    </Box>
  );
}
