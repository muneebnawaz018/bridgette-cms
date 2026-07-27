'use client';

import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiDelete } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';

/*
 * Product-side pricing: the negotiated rates set for one product, listed by customer, with an
 * add row (customer + rate) and per-row clear. Mutations hit /api/products/:id/rates and
 * revalidate immediately, so this is self-contained — the parent dialog's Save is unrelated.
 */

interface RateRow {
  customerId: string;
  customerName: string;
  customerEmail?: string;
  rate: number;
}
interface CustomerOption {
  _id: string;
  name: string;
  email?: string;
}

export function ProductRatesEditor({
  productId,
  defaultRate,
}: {
  productId: string;
  defaultRate: number;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, mutate } = useApi<{ items: RateRow[] }>(
    `/api/products/${productId}/rates`,
  );
  const { data: customerData } = useApi<{ items: CustomerOption[] }>('/api/customers/options');
  const rows = useMemo(() => data?.items ?? [], [data]);
  const customers = useMemo(() => customerData?.items ?? [], [customerData]);

  const [picked, setPicked] = useState<CustomerOption | null>(null);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);

  // Customers without an override yet — the rest are already in the table. Stable ref for the
  // Autocomplete options.
  const available = useMemo(() => {
    const taken = new Set(rows.map((r) => r.customerId));
    return customers.filter((c) => !taken.has(c._id));
  }, [customers, rows]);

  async function add() {
    if (!picked) return;
    const value = Number(rate);
    if (!Number.isFinite(value) || value < 0) {
      enqueueSnackbar('Enter a valid rate', { variant: 'warning' });
      return;
    }
    setBusy(true);
    const res = await apiPost(`/api/products/${productId}/rates`, {
      customerId: picked._id,
      rate: value,
    });
    setBusy(false);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not save rate', { variant: 'error' });
      return;
    }
    setPicked(null);
    setRate('');
    void mutate();
  }

  async function remove(customerId: string) {
    setBusy(true);
    const res = await apiDelete(`/api/products/${productId}/rates?customerId=${customerId}`);
    setBusy(false);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not clear rate', { variant: 'error' });
      return;
    }
    void mutate();
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Set a negotiated rate for specific customers. Anyone not listed pays the default rate (
        {formatMoney('USD', defaultRate)}).
      </Typography>

      <Stack spacing={1} sx={{ mb: 1.5 }}>
        {isLoading ? (
          <Typography variant="body2" color="text.secondary">
            Loading…
          </Typography>
        ) : rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            No negotiated rates yet — everyone pays the default.
          </Typography>
        ) : (
          rows.map((r) => (
            <Box
              key={r.customerId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>
                  {r.customerName}
                </Typography>
                {r.customerEmail && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {r.customerEmail}
                  </Typography>
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                <Typography className="tnum" sx={{ fontWeight: 600 }}>
                  {formatMoney('USD', r.rate)}
                </Typography>
                <IconButton
                  size="small"
                  aria-label={`Clear ${r.customerName}'s rate`}
                  disabled={busy}
                  onClick={() => remove(r.customerId)}
                >
                  <DeleteOutlineRounded fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          ))
        )}
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems="flex-start">
        <Autocomplete
          sx={{ flexGrow: 1, width: '100%' }}
          options={available}
          value={picked}
          getOptionLabel={(o) => (o.email ? `${o.name} · ${o.email}` : o.name)}
          isOptionEqualToValue={(o, v) => o._id === v._id}
          disabled={busy}
          onChange={(_e, v) => setPicked(v)}
          renderInput={(params) => <TextField {...params} label="Customer" size="small" />}
        />
        <TextField
          label="Rate (USD)"
          size="small"
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          disabled={busy}
          sx={{ width: { xs: '100%', sm: 140 } }}
          slotProps={{ htmlInput: { inputMode: 'decimal', min: 0 } }}
        />
        <Button
          variant="outlined"
          startIcon={<AddRounded />}
          disabled={busy || !picked || rate === ''}
          onClick={add}
          sx={{ width: { xs: '100%', sm: 'auto' }, flexShrink: 0 }}
        >
          Set
        </Button>
      </Stack>
    </Box>
  );
}
