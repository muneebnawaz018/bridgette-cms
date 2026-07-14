import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import { getSession, ROLE_PERMISSIONS, Permission } from '@/modules/auth';
import { SessionProvider } from '@/components/auth/SessionProvider';
import { TopNav } from '@/components/layout/TopNav';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const clientSession = {
    userId: session.userId,
    role: session.role,
    email: session.email,
    permissions: [...ROLE_PERMISSIONS[session.role]],
  };

  const canViewUsers = clientSession.permissions.includes(Permission.UserView);

  return (
    <SessionProvider value={clientSession}>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f4f4f5' }}>
        <TopNav canViewUsers={canViewUsers} />
        <Container maxWidth="lg" component="main" sx={{ py: { xs: 2, sm: 3, md: 4 }, px: { xs: 1.5, sm: 3 } }}>
          {children}
        </Container>
      </Box>
    </SessionProvider>
  );
}
