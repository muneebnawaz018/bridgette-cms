'use client';

import { useRouter } from 'next/navigation';
import Button from '@mui/material/Button';
import { apiPost } from '@/lib/api/client';

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await apiPost('/api/auth/logout', {});
    router.push('/login');
    router.refresh();
  }
  return (
    <Button color="inherit" onClick={logout} size="small">
      Sign out
    </Button>
  );
}
