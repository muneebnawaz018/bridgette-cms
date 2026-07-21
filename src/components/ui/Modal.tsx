'use client';

import type { ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Grow from '@mui/material/Grow';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloseRounded from '@mui/icons-material/CloseRounded';
import { colors, gradients, redA } from '@/lib/colors';

export type ModalWidth = 'xs' | 'sm' | 'md' | 'lg';

/**
 * The one modal used across the app: rounded card, close (X) top-right, click-outside /
 * Esc to dismiss, and a grow-in transition. Keeps every dialog visually consistent.
 * Set `busy` to lock it (X, backdrop, and Esc) while a request is in flight.
 *
 * The X is desktop-only. On a phone it costs a whole line of header width, which pushes the
 * title down and starts the dialog scrolling, and it is redundant there: every dialog carries
 * an explicit Cancel or Close button, and the backdrop and Esc still dismiss. Pass
 * `showClose={false}` to drop it everywhere, which is what a confirmation dialog wants.
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
  showClose = true,
  fullScreenOnMobile = false,
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
  /** Set false when the dialog's own buttons are the only way out it needs. */
  showClose?: boolean;
  /**
   * Go edge-to-edge below sm. Opt-in, so small dialogs keep their card look; reserve it for
   * the long ones — the invoice form and the export stepper — that otherwise spend a phone
   * screen inside a 12px-inset card scrolling internally.
   */
  fullScreenOnMobile?: boolean;
}) {
  const close = () => {
    if (!busy) onClose();
  };

  // `noSsr` so the first client render already knows the width — without it a mobile dialog
  // flashes its card layout for a frame before switching to full screen.
  const fullScreen = useMediaQuery('(max-width:599.95px)', { noSsr: true }) && fullScreenOnMobile;

  return (
    <Dialog
      open={open}
      onClose={close}
      fullWidth
      fullScreen={fullScreen}
      maxWidth={maxWidth}
      TransitionComponent={Grow}
      transitionDuration={220}
      slotProps={{
        paper: {
          sx: fullScreen
            ? { position: 'relative', borderRadius: 0 }
            : {
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
      {/* Sits on the same left/right inset as the header text and level with the title's
          first line. The old neutral grey read as disabled — a brand-tinted fill with the
          gradient on hover makes it clearly the way out.

          Hidden below sm: on a phone the space it reserves squeezes the title into extra
          lines and starts the dialog scrolling, and the buttons at the bottom already say
          how to leave. */}
      {showClose && (
        <IconButton
          aria-label="Close"
          onClick={close}
          disabled={busy}
          size="small"
          sx={{
            display: { xs: 'none', sm: 'inline-flex' },
            position: 'absolute',
            top: 22,
            right: 24,
            zIndex: 2,
            color: 'primary.main',
            bgcolor: redA(0.1),
            transition: 'background-color .16s ease, color .16s ease',
            '&:hover': {
              color: colors.brand.white,
              backgroundImage: gradients.brand,
            },
          }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      )}

      {(title || icon) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: { xs: 2, sm: 3 },
            pt: 2.75,
            pb: description ? 0.5 : 1.5,
            // Room for the close button, which is pinned to the top-right corner. Only from
            // sm up, since that is the only place it renders — reserving it on a phone was
            // costing the title a chunk of its width for nothing.
            ...(showClose ? { pr: { xs: 2, sm: 6 } } : null),
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
            // Three buttons (Cancel / Save as draft / Create invoice) need ~440px on one line
            // and a 320px phone offers 264px. Wrapping alone left them right-aligned across
            // two or three lines with an orphan on the last row, so below sm they stack and
            // fill the width instead.
            //
            // column-reverse, not column: `actions` is written primary-last for a left-to-right
            // row, and stacked the primary action belongs on top, nearest the thumb.
            flexDirection: { xs: 'column-reverse', sm: 'row' },
            alignItems: { xs: 'stretch', sm: 'center' },
            '& > *': { width: { xs: '100%', sm: 'auto' } },
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
