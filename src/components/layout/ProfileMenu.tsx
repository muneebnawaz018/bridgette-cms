'use client';

import { useState } from 'react';
import { AppLink } from '@/components/ui/AppLink';
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
import { useSession } from '@/components/auth/SessionProvider';
import { useSignOut } from '@/components/auth/useSignOut';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function ProfileMenu() {
  const { email, role } = useSession();
  const { signOut, signingOut } = useSignOut();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const initial = email.charAt(0).toUpperCase();

  return (
    <>
      {/* p:0 so the button is exactly the avatar — a 40x40 box matching the nav toggle. */}
      <IconButton
        onClick={(e) => setAnchor(e.currentTarget)}
        size="small"
        sx={{ ml: 1, p: 0, flexShrink: 0 }}
      >
        <Avatar
          sx={{ width: 40, height: 40, bgcolor: 'primary.main', fontWeight: 700, fontSize: '1rem' }}
        >
          {initial}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, maxWidth: 'calc(100vw - 32px)', mt: 1 } } }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {email}
          </Typography>
          <Chip label={role} size="small" color="primary" sx={{ mt: 0.5 }} />
        </Box>
        <Divider />
        <MenuItem component={AppLink} href="/profile" onClick={() => setAnchor(null)}>
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
