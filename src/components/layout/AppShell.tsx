'use client';

import { useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import SpaceDashboardRounded from '@mui/icons-material/SpaceDashboardRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import SettingsRounded from '@mui/icons-material/SettingsRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { AppLink } from '@/components/ui/AppLink';
import { BrandLockup } from '@/components/layout/BrandLockup';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { useSignOut } from '@/components/auth/useSignOut';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { colors, gradients } from '@/lib/colors';
import { displayFont } from '@/lib/theme';

const RAIL = 268;
// Rail shows from tablet up; below this the hamburger + drawer take over.
const RAIL_QUERY = '@media (min-width:768px)';

/** One shape for every rail row — nav links and Sign out alike. */
const railItemSx = {
  position: 'relative',
  mx: 1.5,
  my: 0.35,
  py: 1.05,
  px: 1.75,
  borderRadius: '12px',
  transition: 'background-color .16s ease, color .16s ease',
} as const;

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/invoices/new')) return 'New invoice';
  if (pathname.startsWith('/invoices')) return 'Invoices';
  if (pathname.startsWith('/users')) return 'Users';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/profile')) return 'My profile';
  return 'Dashboard';
}

/** Shared dark-rail content — used by both the fixed desktop sidebar and the mobile drawer. */
function RailContent({
  items,
  isActive,
  onNavigate,
  onSignOut,
}: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
  onSignOut: () => void;
}) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', color: colors.rail.text }}>
      <Box sx={{ px: 2.75, py: 2.75 }}>
        <BrandLockup subtitle="Management Portal" />
      </Box>

      <Typography
        sx={{
          px: 3,
          pb: 1,
          fontSize: '0.66rem',
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: colors.rail.label,
        }}
      >
        MENU
      </Typography>

      {/* Scrolls as one list so Sign out stays with the nav rows it belongs to. */}
      <Box sx={{ flexGrow: 1, overflowY: 'auto', minHeight: 0 }}>
        <List sx={{ px: 0, py: 0 }}>
          {items.map((it) => {
            const active = isActive(it.href);
            return (
              <ListItemButton
                key={it.href}
                component={AppLink}
                href={it.href}
                onClick={onNavigate}
                sx={{
                  ...railItemSx,
                  color: active ? colors.rail.textActive : colors.rail.text,
                  bgcolor: active ? colors.rail.activeBg : 'transparent',
                  '&:hover': {
                    bgcolor: active ? colors.rail.activeBgHover : colors.rail.hover,
                    color: colors.rail.textActive,
                  },
                  // Sits inside the pill, hugging its left edge — not floating outside it.
                  '&::before': active
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 6,
                        top: '24%',
                        bottom: '24%',
                        width: 3,
                        borderRadius: 4,
                        bgcolor: 'primary.main',
                      }
                    : undefined,
                }}
              >
                <ListItemIcon sx={{ minWidth: 38, color: active ? 'primary.light' : 'inherit' }}>
                  {it.icon}
                </ListItemIcon>
                <ListItemText
                  primary={it.label}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: '0.925rem' }}
                />
              </ListItemButton>
            );
          })}

          {/* Sign out — reachable without opening the profile menu, and the only way out on
              mobile once the drawer is open. */}
          <ListItemButton
            onClick={onSignOut}
            sx={{
              ...railItemSx,
              color: colors.rail.text,
              '&:hover': { bgcolor: colors.rail.hover, color: colors.rail.textActive },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
              <LogoutRounded fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Sign out" primaryTypographyProps={{ fontWeight: 600, fontSize: '0.925rem' }} />
          </ListItemButton>
        </List>
      </Box>

      <Box sx={{ p: 2, pt: 1 }}>
        <Box
          sx={{
            borderRadius: 3,
            py: 1.5,
            px: 1.75,
            bgcolor: colors.rail.bgElevated,
            border: `1px solid ${colors.rail.border}`,
            textAlign: 'center',
          }}
        >
          <Typography
            sx={{
              fontFamily: displayFont,
              color: colors.rail.textActive,
              fontWeight: 600,
              fontSize: '0.95rem',
              lineHeight: 1.2,
              letterSpacing: '0.01em',
            }}
          >
            Bridgette Portal
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/** App chrome: fixed dark sidebar (desktop) / drawer (mobile) + sticky glass header. */
export function AppShell({
  canViewUsers,
  children,
}: {
  canViewUsers: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { signOut, signingOut } = useSignOut();

  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: <SpaceDashboardRounded fontSize="small" /> },
    { href: '/invoices', label: 'Invoices', icon: <ReceiptLongRounded fontSize="small" /> },
    ...(canViewUsers
      ? [{ href: '/users', label: 'Users', icon: <GroupRounded fontSize="small" /> }]
      : []),
    { href: '/settings', label: 'Settings', icon: <SettingsRounded fontSize="small" /> },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {/* Tablet/desktop rail (>=768px) — reserves width in flow, panel is fixed */}
      <Box
        component="nav"
        sx={{ width: RAIL, flexShrink: 0, display: 'none', [RAIL_QUERY]: { display: 'block' } }}
      >
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            bottom: 0,
            width: RAIL,
            bgcolor: colors.rail.bg,
            borderRight: `1px solid ${colors.rail.border}`,
          }}
        >
          <RailContent items={items} isActive={isActive} onSignOut={() => setSignOutOpen(true)} />
        </Box>
      </Box>

      {/* Drawer (<768px) */}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        sx={{ [RAIL_QUERY]: { display: 'none' } }}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            width: RAIL,
            bgcolor: colors.rail.bg,
            backgroundImage: 'none',
            border: 'none',
            borderRadius: '0 16px 16px 0',
            overflow: 'hidden',
          },
        }}
      >
        <RailContent
          items={items}
          isActive={isActive}
          onNavigate={() => setOpen(false)}
          onSignOut={() => {
            setOpen(false);
            setSignOutOpen(true);
          }}
        />
      </Drawer>

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        description="You will need to sign in again to get back into the portal."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setSignOutOpen(false)}
      />

      {/* Content column */}
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box
          component="header"
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, md: 3 },
            bgcolor: colors.glass,
            backdropFilter: 'saturate(180%) blur(12px)',
            borderBottom: `1px solid ${colors.surface.border}`,
          }}
        >
          <IconButton
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            sx={{ width: 40, height: 40, p: 0, flexShrink: 0, [RAIL_QUERY]: { display: 'none' } }}
          >
            <MenuRounded sx={{ fontSize: 40 }} />
          </IconButton>
          <Typography
            component="h1"
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              maxWidth: '55%',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: displayFont,
              fontWeight: 600,
              fontSize: { xs: '1.5rem', md: '1.8rem' },
              lineHeight: 1.3,
              py: 0.25,
              letterSpacing: '-0.01em',
              background: gradients.brand,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              [RAIL_QUERY]: {
                position: 'static',
                transform: 'none',
                maxWidth: 'none',
                flexGrow: 1,
                textAlign: 'left',
              },
            }}
          >
            {pageTitle(pathname)}
          </Typography>
          {/* Mobile only: the title is out of flow there, so this pushes the avatar right. */}
          <Box sx={{ flexGrow: 1, [RAIL_QUERY]: { display: 'none' } }} />
          <ProfileMenu />
        </Box>

        <Box
          component="main"
          sx={{ flexGrow: 1, px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2.5, md: 3.5 } }}
        >
          <Box sx={{ maxWidth: 1520, mx: 'auto', width: '100%' }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}
