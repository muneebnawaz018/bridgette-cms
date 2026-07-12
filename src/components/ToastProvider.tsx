'use client';

import type { ReactNode } from 'react';
import { SnackbarProvider } from 'notistack';

/** Client boundary for notistack (it isn't marked 'use client' itself). */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <SnackbarProvider
      maxSnack={3}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      autoHideDuration={4000}
    >
      {children}
    </SnackbarProvider>
  );
}
