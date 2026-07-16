'use client';

import Link from 'next/link';
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
import type { ReactNode } from 'react';
import { Permission } from '@/modules/auth/rbac';
import { useSession, useCan } from '@/components/auth/SessionProvider';
import { useApi } from '@/lib/api/useApi';
import { colors, gradients, redA } from '@/lib/colors';
import { displayFont } from '@/lib/theme';

// Outline button styling for use on the dark gradient quick-actions panel.
const onDarkButtonSx = {
  color: colors.onDark.text,
  borderColor: colors.onDark.border,
  bgcolor: colors.onDark.fill,
  '&:hover': { bgcolor: colors.onDark.fillHover, borderColor: colors.onDark.borderHover },
} as const;

interface TypeTotals {
  count: number;
  invoiced: number;
  outstanding: number;
}
interface Stats {
  total: number;
  byState: Record<string, number>;
  byType: Record<string, TypeTotals>;
}

// The 3 invoice types + their fixed currency (Tax/Cash = USD, PK = PKR).
const TYPES = [
  { key: 'tax', label: 'Tax', currency: 'USD', icon: <AccountBalanceRounded /> },
  { key: 'cash', label: 'Cash', currency: 'USD', icon: <PaymentsRounded /> },
  { key: 'pk', label: 'PK', currency: 'PKR', icon: <PublicRounded /> },
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

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function StateChip({ state }: { state: string }) {
  const c = stateChip[state] ?? stateChip.draft;
  const label = STATES.find((x) => x.k === state)?.label ?? state;
  return (
    <Chip
      label={label}
      size="small"
      sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 600, borderRadius: 2, '& .MuiChip-label': { px: 1 } }}
    />
  );
}

