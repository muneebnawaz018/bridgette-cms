'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
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
import { BrandLockup } from '@/components/layout/BrandLockup';
import { ProfileMenu } from '@/components/layout/ProfileMenu';
import { colors, gradients } from '@/lib/colors';
import { displayFont } from '@/lib/theme';

const RAIL = 268;
// Rail shows from tablet up; below this the hamburger + drawer take over.
const RAIL_QUERY = '@media (min-width:768px)';

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
function RailContent({ items, isActive, onNavigate }: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', color: colors.rail.text }}>
      <Box sx={{ px: 2.75, py: 2.75 }}>
        <BrandLockup subtitle="Management Portal" />
      </Box>

      <Typography sx={{ px: 3, pb: 1, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.18em', color: colors.rail.label }}>
        MENU
      </Typography>

      <List sx={{ px: 0, flexGrow: 1, overflowY: 'auto' }}>
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <ListItemButton
              key={it.href}
              component={Link}
              href={it.href}
              onClick={onNavigate}
              sx={{
                position: 'relative',
                mx: 1.5,
                my: 0.35,
                py: 1.05,
                px: 1.75,
                borderRadius: 2.5,
                color: active ? colors.rail.textActive : colors.rail.text,
                bgcolor: active ? colors.rail.activeBg : 'transparent',
                transition: 'background-color .16s ease, color .16s ease',
                '&:hover': { bgcolor: active ? colors.rail.activeBgHover : colors.rail.hover, color: colors.rail.textActive },
                '&::before': active
                  ? { content: '""', position: 'absolute', left: -2, top: '24%', bottom: '24%', width: 3, borderRadius: 4, bgcolor: 'primary.main' }
                  : undefined,
              }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: active ? 'primary.light' : 'inherit' }}>{it.icon}</ListItemIcon>
              <ListItemText primary={it.label} primaryTypographyProps={{ fontWeight: 600, fontSize: '0.925rem' }} />
            </ListItemButton>
          );
        })}
      </List>

      <Box sx={{ p: 2 }}>
        <Box sx={{ borderRadius: 3, p: 1.75, bgcolor: colors.rail.bgElevated, border: `1px solid ${colors.rail.border}` }}>
          <Typography sx={{ color: colors.rail.textActive, fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.2 }}>Bridgette Portal</Typography>
          <Typography sx={{ color: colors.rail.textDim, fontSize: '0.72rem', mt: 0.25 }}>
            Invoicing &amp; management
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

/** App chrome: fixed dark sidebar (desktop) / drawer (mobile) + sticky glass header. */
export function AppShell({ canViewUsers, children }: { canViewUsers: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', icon: <SpaceDashboardRounded fontSize="small" /> },
    { href: '/invoices', label: 'Invoices', icon: <ReceiptLongRounded fontSize="small" /> },
    ...(canViewUsers ? [{ href: '/users', label: 'Users', icon: <GroupRounded fontSize="small" /> }] : []),
    { href: '/settings', label: 'Settings', icon: <SettingsRounded fontSize="small" /> },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {/* Tablet/desktop rail (>=768px) — reserves width in flow, panel is fixed */}
      <Box component="nav" sx={{ width: RAIL, flexShrink: 0, display: 'none', [RAIL_QUERY]: { display: 'block' } }}>
        <Box sx={{ position: 'fixed', top: 0, bottom: 0, width: RAIL, bgcolor: colors.rail.bg, borderRight: `1px solid ${colors.rail.border}` }}>
          <RailContent items={items} isActive={isActive} />
        </Box>
      </Box>

      {/* Drawer (<768px) */}
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        sx={{ [RAIL_QUERY]: { display: 'none' } }}
        ModalProps={{ keepMounted: true }}
        PaperProps={{ sx: { width: RAIL, bgcolor: colors.rail.bg, backgroundImage: 'none', border: 'none', borderRadius: 0 } }}
      >
        <RailContent items={items} isActive={isActive} onNavigate={() => setOpen(false)} />
      </Drawer>

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
          <IconButton onClick={() => setOpen(true)} edge="start" aria-label="Open navigation" sx={{ [RAIL_QUERY]: { display: 'none' } }}>
            <MenuRounded />
          </IconButton>
          {/* Single page title — brand gradient, display font (brand lives in the rail/drawer). */}
          <Typography
            component="h1"
            sx={{
              fontFamily: displayFont,
              fontWeight: 600,
              fontSize: { xs: '1.5rem', md: '1.8rem' },
              lineHeight: 1,
              letterSpacing: '-0.01em',
              background: gradients.brand,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              display: 'inline-block',
            }}
          >
            {pageTitle(pathname)}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <ProfileMenu />
        </Box>

        <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2.5, md: 3.5 } }}>
          <Box sx={{ maxWidth: 1520, mx: 'auto', width: '100%' }}>{children}</Box>
        </Box>
      </Box>
    </Box>
  );
}
