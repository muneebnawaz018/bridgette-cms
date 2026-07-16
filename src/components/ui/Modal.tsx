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
      slotProps={{
        paper: {
          sx: {
            position: 'relative',
            borderRadius: 3,
            // MUI's default 32px margin costs 64px of a phone's width, which is most of the
            // room a 320px screen has for content. Claw it back below sm.
            //
            // maxWidth is deliberately left to MUI's own paperWidth* class. Setting it here
            // would leak: sx breakpoints are min-width, so an `xs` value with no `sm` value
            // above it applies at every width and silently overrides the maxWidth prop.
            m: { xs: 1.5, sm: 4 },
            width: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
            maxHeight: { xs: 'calc(100% - 24px)', sm: 'calc(100% - 64px)' },
          },
        },
      }}
    >
      <IconButton
        aria-label="Close"
        onClick={close}
        disabled={busy}
        size="small"
        sx={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 2,
          color: 'text.secondary',
          bgcolor: 'action.hover',
          transition: 'background-color .16s ease, color .16s ease',
          '&:hover': { bgcolor: 'action.selected', color: 'text.primary' },
        }}
      >
        <CloseRounded fontSize="small" />
      </IconButton>

      {(title || icon) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            pt: 2.75,
            pb: description ? 0.5 : 1.5,
            // Room for the close button, which is pinned to the top-right corner.
            pr: { xs: 5.5, sm: 6 },
          }}
        >
          {icon && (
            <Box sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 2, color: 'primary.main', bgcolor: 'action.hover', flexShrink: 0 }}>
              {icon}
            </Box>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={{ fontWeight: 700, fontSize: { xs: '1.05rem', sm: '1.15rem' }, lineHeight: 1.3 }}>
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

      {children && (
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: title || icon ? 2 : 3 }}>{children}</DialogContent>
      )}

      {actions && (
        <DialogActions
          sx={{
            px: { xs: 2, sm: 3 },
            pb: 2.5,
            pt: children ? 0.5 : 1.5,
            // Three buttons (Cancel / Back / Export) don't fit one line on a small phone.
            // Let them wrap; gap replaces MUI's fixed left margin so wrapped rows stay spaced.
            flexWrap: 'wrap',
            gap: 1,
            '& > :not(:first-of-type)': { ml: 0 },
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
}
