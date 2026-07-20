'use client';

import { useState } from 'react';
import { AppLink } from '@/components/ui/AppLink';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import PersonRounded from '@mui/icons-material/PersonRounded';
import LockResetRounded from '@mui/icons-material/LockResetRounded';
import MailRounded from '@mui/icons-material/MailRounded';
import AlternateEmailRounded from '@mui/icons-material/AlternateEmailRounded';
import SpaceDashboardRounded from '@mui/icons-material/SpaceDashboardRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import { useSnackbar } from 'notistack';
import { useSession, useCan } from '@/components/auth/SessionProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { Permission } from '@/modules/auth/rbac';
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { useApi } from '@/lib/api/useApi';
import { apiPost } from '@/lib/api/client';
import { ChangePasswordDialog } from '@/components/settings/ChangePasswordDialog';
import { ChangeEmailDialog } from '@/components/settings/ChangeEmailDialog';
import { SessionsCard } from '@/components/settings/SessionsCard';
import { ROLE_LABEL } from '@/lib/format/labels';


/** Shared header height for the two top cards, so their first divider lines up exactly
 *  regardless of how tall each header's own content happens to be. Sized to the tallest
 *  header (the 56px avatar) — anything more just adds dead space above the divider. */
const CARD_HEADER_MIN_H = 60;

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{value}</Typography>
    </Box>
  );
}

export default function SettingsPage() {
  const { email, role } = useSession();
  const canViewUsers = useCan(Permission.UserView);
  const { enqueueSnackbar } = useSnackbar();
  const { pageSize, setPageSize } = usePreferences();
  const { data: me } = useApi<{
    name: string | null;
    avatarUrl: string | null;
    status: string | null;
    createdAt: string | null;
    lastLoginAt: string | null;
  }>('/api/auth/me');

  const [pwOpen, setPwOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const displayName = me?.name?.trim() || email.split('@')[0];

  async function sendResetLink() {
    setSendingReset(true);
    await apiPost('/api/auth/forgot', { email });
    setSendingReset(false);
    enqueueSnackbar('Password reset link sent to your email', { variant: 'success' });
  }

  function changeRowsPerPage(n: number) {
    setSavingPref(true);
    setPageSize(n);
    // Preference persists to localStorage instantly; brief "saving" feedback for clarity.
    window.setTimeout(() => {
      setSavingPref(false);
      enqueueSnackbar('Rows per page updated', { variant: 'success' });
    }, 500);
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard', icon: <SpaceDashboardRounded /> },
    { href: '/invoices', label: 'Invoices', icon: <ReceiptLongRounded /> },
    ...(canViewUsers ? [{ href: '/users', label: 'Users', icon: <GroupRounded /> }] : []),
    { href: '/profile', label: 'My profile', icon: <PersonRounded /> },
  ];

  return (
    <Box className="rise-in">
      <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 2.5 }}>
        Manage your account, security, and how the app works for you.
      </Typography>

      <Grid container spacing={2.5}>
        {/* Identity */}
        <Grid size={{ xs: 12, wide: 6 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ minHeight: CARD_HEADER_MIN_H }}>
              <Avatar src={me?.avatarUrl ?? undefined} sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontWeight: 700, fontSize: 24, flexShrink: 0 }}>
                {displayName.charAt(0).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.1rem' }} noWrap>{displayName}</Typography>
                {/* No role badge here — Role is already one of the fields below. */}
                <Typography color="text.secondary" noWrap sx={{ mt: 0.25 }}>{email}</Typography>
              </Box>
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              <Grid size={6}><InfoField label="Role" value={ROLE_LABEL[role] ?? role} /></Grid>
              <Grid size={6}><InfoField label="Status" value={me?.status ?? 'Unknown'} /></Grid>
              <Grid size={6}><InfoField label="Member since" value={formatDate(me?.createdAt)} /></Grid>
              <Grid size={6}><InfoField label="Last login" value={formatDateTime(me?.lastLoginAt, 'Never')} /></Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' } }}>
              <Button
                component={AppLink}
                href="/profile"
                startIcon={<PersonRounded />}
                variant="outlined"
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                View full profile
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Navigation shortcuts */}
        <Grid size={{ xs: 12, wide: 6 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Box sx={{ minHeight: CARD_HEADER_MIN_H }}>
              <Typography variant="h6">Go to</Typography>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 0.5 }}>
                Jump straight to any part of the portal.
              </Typography>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              {links.map((l) => (
                <Button
                  key={l.href}
                  component={AppLink}
                  href={l.href}
                  startIcon={l.icon}
                  color="inherit"
                  sx={{ justifyContent: 'flex-start', py: 1, px: 1.5, fontWeight: 600, '&:hover': { bgcolor: 'action.hover' } }}
                >
                  {l.label}
                </Button>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Security */}
        <Grid size={{ xs: 12, wide: 6 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Security</Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Update your password or email address, or send yourself a reset link.
            </Typography>
            <Divider sx={{ mb: 2 }} />
            {/* Labels must never break across lines — the buttons grow to share a row and
                wrap onto the next one when they no longer fit. */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                '& > .MuiButton-root': { flexGrow: 1, flexBasis: { xs: '100%', sm: 'auto' }, whiteSpace: 'nowrap' },
              }}
            >
              <Button variant="contained" startIcon={<LockResetRounded />} onClick={() => setPwOpen(true)}>
                Change password
              </Button>
              <Button variant="outlined" startIcon={<AlternateEmailRounded />} onClick={() => setEmailOpen(true)}>
                Change email
              </Button>
              <Button variant="outlined" startIcon={<MailRounded />} onClick={sendResetLink} disabled={sendingReset}>
                {sendingReset ? 'Sending…' : 'Forgot password'}
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Preferences */}
        <Grid size={{ xs: 12, wide: 6 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>Preferences</Typography>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Rows shown per page in every table across the app.
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
              <Typography sx={{ fontWeight: 600 }}>Rows per page</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FormControl size="small" sx={{ minWidth: 96 }}>
                  <Select value={pageSize} disabled={savingPref} onChange={(e) => changeRowsPerPage(Number(e.target.value))}>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <MenuItem key={n} value={n}>{n}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Box>
          </Paper>
        </Grid>

        {/* Sessions */}
        <Grid size={{ xs: 12 }}>
          <SessionsCard />
        </Grid>
      </Grid>

      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      <ChangeEmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} currentEmail={email} onChanged={() => undefined} />
    </Box>
  );
}
