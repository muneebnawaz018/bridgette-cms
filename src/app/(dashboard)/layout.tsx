import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, ROLE_PERMISSIONS, Permission } from '@/modules/auth';
import { SessionProvider } from '@/components/auth/SessionProvider';
import { AppShell } from '@/components/layout/AppShell';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const clientSession = {
    userId: session.userId,
    role: session.role,
    email: session.email,
    permissions: [...(ROLE_PERMISSIONS[session.role] ?? [])],
  };

  const canViewUsers = clientSession.permissions.includes(Permission.UserView);

  return (
    <SessionProvider value={clientSession}>
      <AppShell canViewUsers={canViewUsers}>{children}</AppShell>
    </SessionProvider>
  );
}
