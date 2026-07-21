'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { useSnackbar } from 'notistack';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Modal } from '@/components/ui/Modal';
import { apiPost } from '@/lib/api/client';

type Scope = 'others' | 'all';

/**
 * Asks which sessions to revoke. Shown after a password change and reusable as a
 * standalone "sign out other devices" action from the sessions card. "Sign out
 * everywhere" is fully server-side: the backend revokes every token AND clears this
 * device's cookies, then we hard-navigate to /login.
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
  const { enqueueSnackbar } = useSnackbar();
  const [busy, setBusy] = useState<Scope | null>(null);

  async function run(scope: Scope) {
    setBusy(scope);
    const res = await apiPost<{ scope: Scope; revoked?: number }>('/api/auth/sessions/revoke', {
      scope,
    });
    if (!res.ok) {
      setBusy(null);
      enqueueSnackbar(res.error ?? 'Could not update sessions', { variant: 'error' });
      return;
    }
    if (scope === 'all') {
      // Cookies already cleared server-side; hard-navigate so the whole app state resets.
      window.location.assign('/login');
      return;
    }
    setBusy(null);
    const n = res.data?.revoked ?? 0;
    enqueueSnackbar(
      n > 0
        ? `Signed out ${n} other device${n === 1 ? '' : 's'}`
        : 'No other devices were signed in',
      {
        variant: 'success',
      },
    );
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
          <Button onClick={onClose} disabled={locked} color="inherit" startIcon={<CloseRounded />}>
            Keep all devices signed in
          </Button>
        ) : undefined
      }
    >
      <Stack spacing={1.5}>
        <SubmitButton
          onClick={() => run('others')}
          loading={busy === 'others'}
          disabled={locked}
          variant="contained"
          size="large"
          fullWidth
          startIcon={<DevicesRounded />}
        >
          Keep this device, sign out others
        </SubmitButton>
        <SubmitButton
          onClick={() => run('all')}
          loading={busy === 'all'}
          disabled={locked}
          variant="outlined"
          color="error"
          size="large"
          fullWidth
          startIcon={<LogoutRounded />}
        >
          Sign out everywhere
        </SubmitButton>
      </Stack>
    </Modal>
  );
}
