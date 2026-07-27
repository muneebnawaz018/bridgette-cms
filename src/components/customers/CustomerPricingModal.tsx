'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SellRounded from '@mui/icons-material/SellRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { SearchBar } from '@/components/ui/SearchBar';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiDelete } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';

/*
 * Customer-side pricing: every active product with THIS customer's negotiated rate (or the
 * default). Admin edits a per-product override inline — Set upserts, Clear reverts to default.
 * Same ProductRate data as the product-side editor, from the customer's angle.
 */

interface RateRow {
  productId: string;
  productName: string;
  sku: string;
  unit?: string;
  defaultRate: number;
  rate: number | null;
}

export function CustomerPricingModal({
  customerId,
  customerName,
  onClose,
}: {
  /** null → closed. */
  customerId: string | null;
  customerName: string;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const open = Boolean(customerId);
  const { data, isLoading, mutate } = useApi<{ items: RateRow[] }>(
    customerId ? `/api/customers/${customerId}/rates` : null,
  );
  const rows = data?.items ?? [];

  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Draft override values keyed by product, seeded from the fetched rates.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setDrafts(
      Object.fromEntries(
        (data.items ?? []).map((r) => [r.productId, r.rate != null ? String(r.rate) : '']),
      ),
    );
  }, [data]);

  const filtered = search.trim()
    ? rows.filter((r) =>
        `${r.productName} ${r.sku}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : rows;

  async function set(productId: string) {
    const value = Number(drafts[productId]);
    if (!Number.isFinite(value) || value < 0) {
      enqueueSnackbar('Enter a valid rate', { variant: 'warning' });
      return;
    }
    setBusyId(productId);
    const res = await apiPost(`/api/customers/${customerId}/rates`, { productId, rate: value });
    setBusyId(null);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not save rate', { variant: 'error' });
      return;
    }
    void mutate();
  }

  async function clear(productId: string) {
    setBusyId(productId);
    const res = await apiDelete(`/api/customers/${customerId}/rates?productId=${productId}`);
    setBusyId(null);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not clear rate', { variant: 'error' });
      return;
    }
    void mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pricing — ${customerName}`}
      description="Set what this customer pays per product. Blank rows fall back to the default rate."
      icon={<SellRounded />}
      maxWidth="sm"
      actions={
        <Button onClick={onClose} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
          Close
        </Button>
      }
    >
      <Box sx={{ mb: 2 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search products" />
      </Box>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading…
        </Typography>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
          {rows.length === 0 ? 'No products in the catalogue yet.' : 'No products match.'}
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((r) => {
            const negotiated = r.rate != null;
            const busy = busyId === r.productId;
            return (
              <Box key={r.productId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography sx={{ fontWeight: 600 }} noWrap>
                      {r.productName}
                    </Typography>
                    {negotiated && (
                      <Chip size="small" color="primary" variant="outlined" label="Negotiated" />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {r.sku ? `${r.sku} · ` : ''}default {formatMoney('USD', r.defaultRate)}
                    {r.unit ? ` / ${r.unit}` : ''}
                  </Typography>
                </Box>
                <TextField
                  label="Rate"
                  size="small"
                  type="number"
                  value={drafts[r.productId] ?? ''}
                  placeholder={String(r.defaultRate)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.productId]: e.target.value }))}
                  disabled={busy}
                  sx={{ width: 110, flexShrink: 0 }}
                  slotProps={{ htmlInput: { inputMode: 'decimal', min: 0 } }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  disabled={busy || drafts[r.productId] === '' || drafts[r.productId] == null}
                  onClick={() => set(r.productId)}
                  sx={{ flexShrink: 0 }}
                >
                  Set
                </Button>
                <Button
                  size="small"
                  color="inherit"
                  disabled={busy || !negotiated}
                  onClick={() => clear(r.productId)}
                  sx={{ flexShrink: 0 }}
                >
                  Clear
                </Button>
              </Box>
            );
          })}
        </Stack>
      )}
    </Modal>
  );
}
