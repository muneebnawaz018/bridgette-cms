'use client';

import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import { Modal } from '@/components/ui/Modal';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Confirmation dialog for actions the user should not trigger by accident (sign out,
 * deactivate, archive, and other one-way changes). Built on the shared Modal, so it gets
 * the close (X), click-outside dismiss, and transition for free. Locks while `loading`.
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
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      busy={loading}
      maxWidth="xs"
      actions={
        <>
          <Button onClick={onClose} disabled={loading} variant="outlined" color="inherit">
            {cancelLabel}
          </Button>
          <SubmitButton onClick={onConfirm} loading={loading} disabled={confirmDisabled} variant="contained" color={confirmColor}>
            {confirmLabel}
          </SubmitButton>
        </>
      }
    >
      {children}
    </Modal>
  );
}
