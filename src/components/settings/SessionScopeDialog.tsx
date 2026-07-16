'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { apiPost } from '@/lib/api/client';

type Scope = 'others' | 'all';

/**
 * Asks the user which sessions to revoke. Shown right after a password change (so a
 * leaked password can't keep another device signed in) and reusable as a standalone
 * "sign out other devices" action from the sessions card.
 */
export function SessionScopeDialog({
  open,
  onClose,
  title = 'Secure your account',
  description = 'Your password was updated. Where do you want to stay signed in?',
  allowDismiss = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  allowDismiss?: boolean;
}) {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState<Scope | null>(null);

  async function run(scope: Scope) {
    setBusy(scope);
    const res = await apiPost<{ scope: Scope; revoked?: number }>('/api/auth/sessions/revoke', { scope });
    setBusy(null);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not update sessions', { variant: 'error' });
      return;
    }
    if (scope === 'all') {
      enqueueSnackbar('Signed out of every device', { variant: 'success' });
      router.replace('/login');
      router.refresh();
      return;
    }
    const n = res.data?.revoked ?? 0;
    enqueueSnackbar(n > 0 ? `Signed out ${n} other device${n === 1 ? '' : 's'}` : 'No other devices were signed in', {
      variant: 'success',
    });
    onClose();
  }

  const locked = busy !== null;

  return (
    <Modal
      open={open}
      onClose={allowDismiss ? onClose : () => {}}
      title={title}
      description={description}
      maxWidth="xs"
      busy={locked}
      actions={
        allowDismiss ? (
          <Button onClick={onClose} disabled={locked} color="inherit">
            Keep all devices signed in
          </Button>
        ) : undefined
      }
    >
      <Stack spacing={1.25}>
        <Option
          icon={<DevicesRounded />}
          title="Keep this device"
          subtitle="Sign out everywhere else. Recommended."
          loading={busy === 'others'}
          disabled={locked}
          onClick={() => run('others')}
        />
        <Option
          icon={<LogoutRounded />}
          title="Sign out everywhere"
          subtitle="End every session, including this one."
          tone="error"
          loading={busy === 'all'}
          disabled={locked}
          onClick={() => run('all')}
        />
      </Stack>
    </Modal>
  );
}

function Option({
  icon,
  title,
  subtitle,
  onClick,
  loading = false,
  disabled = false,
  tone = 'primary',
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'error';
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        width: '100%',
        justifyContent: 'flex-start',
        textAlign: 'left',
        p: 1.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        transition: 'border-color .16s ease, background-color .16s ease',
        '&:hover': { borderColor: `${tone}.main`, bgcolor: 'action.hover' },
        '&.Mui-disabled': { opacity: 0.6 },
      }}
    >
      <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, color: `${tone}.main`, bgcolor: 'action.hover', flexShrink: 0 }}>
        {loading ? <CircularProgress size={20} color="inherit" /> : icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: tone === 'error' ? 'error.main' : 'text.primary' }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </Box>
    </ButtonBase>
  );
}
