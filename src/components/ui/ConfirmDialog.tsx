'use client';

import type { ReactNode } from 'react';
import Button from '@mui/material/Button';
import CloseRounded from '@mui/icons-material/CloseRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import { Modal } from '@/components/ui/Modal';
import { SubmitButton } from '@/components/ui/SubmitButton';

/**
 * Confirmation dialog for actions the user should not trigger by accident (sign out,
 * deactivate, archive, and other one-way changes). Built on the shared Modal, so it gets
 * click-outside dismiss and the transition for free. Locks while `loading`.
 *
 * No close (X): the question already has two answers on screen, and a third way to dismiss
 * in the corner is noise on a dialog this small.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmIcon,
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
  /** Overrides the default tick — pass a delete/send/etc icon when that reads truer. */
  confirmIcon?: ReactNode;
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
      showClose={false}
      actions={
        <>
          <Button
            onClick={onClose}
            disabled={loading}
            variant="outlined"
            color="inherit"
            startIcon={<CloseRounded />}
          >
            {cancelLabel}
          </Button>
          <SubmitButton
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
            variant="contained"
            color={confirmColor}
            startIcon={confirmIcon ?? <CheckRounded />}
          >
            {confirmLabel}
          </SubmitButton>
        </>
      }
    >
      {children}
    </Modal>
  );
}
