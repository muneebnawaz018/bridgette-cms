'use client';

import { useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { useSnackbar } from 'notistack';
import { useApi } from '@/lib/api/useApi';
import { apiDelete } from '@/lib/api/client';
import { SessionScopeDialog } from '@/components/settings/SessionScopeDialog';

interface ActiveSession {
  id: string;
  current: boolean;
  device: string;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

function since(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** Lists the user's active sign-ins and lets them revoke any one, or all others at once. */
export function SessionsCard() {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, mutate } = useApi<{ sessions: ActiveSession[] }>('/api/auth/sessions');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);

  const sessions = data?.sessions ?? [];
  const others = sessions.filter((s) => !s.current).length;

  async function revokeOne(id: string) {
    setRevoking(id);
    const res = await apiDelete(`/api/auth/sessions/${id}`);
    setRevoking(null);
    if (res.ok) {
      enqueueSnackbar('Device signed out', { variant: 'success' });
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not sign out that device', { variant: 'error' });
    }
  }

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 0.5 }}>
        <Typography variant="h6">Active sessions</Typography>
        <Button
          size="small"
          startIcon={<LogoutRounded />}
          disabled={others === 0}
          onClick={() => setScopeOpen(true)}
        >
          Sign out other devices
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Devices currently signed in to your account.
      </Typography>
      <Divider sx={{ mb: 1 }} />

      {isLoading && sessions.length === 0 ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <Stack divider={<Divider flexItem />}>
          {sessions.map((s) => (
            <Box key={s.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, color: 'primary.main', bgcolor: 'action.hover', flexShrink: 0 }}>
                <DevicesRounded fontSize="small" />
              </Box>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>{s.device}</Typography>
                  {s.current && <Chip label="This device" size="small" color="primary" variant="outlined" />}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {s.ip ? `${s.ip} · ` : ''}Signed in {since(s.createdAt)}
                </Typography>
              </Box>
              {!s.current && (
                <Tooltip title="Sign out this device">
                  <span>
                    <IconButton size="small" onClick={() => revokeOne(s.id)} disabled={revoking === s.id}>
                      {revoking === s.id ? <CircularProgress size={18} /> : <LogoutRounded fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              )}
            </Box>
          ))}
          {sessions.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No active sessions found.
            </Typography>
          )}
        </Stack>
      )}

      <SessionScopeDialog
        open={scopeOpen}
        title="Sign out other devices"
        description="Choose whether to keep this device signed in or end every session."
        onClose={() => {
          setScopeOpen(false);
          void mutate();
        }}
      />
    </Paper>
  );
}
