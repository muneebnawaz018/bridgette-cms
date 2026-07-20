import Chip from '@mui/material/Chip';
import { colors } from '@/lib/colors';

export type Tone = 'neutral' | 'success' | 'warning' | 'info' | 'error';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.status.neutralBg, fg: colors.ink[500] },
  success: { bg: colors.status.successBg, fg: colors.status.success },
  warning: { bg: colors.status.warningBg, fg: colors.status.warning },
  info: { bg: colors.status.infoBg, fg: colors.status.info },
  error: { bg: colors.status.errorBg, fg: colors.status.error },
};

/** Soft, tinted status pill — cohesive across dashboard, invoices and users tables. */
export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const c = TONE[tone];
  return (
    <Chip
      label={label}
      size="small"
      sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 600, borderRadius: 2, '& .MuiChip-label': { px: 1 } }}
    />
  );
}

/** Shared state → tone mapping for invoice lifecycle states. */
export const invoiceStateTone: Record<string, Tone> = {
  draft: 'neutral',
  pending: 'warning',
  partiallyPaid: 'info',
  paid: 'success',
  overdue: 'error',
};

/** Same idea for account status, so the user table and the user card agree on the colours. */
export const userStatusTone: Record<string, Tone> = {
  active: 'success',
  invited: 'warning',
  disabled: 'neutral',
};
