'use client';

import type { ReactNode } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Reusable confirmation dialog for actions the user should not trigger by accident
 * (sign out, deactivate, archive, and other one-way changes). Locks while `loading`.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'primary',
  confirmDisabled = false,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  /** Extra content (e.g. a reason field) rendered below the description. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'primary' | 'error';
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const hasBody = Boolean(description || children);
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
      {hasBody && (
        <DialogContent>
          {description && (
            <DialogContentText sx={{ color: 'text.secondary', mb: children ? 2 : 0 }}>
              {description}
            </DialogContentText>
          )}
          {children}
        </DialogContent>
      )}
      <DialogActions sx={{ px: 3, pb: 2.5, pt: hasBody ? 0 : 1 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          {cancelLabel}
        </Button>
        <SubmitButton
          onClick={onConfirm}
          loading={loading}
          disabled={confirmDisabled}
          variant="contained"
          color={confirmColor}
        >
          {confirmLabel}
        </SubmitButton>
      </DialogActions>
    </Dialog>
  );
}
