'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import AddRounded from '@mui/icons-material/AddRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, PaymentMethod } from '@/modules/invoicing/enums';
import type { InvoiceView } from '@/modules/invoicing/schemas';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DataTable } from '@/components/ui/DataTable';
import { SearchBar } from '@/components/ui/SearchBar';
import { Modal } from '@/components/ui/Modal';
import { InvoiceDetailsModal } from '@/components/invoices/InvoiceDetailsModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiPost, apiDelete } from '@/lib/api/client';
import { redA } from '@/lib/colors';

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

  // Per-type counts for the filter cells (active invoices, role-scoped).
  const { data: stats } = useApi<{ total: number; byType: Record<string, { count: number }> }>('/api/dashboard/stats');
  const typeCells: { value: '' | InvoiceType; label: string; count?: number }[] = [
    { value: '', label: 'All invoices', count: stats?.total },
    { value: InvoiceType.Tax, label: 'Tax', count: stats?.byType?.tax?.count },
    { value: InvoiceType.Cash, label: 'Cash', count: stats?.byType?.cash?.count },
    { value: InvoiceType.PK, label: 'PK', count: stats?.byType?.pk?.count },
  ];

  // Details modal (row click)
  const [detailId, setDetailId] = useState<string | null>(null);

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
      flex: 1.1,
      minWidth: 140,
      renderCell: (p) => (
        <Typography component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
          {p.value}
        </Typography>
      ),
    },
    { field: 'type', headerName: 'Type', width: 90 },
    {
      field: 'state',
      headerName: 'State',
      flex: 0.9,
      minWidth: 130,
      renderCell: (p) => <StatusChip label={p.value} tone={invoiceStateTone[p.value] ?? 'neutral'} />,
    },
    { field: 'billTo', headerName: 'Bill to', flex: 1.4, minWidth: 150, valueGetter: (_v, r) => r.billTo?.name ?? 'No customer' },
    { field: 'grandTotal', headerName: 'Total', flex: 1, minWidth: 120, valueGetter: (_v, r) => `${r.currency} ${Number(r.grandTotal).toFixed(2)}` },
    { field: 'balanceDue', headerName: 'Balance', flex: 1, minWidth: 120, valueGetter: (_v, r) => `${r.currency} ${Number(r.balanceDue).toFixed(2)}` },
    {
      field: 'actions',
      headerName: '',
      width: 64,
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

      {/* Type filter cells — one per invoice type plus an "All invoices" cell */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        {typeCells.map((c) => {
          const active = type === c.value;
          return (
            <Grid key={c.label} size={{ xs: 6, sm: 3 }}>
              <ButtonBase
                onClick={() => setType(c.value)}
                sx={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  p: 1.75,
                  borderRadius: 2.5,
                  border: '1px solid',
                  borderColor: active ? 'primary.main' : 'divider',
                  bgcolor: active ? redA(0.06) : 'background.paper',
                  transition: 'border-color .16s ease, background-color .16s ease',
                  '&:hover': { borderColor: 'primary.main', bgcolor: active ? redA(0.08) : 'action.hover' },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: active ? 'primary.main' : 'text.secondary', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }} noWrap>
                    {c.label}
                  </Typography>
                  <Typography sx={{ fontWeight: 800, fontSize: '1.4rem', lineHeight: 1.1, color: active ? 'primary.main' : 'text.primary' }}>
                    {c.count ?? '—'}
                  </Typography>
                </Box>
              </ButtonBase>
            </Grid>
          );
        })}
      </Grid>

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
        <SearchBar value={searchInput} onChange={setSearchInput} placeholder="Search by number or customer" />
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
          onRowClick={setDetailId}
        />
      </Paper>

      <InvoiceDetailsModal id={detailId} onClose={() => setDetailId(null)} />

      {/* Record payment */}
      <Modal
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        title={`Record payment for ${payFor?.number ?? ''}`}
        icon={<PaymentsRounded />}
        maxWidth="xs"
        busy={saving}
        actions={
          <>
            <Button onClick={() => setPayFor(null)} disabled={saving} color="inherit">
              Cancel
            </Button>
            <SubmitButton variant="contained" loading={saving} onClick={submitPayment} disabled={!pay.amount || Number(pay.amount) <= 0}>
              Record
            </SubmitButton>
          </>
        }
      >
        <Stack spacing={2}>
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
            autoFocus
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
      </Modal>

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
