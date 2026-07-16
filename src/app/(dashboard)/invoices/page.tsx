'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import MuiLink from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import AddRounded from '@mui/icons-material/AddRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, PaymentMethod } from '@/modules/invoicing/enums';
import type { InvoiceView } from '@/modules/invoicing/schemas';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DataTable } from '@/components/ui/DataTable';
import { SearchBar } from '@/components/ui/SearchBar';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiPost, apiDelete } from '@/lib/api/client';

interface InvoiceRow {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  grandTotal: number;
  balanceDue: number;
  isArchived: boolean;
  isDeleted: boolean;
  billTo?: { name?: string };
}

type Action = { kind: 'archive' | 'delete'; row: InvoiceRow };

/** Per-row overflow menu. Owns its own anchor state so the page doesn't track it. */
function RowActions({
  row,
  canPay,
  canArchive,
  canDelete,
  onPay,
  onAct,
}: {
  row: InvoiceRow;
  canPay: boolean;
  canArchive: boolean;
  canDelete: boolean;
  onPay: (row: InvoiceRow) => void;
  onAct: (kind: 'archive' | 'delete', row: InvoiceRow) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const payable = canPay && !row.isArchived && !row.isDeleted && row.state !== 'paid' && row.state !== 'draft';
  const archivable = canArchive && !row.isArchived && !row.isDeleted;
  const deletable = canDelete && !row.isDeleted;
  if (!payable && !archivable && !deletable) return null;

  const close = () => setAnchor(null);
  return (
    <>
      <IconButton size="small" aria-label="Row actions" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {payable && (
          <MenuItem onClick={() => { close(); onPay(row); }}>Record payment</MenuItem>
        )}
        {archivable && (
          <MenuItem onClick={() => { close(); onAct('archive', row); }}>Archive</MenuItem>
        )}
        {deletable && (
          <MenuItem sx={{ color: 'error.main' }} onClick={() => { close(); onAct('delete', row); }}>
            Delete
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

const VIEW_META: Record<InvoiceView, { label: string; blurb: string }> = {
  active: { label: 'Active', blurb: 'manage, track and record payments' },
  archived: { label: 'Archived', blurb: 'hidden from the main list, kept for your records' },
  deleted: { label: 'Deleted', blurb: 'soft-deleted invoices, visible to admins only' },
};

export default function InvoicesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.InvoiceCreate);
  const canPay = useCan(Permission.PaymentRecord);
  const canArchive = useCan(Permission.InvoiceArchive);
  const canDelete = useCan(Permission.InvoiceDelete);
  const canSeeDeleted = useCan(Permission.InvoiceViewAllArchived);

  const { pageSize } = usePreferences();
  const [view, setView] = useState<InvoiceView>('active');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [type, setType] = useState<'' | InvoiceType>('');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize });

  // Back to the first page whenever a filter changes.
  useEffect(() => {
    setPaginationModel((m) => (m.page === 0 ? m : { ...m, page: 0 }));
  }, [search, type, view]);

  // Follow the app-wide "rows per page" preference chosen in Settings.
  useEffect(() => {
    setPaginationModel((m) => (m.pageSize === pageSize ? m : { page: 0, pageSize }));
  }, [pageSize]);

  const params = new URLSearchParams({
    page: String(paginationModel.page + 1),
    limit: String(paginationModel.pageSize),
    view,
  });
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  const { data, isLoading, mutate } = useApi<{ items: InvoiceRow[]; total: number }>(`/api/invoices?${params.toString()}`);
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  // Record-payment dialog
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [pay, setPay] = useState({ amount: '', method: PaymentMethod.BankTransfer });
  const [saving, setSaving] = useState(false);

  // Archive / delete dialog (both need a reason)
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const views: InvoiceView[] = ['active', 'archived', ...(canSeeDeleted ? (['deleted'] as const) : [])];

  function openPay(row: InvoiceRow) {
    setPayFor(row);
    setPay({ amount: String(row.balanceDue ?? ''), method: PaymentMethod.BankTransfer });
  }

  function openAction(kind: 'archive' | 'delete', row: InvoiceRow) {
    setAction({ kind, row });
    setReason('');
  }

  async function submitPayment() {
    if (!payFor) return;
    setSaving(true);
    const res = await apiPost(`/api/invoices/${payFor._id}/payments`, { amount: Number(pay.amount), method: pay.method });
    setSaving(false);
    if (res.ok) {
      enqueueSnackbar('Payment recorded', { variant: 'success' });
      setPayFor(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Failed to record payment', { variant: 'error' });
    }
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    const { kind, row } = action;
    const res =
      kind === 'archive'
        ? await apiPost(`/api/invoices/${row._id}/archive`, { reason })
        : await apiDelete(`/api/invoices/${row._id}`, { reason });
    setBusy(false);
    if (res.ok) {
      enqueueSnackbar(kind === 'archive' ? 'Invoice archived' : 'Invoice deleted', { variant: 'success' });
      setAction(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? `Could not ${kind} invoice`, { variant: 'error' });
    }
  }

  const columns: GridColDef<InvoiceRow>[] = [
    {
      field: 'number',
      headerName: 'Number',
      width: 160,
      renderCell: (p) => (
        <MuiLink component={Link} href={`/invoices/${p.row._id}`} sx={{ fontWeight: 600, color: 'primary.main' }} underline="hover">
          {p.value}
        </MuiLink>
      ),
    },
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
      width: 70,
      sortable: false,
      align: 'center',
      renderCell: (p) => (
        <RowActions
          row={p.row}
          canPay={canPay}
          canArchive={canArchive}
          canDelete={canDelete}
          onPay={openPay}
          onAct={openAction}
        />
      ),
    },
  ];

  return (
    <Box className="rise-in">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
          {rowCount} invoice{rowCount === 1 ? '' : 's'} · {VIEW_META[view].blurb}
        </Typography>
        {canCreate && (
          <Button component={Link} href="/invoices/new" variant="contained" startIcon={<AddRounded />}>
            New invoice
          </Button>
        )}
      </Box>

      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <Box sx={{ overflowX: 'auto', pb: 0.5, mx: -0.5, px: 0.5 }}>
          <ToggleButtonGroup value={view} exclusive size="small" onChange={(_e, v) => v && setView(v as InvoiceView)}>
            {views.map((v) => (
              <ToggleButton key={v} value={v} sx={{ px: 2, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {VIEW_META[v].label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by number or customer"
          filter={{
            label: 'All types',
            value: type,
            onChange: (v) => setType(v as '' | InvoiceType),
            options: [
              { value: '', label: 'All types' },
              { value: InvoiceType.Tax, label: 'Tax' },
              { value: InvoiceType.Cash, label: 'Cash' },
              { value: InvoiceType.PK, label: 'PK' },
            ],
          }}
        />
      </Stack>

      <Paper sx={{ p: { xs: 1, md: 1.5 } }}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r._id}
          loading={isLoading}
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
        />
      </Paper>

      {/* Record payment */}
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
              value={pay.amount}
              onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))}
              fullWidth
              disabled={saving}
            />
            <TextField
              select
              label="Method"
              value={pay.method}
              onChange={(e) => setPay((p) => ({ ...p, method: e.target.value as PaymentMethod }))}
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
          <SubmitButton variant="contained" loading={saving} onClick={submitPayment} disabled={!pay.amount || Number(pay.amount) <= 0}>
            Record
          </SubmitButton>
        </DialogActions>
      </Dialog>

      {/* Archive / delete, both require a reason */}
      <ConfirmDialog
        open={Boolean(action)}
        title={action?.kind === 'delete' ? `Delete ${action.row.number}?` : `Archive ${action?.row.number ?? ''}?`}
        description={
          action?.kind === 'delete'
            ? 'Deleted invoices are hidden from everyone and stay visible to admins only, under the Deleted view. They are never removed from the database.'
            : 'Archived invoices leave the main list but stay available to admins and the creator under the Archived view.'
        }
        confirmLabel={action?.kind === 'delete' ? 'Delete' : 'Archive'}
        confirmColor={action?.kind === 'delete' ? 'error' : 'primary'}
        confirmDisabled={!reason.trim()}
        loading={busy}
        onConfirm={runAction}
        onClose={() => setAction(null)}
      >
        <TextField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          multiline
          minRows={2}
          disabled={busy}
          autoFocus
        />
      </ConfirmDialog>
    </Box>
  );
}
