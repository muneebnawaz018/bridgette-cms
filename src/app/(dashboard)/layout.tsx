import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession, ROLE_PERMISSIONS, Permission } from '@/modules/auth';
import { SessionProvider } from '@/components/auth/SessionProvider';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';
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
  // Only admins manage customers; other roles consume them through the invoice picker, so the
  // nav link is gated on the create grant rather than plain view.
  const canViewCustomers = clientSession.permissions.includes(Permission.CustomerCreate);
  // Same rule for products: only admins manage the catalogue; others consume via the line picker.
  const canViewProducts = clientSession.permissions.includes(Permission.ProductCreate);

  return (
    <SessionProvider value={clientSession}>
      <PreferencesProvider>
        <AppShell
          canViewUsers={canViewUsers}
          canViewCustomers={canViewCustomers}
          canViewProducts={canViewProducts}
        >
          {children}
        </AppShell>
      </PreferencesProvider>
    </SessionProvider>
  );
}
