'use client';

import { useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import AddRounded from '@mui/icons-material/AddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { PaymentMethod } from '@/modules/invoicing/enums';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DataTable } from '@/components/ui/DataTable';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { apiPost } from '@/lib/api/client';

interface InvoiceRow {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  grandTotal: number;
  balanceDue: number;
  isArchived: boolean;
  billTo?: { name?: string };
}

export default function InvoicesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.InvoiceCreate);
  const canPay = useCan(Permission.PaymentRecord);

  const { data, isLoading, mutate } = useApi<{ items: InvoiceRow[] }>('/api/invoices?limit=50');
  const rows = data?.items ?? [];
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BankTransfer);
  const [saving, setSaving] = useState(false);

  function openPay(row: InvoiceRow) {
    setPayFor(row);
    setAmount(String(row.balanceDue ?? ''));
    setMethod(PaymentMethod.BankTransfer);
  }

  async function submitPayment() {
    if (!payFor) return;
    setSaving(true);
    const res = await apiPost(`/api/invoices/${payFor._id}/payments`, {
      amount: Number(amount),
      method,
    });
    setSaving(false);
    if (res.ok) {
      enqueueSnackbar('Payment recorded', { variant: 'success' });
      setPayFor(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Failed to record payment', { variant: 'error' });
    }
  }

  const columns: GridColDef<InvoiceRow>[] = [
    { field: 'number', headerName: 'Number', width: 150 },
    { field: 'type', headerName: 'Type', width: 80 },
    {
      field: 'state',
      headerName: 'State',
      width: 130,
      renderCell: (p) => <StatusChip label={p.value} tone={invoiceStateTone[p.value] ?? 'neutral'} />,
    },
    { field: 'billTo', headerName: 'Bill to', width: 160, valueGetter: (_v, r) => r.billTo?.name ?? '—' },
    { field: 'grandTotal', headerName: 'Total', width: 120, valueGetter: (_v, r) => `${r.currency} ${Number(r.grandTotal).toFixed(2)}` },
    { field: 'balanceDue', headerName: 'Balance', width: 120, valueGetter: (_v, r) => `${r.currency} ${Number(r.balanceDue).toFixed(2)}` },
    {
      field: 'actions',
      headerName: '',
      width: 130,
      sortable: false,
      renderCell: (p) =>
        canPay && !p.row.isArchived && p.row.state !== 'paid' && p.row.state !== 'draft' ? (
          <Button size="small" onClick={() => openPay(p.row)}>
            Record payment
          </Button>
        ) : null,
    },
  ];

  return (
    <Box className="rise-in">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Invoices</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25 }}>
            {rows.length} invoice{rows.length === 1 ? '' : 's'} · manage, track and record payments
          </Typography>
        </Box>
        {canCreate && (
          <Button component={Link} href="/invoices/new" variant="contained" startIcon={<AddRounded />}>
            New invoice
          </Button>
        )}
      </Box>

      <Paper sx={{ p: { xs: 1, md: 1.5 } }}>
        <DataTable rows={rows} columns={columns} getRowId={(r) => r._id} loading={isLoading} />
      </Paper>

      <Dialog open={Boolean(payFor)} onClose={() => setPayFor(null)} fullWidth maxWidth="xs">
        <DialogTitle>Record payment for {payFor?.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Balance due: {payFor?.currency} {Number(payFor?.balanceDue ?? 0).toFixed(2)}
            </Typography>
            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              disabled={saving}
            />
            <TextField
              select
              label="Method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              fullWidth
              disabled={saving}
            >
              {Object.values(PaymentMethod).map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayFor(null)} disabled={saving}>
            Cancel
          </Button>
          <SubmitButton variant="contained" loading={saving} onClick={submitPayment} disabled={!amount || Number(amount) <= 0}>
            Record
          </SubmitButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
