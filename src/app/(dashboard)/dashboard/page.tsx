'use client';

import { AppLink } from '@/components/ui/AppLink';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Avatar from '@mui/material/Avatar';
import AccountBalanceRounded from '@mui/icons-material/AccountBalanceRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import PublicRounded from '@mui/icons-material/PublicRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useState, type ReactNode } from 'react';
import { Permission } from '@/modules/auth/rbac';
import { useSession, useCan } from '@/components/auth/SessionProvider';
import { useApi } from '@/lib/api/useApi';
import { colors, gradients, redA } from '@/lib/colors';
import type { SxProps, Theme } from '@mui/material/styles';
import { displayFont } from '@/lib/theme';
import { formatMonth } from '@/lib/format/date';
import { formatMoney } from '@/lib/format/money';
import { ROLE_LABEL, invoiceTypeLabel } from '@/lib/format/labels';

// Outline button styling for use on the dark gradient quick-actions panel.
//
// The hover selector matches the theme's own `&:not(.Mui-disabled):hover` specificity — without
// it the theme's outlined-hover (a light fill) wins and turns the white label invisible on the
// dark panel.
const onDarkButtonSx = {
  color: colors.onDark.text,
  borderColor: colors.onDark.border,
  bgcolor: colors.onDark.fill,
  '&:not(.Mui-disabled):hover': {
    color: colors.onDark.text,
    bgcolor: colors.onDark.fillHover,
    borderColor: colors.onDark.borderHover,
  },
} as const;

interface TypeTotals {
  count: number;
  invoiced: number;
  outstanding: number;
}
interface StatsSlice {
  total: number;
  byState: Record<string, number>;
  byType: Record<string, TypeTotals>;
}
interface Stats extends StatsSlice {
  range: RangeKey;
  /** ISO start of the selected period — null for lifetime. */
  rangeStart: string | null;
  /** ISO start of the current month (server-decided). */
  pipelineMonth: string;
  month: StatsSlice;
}

/** Periods the range filter offers. Keys match the API's `range` param. The API also accepts
 *  `month`, but it isn't offered here — the fixed month block below already shows it. */
const RANGES = [
  { key: '3m', label: '3 months', short: '3M' },
  { key: '6m', label: '6 months', short: '6M' },
  { key: '9m', label: '9 months', short: '9M' },
  { key: '12m', label: '12 months', short: '12M' },
  { key: 'all', label: 'Overall', short: 'All' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

// The 3 invoice types. All bill in USD (US and PK alike).
const TYPES = [
  { key: 'tax', label: 'Tax', currency: 'USD', icon: <AccountBalanceRounded /> },
  { key: 'cash', label: 'Cash', currency: 'USD', icon: <PaymentsRounded /> },
  { key: 'pk', label: 'PK', currency: 'USD', icon: <PublicRounded /> },
] as const;

interface RecentInvoice {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  grandTotal: number;
  billTo?: { name?: string };
}

/** How many invoices the dashboard preview lists — named in the heading, so one constant. */
const RECENT_LIMIT = 3;

const STATES = [
  { k: 'draft', label: 'Draft', color: colors.ink[400] },
  { k: 'pending', label: 'Pending', color: colors.status.warning },
  { k: 'partiallyPaid', label: 'Partially paid', color: colors.status.info },
  { k: 'paid', label: 'Paid', color: colors.status.success },
  { k: 'overdue', label: 'Overdue', color: colors.status.error },
] as const;

const stateChip: Record<string, { bg: string; fg: string }> = {
  draft: { bg: colors.status.neutralBg, fg: colors.ink[500] },
  pending: { bg: colors.status.warningBg, fg: colors.status.warning },
  partiallyPaid: { bg: colors.status.infoBg, fg: colors.status.info },
  paid: { bg: colors.status.successBg, fg: colors.status.success },
  overdue: { bg: colors.status.errorBg, fg: colors.status.error },
};

function StateChip({ state, sx }: { state: string; sx?: SxProps<Theme> }) {
  const c = stateChip[state] ?? stateChip.draft;
  const label = STATES.find((x) => x.k === state)?.label ?? state;
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: c.bg,
        color: c.fg,
        fontWeight: 600,
        borderRadius: 1,
        '& .MuiChip-label': { px: 1 },
        ...sx,
      }}
    />
  );
}

/** Per-invoice-type card: outstanding (hero number) + invoiced + a paid-progress bar.
 *  Clicking navigates to the invoices list with this type preselected. */
