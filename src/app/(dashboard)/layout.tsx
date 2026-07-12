import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import { getSession, ROLE_PERMISSIONS, Permission } from '@/modules/auth';
import { LogoutButton } from '@/components/layout/LogoutButton';
import { SessionProvider } from '@/components/auth/SessionProvider';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const clientSession = {
    userId: session.userId,
    role: session.role,
    email: session.email,
    permissions: [...ROLE_PERMISSIONS[session.role]],
  };

  return (
    <SessionProvider value={clientSession}>
    <Box sx={{ minHeight: '100vh', bgcolor: '#fafafa' }}>
      <AppBar position="static" color="primary" elevation={1}>
        <Toolbar sx={{ gap: 2 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.png" alt="Bridgette" style={{ height: 28 }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Management Portal
          </Typography>
          <Box sx={{ flexGrow: 1, display: 'flex', gap: 1, ml: 3 }}>
            <Button component={Link} href="/dashboard" color="inherit" size="small">
              Dashboard
            </Button>
            <Button component={Link} href="/invoices" color="inherit" size="small">
              Invoices
            </Button>
            {clientSession.permissions.includes(Permission.UserView) && (
              <Button component={Link} href="/users" color="inherit" size="small">
                Users
              </Button>
            )}
          </Box>
          <Chip label={session.role} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff' }} />
          <Typography variant="body2">{session.email}</Typography>
          <LogoutButton />
        </Toolbar>
      </AppBar>
      <Box component="main" sx={{ p: 3 }}>
        {children}
      </Box>
    </Box>
    </SessionProvider>
  );
}
