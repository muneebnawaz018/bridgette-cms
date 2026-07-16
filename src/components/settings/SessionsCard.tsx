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
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import { useSnackbar } from 'notistack';
import { useApi } from '@/lib/api/useApi';
import { apiDelete } from '@/lib/api/client';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { SessionScopeDialog } from '@/components/settings/SessionScopeDialog';

interface ActiveSession {
  id: string;
  current: boolean;
  status: 'active' | 'revoked';
  device: string;
  ip: string | null;
  location: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function SessionRow({
  s,
  onRevoke,
  revoking,
}: {
  s: ActiveSession;
  onRevoke?: (id: string) => void;
  revoking?: boolean;
}) {
  const revoked = s.status === 'revoked';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, opacity: revoked ? 0.72 : 1 }}>
      <Box
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 40,
          height: 40,
          borderRadius: 2,
          color: revoked ? 'text.disabled' : 'primary.main',
          bgcolor: 'action.hover',
          flexShrink: 0,
        }}
      >
        <DevicesRounded fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }} noWrap>
            {s.device}
          </Typography>
          {s.current && <Chip label="This device" size="small" color="primary" variant="outlined" />}
          {revoked && <Chip label="Signed out" size="small" color="default" variant="outlined" />}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {[s.ip, s.location].filter(Boolean).join(' · ') || 'Unknown location'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {revoked && s.revokedAt ? `Signed out ${fmt(s.revokedAt)}` : `Signed in ${fmt(s.createdAt)}`}
        </Typography>
      </Box>
      {!revoked && !s.current && onRevoke && (
        <Tooltip title="Sign out this device">
          <span>
            <IconButton size="small" onClick={() => onRevoke(s.id)} disabled={revoking}>
              {revoking ? <CircularProgress size={18} /> : <LogoutRounded fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  );
}

/** Lists active sign-ins (revoke any one, or all others) plus a short signed-out history. */
export function SessionsCard() {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, mutate } = useApi<{ sessions: ActiveSession[] }>('/api/auth/sessions');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);

  const sessions = data?.sessions ?? [];
  const active = sessions.filter((s) => s.status === 'active');
  const revoked = sessions.filter((s) => s.status === 'revoked');
  const others = active.filter((s) => !s.current).length;

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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 0.5 }}>
        <Typography variant="h6">Active sessions</Typography>
        <Button size="small" startIcon={<LogoutRounded />} disabled={others === 0} onClick={() => setScopeOpen(true)}>
          Sign out other devices
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Devices currently signed in to your account.
      </Typography>
      <Divider sx={{ mb: 1 }} />

      {isLoading && sessions.length === 0 ? (
        <BrandLoader label="Loading sessions…" minHeight={160} />
      ) : (
        <Stack divider={<Divider flexItem />}>
          {active.map((s) => (
            <SessionRow key={s.id} s={s} onRevoke={revokeOne} revoking={revoking === s.id} />
          ))}
          {active.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No active sessions found.
            </Typography>
          )}
        </Stack>
      )}

      {revoked.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, color: 'text.secondary' }}>
            <HistoryRounded fontSize="small" />
            <Typography variant="subtitle2" color="text.secondary">
              Recently signed out
            </Typography>
          </Box>
          <Divider sx={{ mb: 1 }} />
          <Stack divider={<Divider flexItem />}>
            {revoked.map((s) => (
              <SessionRow key={s.id} s={s} />
            ))}
          </Stack>
        </Box>
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