function TypeStatCard({
  label,
  currency,
  icon,
  totals,
  href,
}: {
  label: string;
  currency: string;
  icon: ReactNode;
  totals?: TypeTotals;
  href: string;
}) {
  const t = totals ?? { count: 0, invoiced: 0, outstanding: 0 };
  const paid = Math.max(0, t.invoiced - t.outstanding);
  const ratio = t.invoiced > 0 ? Math.min(100, Math.round((paid / t.invoiced) * 100)) : 0;

  return (
    <Paper
      component={AppLink}
      href={href}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        cursor: 'pointer',
        // Two rows of these now stack above the pipeline, so the card is tuned tight — any
        // taller and the pipeline and recent invoices fall below the fold on a laptop.
        p: 2,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform .2s ease, box-shadow .2s ease',
        '&:hover': { transform: 'translateY(-3px)', boxShadow: (th) => th.shadows[4] },
        '&::before': {
          content: '""',
          position: 'absolute',
          insetInline: 0,
          top: 0,
          height: 3,
          background: gradients.brand,
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.25 }}>
        <Box
          sx={{
            width: 38,
            height: 38,
            '& svg': { fontSize: 20 },
            borderRadius: 1,
            display: 'grid',
            placeItems: 'center',
            bgcolor: redA(0.1),
            color: 'primary.main',
          }}
        >
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>
            {label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t.count} invoice{t.count === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Chip
          label={currency}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 700, color: colors.ink[500] }}
        />
      </Box>

      {/* Collected is the headline — "how much has come in" reads clearer than "Outstanding".
          The amount still owed sits below with the progress. */}
      <Typography variant="overline" color="text.secondary">
        Collected
      </Typography>
      <Typography
        className="tnum"
        sx={{
          fontFamily: displayFont,
          fontWeight: 700,
          fontSize: '1.85rem',
          lineHeight: 1.05,
          color: colors.ink[900],
        }}
      >
        {formatMoney(currency, paid)}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        of {formatMoney(currency, t.invoiced)} invoiced
      </Typography>

      <Box sx={{ mt: 1.25 }}>
        <LinearProgress
          variant="determinate"
          value={ratio}
          sx={{
            height: 6,
            borderRadius: 3,
            bgcolor: colors.surface.subtle,
            '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: colors.status.success },
          }}
        />
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 1,
            mt: 0.75,
          }}
        >
          <Typography
            variant="caption"
            className="tnum"
            sx={{ fontWeight: 600, color: t.outstanding > 0 ? 'error.main' : 'text.secondary' }}
          >
            {formatMoney(currency, t.outstanding)} unpaid
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {ratio}% collected
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

