'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid2';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import { useSnackbar } from 'notistack';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import { Permission } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';
import { apiPost } from '@/lib/api/client';

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
}

const emptyLine: Line = { description: '', quantity: 1, unitPrice: 0 };

export default function NewInvoicePage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.InvoiceCreate);

  const [type, setType] = useState<InvoiceType>(InvoiceType.Tax);
  const [billName, setBillName] = useState('');
  const [billEmail, setBillEmail] = useState('');
  const [items, setItems] = useState<Line[]>([{ ...emptyLine }]);
  const [taxRate, setTaxRate] = useState(8.75);
  const [applyTax, setApplyTax] = useState(false);
  const [loading, setLoading] = useState(false);

  const taxPolicy = TAX_POLICY[type];
  const taxable = taxPolicy === 'always' || (taxPolicy === 'optional' && applyTax);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.unitPrice, 0),
    [items],
  );
  const estTax = taxable ? subtotal * (taxRate / 100) : 0;
  const total = subtotal + estTax;

  function setLine(i: number, patch: Partial<Line>) {
    setItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit(asDraft: boolean) {
    setLoading(true);
    const res = await apiPost('/api/invoices', {
      type,
      billTo: { name: billName, email: billEmail || undefined },
      items: items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })),
      taxRate: taxable ? taxRate / 100 : undefined,
      applyTax: taxPolicy === 'optional' ? applyTax : undefined,
      asDraft,
    });
    setLoading(false);
    if (res.ok) {
      enqueueSnackbar(asDraft ? 'Draft saved' : 'Invoice created', { variant: 'success' });
      router.push('/invoices');
    } else {
      enqueueSnackbar(res.error ?? 'Failed to create invoice', { variant: 'error' });
    }
  }

  if (!canCreate) {
    return <Alert severity="error">You do not have permission to create invoices.</Alert>;
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 820 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        New invoice
      </Typography>
      <Stack spacing={2}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              select
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value as InvoiceType)}
              fullWidth
            >
              <MenuItem value={InvoiceType.Tax}>Tax (US, taxed)</MenuItem>
              <MenuItem value={InvoiceType.Cash}>Cash (US, no tax)</MenuItem>
              <MenuItem value={InvoiceType.PK}>PK (Pakistan)</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Bill to — name" value={billName} onChange={(e) => setBillName(e.target.value)} fullWidth required />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField label="Bill to — email" value={billEmail} onChange={(e) => setBillEmail(e.target.value)} fullWidth />
          </Grid>
        </Grid>

        <Divider />
        <Typography variant="subtitle2">Line items</Typography>
        {items.map((line, i) => (
          <Grid container spacing={1} key={i} alignItems="center">
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Description" value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} fullWidth />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <TextField label="Qty" type="number" value={line.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} fullWidth />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <TextField label="Unit price" type="number" value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} fullWidth />
            </Grid>
            <Grid size={{ xs: 2, sm: 1 }}>
              <IconButton
                aria-label="remove line"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={items.length === 1}
              >
                ✕
              </IconButton>
            </Grid>
          </Grid>
        ))}
        <Button onClick={() => setItems((prev) => [...prev, { ...emptyLine }])} size="small">
          + Add line
        </Button>

        <Divider />
        <Grid container spacing={2} alignItems="center">
          {taxPolicy === 'optional' && (
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                select
                label="Apply tax"
                value={applyTax ? 'yes' : 'no'}
                onChange={(e) => setApplyTax(e.target.value === 'yes')}
                fullWidth
              >
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="yes">Yes</MenuItem>
              </TextField>
            </Grid>
          )}
          {taxable && (
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField label="Tax rate %" type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} fullWidth />
            </Grid>
          )}
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="body2" color="text.secondary" align="right">
              Subtotal {subtotal.toFixed(2)} · Tax {estTax.toFixed(2)} · <strong>Total {total.toFixed(2)}</strong>
            </Typography>
          </Grid>
        </Grid>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button onClick={() => submit(true)} disabled={loading}>
            Save as draft
          </Button>
          <Button variant="contained" onClick={() => submit(false)} disabled={loading}>
            {loading ? 'Creating…' : 'Create invoice'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}
