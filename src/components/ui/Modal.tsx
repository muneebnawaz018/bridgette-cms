'use client';

import type { ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Grow from '@mui/material/Grow';
import CloseRounded from '@mui/icons-material/CloseRounded';

export type ModalWidth = 'xs' | 'sm' | 'md' | 'lg';

/**
 * The one modal used across the app: rounded card, close (X) top-right, click-outside /
 * Esc to dismiss, and a grow-in transition. Keeps every dialog visually consistent.
 * Set `busy` to lock it (X, backdrop, and Esc) while a request is in flight.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  icon,
  maxWidth = 'sm',
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  maxWidth?: ModalWidth;
  busy?: boolean;
}) {
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      maxWidth={maxWidth}
      TransitionComponent={Grow}
      transitionDuration={220}
      slotProps={{ paper: { sx: { position: 'relative', borderRadius: 3 } } }}
    >
      <IconButton
        aria-label="Close"
        onClick={close}
        disabled={busy}
        size="small"
        sx={{ position: 'absolute', top: 10, right: 10, zIndex: 2, color: 'text.secondary' }}
      >
        <CloseRounded fontSize="small" />
      </IconButton>

      {(title || icon) && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, pt: 2.75, pb: description ? 0.5 : 1.5, pr: 6 }}>
          {icon && (
            <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, color: 'primary.main', bgcolor: 'action.hover', flexShrink: 0 }}>
              {icon}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.3 }}>
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {description}
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {children && <DialogContent sx={{ px: 3, py: title || icon ? 2 : 3 }}>{children}</DialogContent>}

      {actions && <DialogActions sx={{ px: 3, pb: 2.5, pt: children ? 0.5 : 1.5 }}>{actions}</DialogActions>}
    </Dialog>
  );
}
