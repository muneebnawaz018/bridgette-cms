'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSnackbar } from 'notistack';
import { apiPost } from '@/lib/api/client';

/**
 * The one sign-out flow, shared by the profile menu and the sidebar. The server clears the
 * cookies; we just navigate away and refresh so no stale RSC payload survives.
 */
export function useSignOut() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await apiPost('/api/auth/logout', {});
    enqueueSnackbar('Signed out', { variant: 'success' });
    router.replace('/login');
    router.refresh();
  }

  return { signOut, signingOut };
}