/** Per-invoice-type card: outstanding (hero number) + invoiced + a paid-progress bar. */
function TypeStatCard({ label, currency, icon, totals }: { label: string; currency: string; icon: ReactNode; totals?: TypeTotals }) {
  const t = totals ?? { count: 0, invoiced: 0, outstanding: 0 };
  const paid = Math.max(0, t.invoiced - t.outstanding);
  const ratio = t.invoiced > 0 ? Math.min(100, Math.round((paid / t.invoiced) * 100)) : 0;

  return (
    <Paper
      sx={{
        p: 3,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition: 'transform .2s ease, box-shadow .2s ease',
        '&:hover': { transform: 'translateY(-3px)', boxShadow: (th) => th.shadows[4] },
        '&::before': { content: '""', position: 'absolute', insetInline: 0, top: 0, height: 3, background: gradients.brand },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: redA(0.1), color: 'primary.main' }}>
          {icon}
        </Box>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', lineHeight: 1.2 }}>{label}</Typography>
          <Typography variant="caption" color="text.secondary">{t.count} invoice{t.count === 1 ? '' : 's'}</Typography>
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Chip label={currency} size="small" variant="outlined" sx={{ fontWeight: 700, color: colors.ink[500] }} />
      </Box>

      <Typography variant="overline" color="text.secondary">Outstanding</Typography>
      <Typography className="tnum" sx={{ fontFamily: displayFont, fontWeight: 700, fontSize: '2.15rem', lineHeight: 1.05, color: t.outstanding > 0 ? colors.status.error : colors.ink[900] }}>
        {money(t.outstanding)}
      </Typography>

      <Box sx={{ mt: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
          <Typography variant="caption" color="text.secondary">Invoiced</Typography>
          <Typography variant="caption" className="tnum" sx={{ fontWeight: 700 }}>{money(t.invoiced)}</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={ratio}
          sx={{ height: 6, borderRadius: 3, bgcolor: colors.surface.subtle, '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: colors.status.success } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>{ratio}% collected</Typography>
      </Box>
    </Paper>
  );
}

export default function DashboardPage() {
  const { email, role } = useSession();
  const canCreateInvoice = useCan(Permission.InvoiceCreate);
  const canCreateUser = useCan(Permission.UserCreate);
  const { data: stats } = useApi<Stats>('/api/dashboard/stats');
  const { data: recentData } = useApi<{ items: RecentInvoice[] }>('/api/invoices?limit=6');
  const recent = recentData?.items ?? [];
  const s = stats?.byState ?? {};
  const name = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Box className="rise-in">
      {/* Greeting + primary actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3.5 }}>
        <Box sx={{ flexGrow: 1, minWidth: 240 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Welcome back, {name}</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            A snapshot of your invoices across all types.
            <Chip component="span" size="small" label={role} color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.25}>
          {canCreateInvoice && (
            <Button component={Link} href="/invoices/new" variant="contained" startIcon={<AddRounded />}>
              New invoice
            </Button>
          )}
          <Button component={Link} href="/invoices" variant="outlined" endIcon={<ArrowForwardRounded />}>
            All invoices
          </Button>
        </Stack>
      </Box>

      {/* One premium card per invoice type */}
      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {TYPES.map((t) => (
          <Grid size={{ xs: 12, md: 4 }} key={t.key}>
            <TypeStatCard label={t.label} currency={t.currency} icon={t.icon} totals={stats?.byType[t.key]} />
          </Grid>
        ))}
      </Grid>

      {/* Pipeline — 5 states as colored mini-stats in one card */}
      <Paper sx={{ p: { xs: 2.5, md: 3 }, mb: 2.5 }}>
        <Typography variant="overline" color="text.secondary">Invoice pipeline</Typography>
        <Grid container spacing={2} sx={{ mt: 0.25 }}>
          {STATES.map((st) => (
            <Grid size={{ xs: 6, sm: 4, md: 2.4 }} key={st.k}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: st.color, flexShrink: 0 }} />
                <Box>
                  <Typography className="tnum" sx={{ fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.1 }}>{s[st.k] ?? 0}</Typography>
                  <Typography variant="caption" color="text.secondary">{st.label}</Typography>
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
              <Typography variant="h6" sx={{ flexGrow: 1 }}>Recent invoices</Typography>
              <Button component={Link} href="/invoices" size="small" endIcon={<ArrowForwardRounded fontSize="small" />}>
                View all
              </Button>
            </Box>
            {recent.length === 0 ? (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <ReceiptLongRounded sx={{ fontSize: 40, color: colors.ink[300] }} />
                <Typography color="text.secondary" sx={{ mt: 1 }}>No invoices yet.</Typography>
              </Box>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {recent.map((inv) => (
                  <Box key={inv._id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.4 }}>
                    <Avatar variant="rounded" sx={{ width: 38, height: 38, bgcolor: colors.surface.subtle, color: colors.ink[500], fontSize: '0.72rem', fontWeight: 700 }}>
                      {inv.type.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 700 }} noWrap>{inv.number}</Typography>
                      <Typography variant="body2" color="text.secondary" noWrap>{inv.billTo?.name ?? '—'}</Typography>
                    </Box>
                    <StateChip state={inv.state} />
                    <Typography className="tnum" sx={{ minWidth: 120, textAlign: 'right', fontWeight: 700 }}>
                      {inv.currency} {money(Number(inv.grandTotal))}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          {/* Gradient quick-actions panel */}
          <Paper sx={{ p: 3, height: '100%', border: 'none', color: colors.onDark.text, background: gradients.ink, position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', top: -80, right: -60, width: 220, height: 220, borderRadius: '50%', background: `radial-gradient(circle, ${redA(0.28)}, transparent 70%)` }} />
            <Typography variant="h6" sx={{ color: colors.onDark.text, position: 'relative' }}>Quick actions</Typography>
            <Typography variant="body2" sx={{ color: colors.onDark.textDim, mb: 2.5, position: 'relative' }}>Jump straight to what you need.</Typography>
            <Stack spacing={1.5} sx={{ position: 'relative' }}>
              {canCreateInvoice && (
                <Button component={Link} href="/invoices/new" variant="contained" fullWidth startIcon={<AddRounded />}>
                  Create invoice
                </Button>
              )}
              <Button component={Link} href="/invoices" fullWidth startIcon={<ReceiptLongRounded />} variant="outlined" sx={onDarkButtonSx}>
                View invoices
              </Button>
              {canCreateUser && (
                <Button component={Link} href="/users" fullWidth startIcon={<GroupRounded />} variant="outlined" sx={onDarkButtonSx}>
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
