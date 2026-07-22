'use client';

import type { ReactNode } from 'react';
import { SnackbarProvider, useSnackbar, type SnackbarKey } from 'notistack';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

/**
 * Dismiss button rendered on every toast. It reads closeSnackbar from context rather than the
 * standalone import so it works regardless of notistack version, and inherits the snackbar's
 * text colour so the cross stays legible on each variant's background.
 */
function ToastCloseButton({ id }: { id: SnackbarKey }) {
  const { closeSnackbar } = useSnackbar();
  return (
    <IconButton
      size="small"
      aria-label="Dismiss notification"
      onClick={() => closeSnackbar(id)}
      sx={{ color: 'inherit' }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  );
}

/** Client boundary for notistack (it isn't marked 'use client' itself). */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      autoHideDuration={4000}
      action={(id) => <ToastCloseButton id={id} />}
    >
      {children}
    </SnackbarProvider>
  );
}
