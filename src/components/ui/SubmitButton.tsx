'use client';

import Button, { type ButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Button that shows a spinner and is disabled while `loading` — prevents double submits
 * and locks the action during in-flight requests.
 */
export function SubmitButton({
  loading,
  children,
  disabled,
  ...props
}: ButtonProps & { loading: boolean }) {
  return (
    <Button
      {...props}
      disabled={loading || disabled}
      startIcon={loading ? <CircularProgress size={18} color="inherit" /> : props.startIcon}
    >
      {children}
    </Button>
  );
}