export default function DashboardPage() {
  const { email, role } = useSession();
  const canCreateInvoice = useCan(Permission.InvoiceCreate);
  const canCreateUser = useCan(Permission.UserCreate);
  // Default is lifetime — the month-only block below always shows the current month, so the
  // top block is the one that answers "and how are we doing overall?".
  const [range, setRange] = useState<RangeKey>('all');
  const { data: stats } = useApi<Stats>(`/api/dashboard/stats?range=${range}`, {
    keepPreviousData: true,
  });
  // A preview of the most recent few; "View all" is the way to the full list.
  const { data: recentData } = useApi<{ items: RecentInvoice[] }>(
    `/api/invoices?limit=${RECENT_LIMIT}`,
  );
  const recent = recentData?.items ?? [];
  const s = stats?.byState ?? {};
  // Labelled from the server's own window so the heading can't drift from the data.
  const rangeLabel =
    range === 'all'
      ? 'All time'
      : `${RANGES.find((r) => r.key === range)?.label} · since ${formatMonth(stats?.rangeStart, '—')}`;
  const name = email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Box className="rise-in">
      {/* Greeting */}
      <Box sx={{ mb: 3.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 800 }}>
          Welcome back, {name}
        </Typography>
        <Typography
          color="text.secondary"
          sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
        >
          Your invoices across all types.
          <Chip
            component="span"
            size="small"
            label={ROLE_LABEL[role] ?? role}
            sx={{
              fontWeight: 700,
              color: colors.onDark.text,
              background: gradients.brand,
              border: 'none',
              boxShadow: `0 2px 8px ${redA(0.3)}`,
            }}
          />
        </Typography>
      </Box>

      {/* Range filter — drives the first row of cards and the pipeline. The month row below
          is fixed to the current month and ignores it. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
          mb: 1,
        }}
      >
        <Typography variant="overline" color="text.secondary">
          {rangeLabel}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={range}
          onChange={(_, v: RangeKey | null) => v && setRange(v)}
          // Five full labels are ~390px — wider than a 375px phone. Below sm the buttons show
          // their short form and share the row equally; the heading beside them spells the
          // period out in full either way.
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          {RANGES.map((r) => (
            <ToggleButton
              key={r.key}
              value={r.key}
              sx={{ fontWeight: 700, px: { xs: 0.5, sm: 1.5 }, flexGrow: { xs: 1, sm: 0 } }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
                {r.label}
              </Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
                {r.short}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {TYPES.map((t) => (
          <Grid size={{ xs: 12, md: 4 }} key={t.key}>
            <TypeStatCard
              label={invoiceTypeLabel(t.key)}
              currency={t.currency}
              icon={t.icon}
              totals={stats?.byType[t.key]}
              href={`/invoices?type=${t.key}`}
            />
          </Grid>
        ))}
      </Grid>

      {/* The same three figures, always current-month, so the selected range never hides how
          the month itself is going. Condensed into one strip: a second row of full cards
          pushed the pipeline and recent invoices below the fold. */}
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        This month · {formatMonth(stats?.pipelineMonth, 'this month')}
      </Typography>
      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {TYPES.map((t) => (
          <Grid size={{ xs: 12, md: 4 }} key={`m-${t.key}`}>
            <TypeStatCard
              label={invoiceTypeLabel(t.key)}
              currency={t.currency}
              icon={t.icon}
              totals={stats?.month.byType[t.key]}
              href={`/invoices?type=${t.key}`}
            />
          </Grid>
        ))}
      </Grid>

      {/* Pipeline — 5 states as colored mini-stats in one card */}
      <Paper sx={{ p: { xs: 2.5, md: 3 }, mb: 2.5 }}>
        <Typography variant="overline" color="text.secondary">
          Invoice pipeline · {rangeLabel}
        </Typography>
        <Grid container spacing={2} sx={{ mt: 0.25 }}>
          {STATES.map((st) => (
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={st.k}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: st.color,
                    flexShrink: 0,
                  }}
                />
                <Box>
                  <Typography
                    className="tnum"
                    sx={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.1 }}
                  >
                    {s[st.k] ?? 0}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {st.label}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          ))}
        </Grid>
      </Paper>

      {/* Recent invoices + quick actions */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Recent {RECENT_LIMIT} invoices
              </Typography>
              <Button
                component={AppLink}
                href="/invoices"
                size="small"
                endIcon={<ArrowForwardRounded fontSize="small" />}
              >
                View all
              </Button>
            </Box>
            {recent.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <ReceiptLongRounded sx={{ fontSize: 40, color: colors.ink[300] }} />
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  No invoices yet.
                </Typography>
              </Box>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {recent.map((inv) => (
                  <Box
                    key={inv._id}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.4 }}
                  >
                    <Avatar
                      variant="rounded"
                      sx={{
                        width: 38,
                        height: 38,
                        // The type badge is the only brand mark in this list; grey-on-grey made
                        // it read as a disabled chip rather than the label it is.
                        backgroundImage: gradients.brand,
                        color: colors.brand.white,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                      }}
                    >
                      {inv.type.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>
                        {inv.number}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>
                        {inv.billTo?.name ?? '—'}
                      </Typography>
                    </Box>
                    <StateChip state={inv.state} sx={{ flexShrink: 0 }} />
                    {/* The hard 120px floor plus a non-shrinking chip pushed this row past its
                        card below ~380px. Drop the floor at xs — the amount is `noWrap`, so it
                        keeps itself on one line without reserving width the small screen lacks. */}
                    <Typography
                      className="tnum"
                      noWrap
                      sx={{
                        minWidth: { xs: 0, sm: 120 },
                        textAlign: 'right',
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {formatMoney(inv.currency, Number(inv.grandTotal))}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          {/* Gradient quick-actions panel */}
          <Paper
            sx={{
              p: 3,
              height: '100%',
              border: 'none',
              color: colors.onDark.text,
              background: gradients.ink,
              position: 'relative',
              overflow: 'hidden',
              /* Side by side, this card is the shorter of the two and stretches to match. Centring
                 its content keeps the leftover height split evenly instead of pooling underneath
                 the last button. Stacked on a phone it has no leftover height and this is a no-op. */
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: -80,
                right: -60,
                width: 220,
                height: 220,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${redA(0.28)}, transparent 70%)`,
              }}
            />
            <Typography variant="h6" sx={{ color: colors.onDark.text, position: 'relative' }}>
              Quick actions
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: colors.onDark.textDim, mb: 2.5, position: 'relative' }}
            >
              Jump straight to what you need.
            </Typography>
            <Stack spacing={1.5} sx={{ position: 'relative' }}>
              {canCreateInvoice && (
                <Button
                  component={AppLink}
                  href="/invoices/new"
                  variant="contained"
                  fullWidth
                  startIcon={<AddRounded />}
                >
                  Create invoice
                </Button>
              )}
              <Button
                component={AppLink}
                href="/invoices"
                fullWidth
                startIcon={<ReceiptLongRounded />}
                variant="outlined"
                sx={onDarkButtonSx}
              >
                View invoices
              </Button>
              {canCreateUser && (
                <Button
                  component={AppLink}
                  href="/users"
                  fullWidth
                  startIcon={<GroupRounded />}
                  variant="outlined"
                  sx={onDarkButtonSx}
                >
                  Manage users
                </Button>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
