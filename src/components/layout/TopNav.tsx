'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/icons-material/Menu';
import { ProfileMenu } from '@/components/layout/ProfileMenu';

interface NavItem {
  href: string;
  label: string;
}

export function TopNav({ canViewUsers }: { canViewUsers: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/invoices', label: 'Invoices' },
    ...(canViewUsers ? [{ href: '/users', label: 'Users' }] : []),
  ];

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <AppBar
      position="sticky"
      color="primary"
      elevation={0}
      sx={{ borderBottom: '3px solid', borderColor: 'primary.main' }}
    >
      <Toolbar sx={{ gap: { xs: 1, md: 3 }, minHeight: { xs: 56, md: 68 } }}>
        {/* Hamburger — mobile only */}
        <IconButton
          color="inherit"
          edge="start"
          onClick={() => setOpen(true)}
          sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          aria-label="Open navigation"
        >
          <Menu />
        </IconButton>

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo.png"
          alt="Bridgette Enterprises"
          style={{ height: 30 }}
        />

        {/* Inline nav — desktop/tablet */}
        <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, gap: 0.5 }}>
          {items.map((it) => (
            <Button
              key={it.href}
              component={Link}
              href={it.href}
              color="inherit"
              sx={{
                fontWeight: 600,
                letterSpacing: 0.5,
                px: 2,
                borderRadius: 0,
                borderBottom: '2px solid',
                borderColor: isActive(it.href) ? 'common.white' : 'transparent',
              }}
            >
              {it.label}
            </Button>
          ))}
        </Box>

        {/* Spacer on mobile (logo left, profile right) */}
        <Box sx={{ flexGrow: 1, display: { xs: 'block', md: 'none' } }} />

        <ProfileMenu />
      </Toolbar>

      {/* Mobile drawer */}
      <Drawer anchor="left" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 240, pt: 1 }} role="navigation" onClick={() => setOpen(false)}>
          <List>
            {items.map((it) => (
              <ListItemButton
                key={it.href}
                component={Link}
                href={it.href}
                selected={isActive(it.href)}
              >
                <ListItemText primary={it.label} primaryTypographyProps={{ fontWeight: 600 }} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </AppBar>
  );
}
