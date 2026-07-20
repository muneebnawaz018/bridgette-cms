'use client';

import Button, { type ButtonProps } from '@mui/material/Button';
import { useGlobalLoading } from '@/lib/api/useGlobalLoading';

/**
 * Button that locks itself while `loading`, so an action cannot be submitted twice.
 *
 * It deliberately shows no spinner of its own. The app has exactly one loader, the branded
 * overlay at the root, and a second indicator inside the button meant every save flashed two
 * at once. `loading` also holds that overlay open, which covers callers that do their own
 * fetch instead of going through the api client (which raises it already; asking twice is
 * harmless, the bus counts).
 */
export function SubmitButton({
  loading,
  children,
  disabled,
  ...props
}: ButtonProps & { loading: boolean }) {
  useGlobalLoading(loading);

  return (
    <Button {...props} disabled={loading || disabled}>
      {children}
    </Button>
  );
}
