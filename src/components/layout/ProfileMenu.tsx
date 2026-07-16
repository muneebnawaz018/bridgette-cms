'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Logout from '@mui/icons-material/Logout';
import Person from '@mui/icons-material/Person';
import { useSnackbar } from 'notistack';
import { useSession } from '@/components/auth/SessionProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { apiPost } from '@/lib/api/client';

export function ProfileMenu() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const { email, role } = useSession();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await apiPost('/api/auth/logout', {});
    enqueueSnackbar('Signed out', { variant: 'success' });
    router.replace('/login');
    router.refresh();
  }

  const initial = email.charAt(0).toUpperCase();

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} size="small" sx={{ ml: 1 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontWeight: 700 }}>
          {initial}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {email}
          </Typography>
          <Chip label={role} size="small" color="primary" sx={{ mt: 0.5 }} />
        </Box>
        <Divider />
        <MenuItem component={Link} href="/profile" onClick={() => setAnchor(null)}>
          <ListItemIcon>
            <Person fontSize="small" />
          </ListItemIcon>
          My profile
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            setConfirmOpen(true);
          }}
        >
          <ListItemIcon>
            <Logout fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>

      <ConfirmDialog
        open={confirmOpen}
        title="Sign out?"
        description="You will need to sign in again to get back into the portal."
        confirmLabel="Sign out"
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setConfirmOpen(false)}
      />
    </>
  );
}
