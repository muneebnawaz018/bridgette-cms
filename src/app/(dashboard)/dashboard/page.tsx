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
import { Permission } from '@/modules/auth/rbac';
import { useSession, useCan } from '@/components/auth/SessionProvider';
import { useApi } from '@/lib/api/useApi';

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
  { key: 'tax', label: 'Tax', currency: 'USD' },
  { key: 'cash', label: 'Cash', currency: 'USD' },
  { key: 'pk', label: 'PK', currency: 'PKR' },
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

const stateColor: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  pending: 'warning',
  partiallyPaid: 'info',
  paid: 'success',
  overdue: 'error',
};

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Paper sx={{ p: 2.5, height: '100%', borderTop: '3px solid', borderColor: accent ? 'primary.main' : 'divider' }}>
      <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ mt: 0.5 }}>
        {value}
      </Typography>
    </Paper>
  );
}

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Per-invoice-type card: count + invoiced + outstanding in that type's currency. */
function TypeStatCard({
  label,
  currency,
  totals,
}: {
  label: string;
  currency: string;
  totals?: TypeTotals;
}) {
  const t = totals ?? { count: 0, invoiced: 0, outstanding: 0 };
  return (
    <Paper sx={{ p: 2.5, height: '100%', borderTop: '3px solid', borderColor: 'primary.main' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="h6">{label}</Typography>
        <Chip label={`${t.count}`} size="small" />
        <Box sx={{ flexGrow: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {currency}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">
          Invoiced
        </Typography>
        <Typography variant="body1" fontWeight={700}>
          {money(t.invoiced)}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Typography variant="body2" color="text.secondary">
          Outstanding
        </Typography>
        <Typography variant="body1" fontWeight={700} color={t.outstanding > 0 ? 'error.main' : 'text.primary'}>
          {money(t.outstanding)}
        </Typography>
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

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4">Dashboard</Typography>
          <Typography color="text.secondary">
            Signed in as {email} · <Chip component="span" size="small" label={role} color="primary" />
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {canCreateInvoice && (
            <Button component={Link} href="/invoices/new" variant="contained">
              New invoice
            </Button>
          )}
          <Button component={Link} href="/invoices" variant="outlined">
            All invoices
          </Button>
        </Stack>
      </Box>

      {/* One card per invoice type — Tax / Cash / PK, each in its own currency */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {TYPES.map((t) => (
          <Grid size={{ xs: 12, sm: 4 }} key={t.key}>
            <TypeStatCard label={t.label} currency={t.currency} totals={stats?.byType[t.key]} />
          </Grid>
        ))}
      </Grid>

      {/* State breakdown */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { k: 'draft', label: 'Draft' },
          { k: 'pending', label: 'Pending' },
          { k: 'partiallyPaid', label: 'Partially paid' },
          { k: 'paid', label: 'Paid' },
          { k: 'overdue', label: 'Overdue' },
        ].map((it) => (
          <Grid size={{ xs: 6, sm: 2.4 }} key={it.k}>
            <StatCard label={it.label} value={String(s[it.k] ?? 0)} />
          </Grid>
        ))}
      </Grid>

      {/* Recent invoices + quick links */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 2.5 }}>
            <Typography variant="h6" gutterBottom>
              Recent invoices
            </Typography>
            <Divider sx={{ mb: 1 }} />
            {recent.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 2 }}>
                No invoices yet.
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {recent.map((inv) => (
                  <Box key={inv._id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 1.2 }}>
                    <Typography sx={{ fontWeight: 600, minWidth: 140 }}>{inv.number}</Typography>
                    <Typography sx={{ flexGrow: 1 }} color="text.secondary" noWrap>
                      {inv.billTo?.name ?? '—'}
                    </Typography>
                    <Chip size="small" label={inv.state} color={stateColor[inv.state] ?? 'default'} />
                    <Typography sx={{ minWidth: 110, textAlign: 'right' }}>
                      {inv.currency} {Number(inv.grandTotal).toFixed(2)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Quick actions
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <Stack spacing={1.5}>
              {canCreateInvoice && (
                <Button component={Link} href="/invoices/new" variant="contained" fullWidth>
                  Create invoice
                </Button>
              )}
              <Button component={Link} href="/invoices" variant="outlined" fullWidth>
                View invoices
              </Button>
              {canCreateUser && (
                <Button component={Link} href="/users" variant="outlined" fullWidth>
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
