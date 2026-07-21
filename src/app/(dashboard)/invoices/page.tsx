'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import AddRounded from '@mui/icons-material/AddRounded';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType } from '@/modules/invoicing/enums';
import type { InvoiceView } from '@/modules/invoicing/schemas';
import { useCan } from '@/components/auth/SessionProvider';
import { DataTable } from '@/components/ui/DataTable';
import { useBreakpointColumns, type ColumnTiers } from '@/lib/ui/useBreakpointColumns';
import { SearchBar } from '@/components/ui/SearchBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { NoAccess } from '@/components/ui/NoAccess';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { InvoiceDetailsModal } from '@/components/invoices/InvoiceDetailsModal';
import { ExportInvoicesModal } from '@/components/invoices/ExportInvoicesModal';
import { InvoiceFormDialog } from '@/components/invoices/InvoiceFormDialog';
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiPost, apiDelete } from '@/lib/api/client';
import { today, daysAgo } from '@/lib/format/date';
import { formatMoney } from '@/lib/format/money';

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

/** Which of the row actions this user may take on this particular invoice. */
function rowActions(
  row: InvoiceRow,
  perms: { canPay: boolean; canArchive: boolean; canDelete: boolean },
  onPay: (row: InvoiceRow) => void,
  onAct: (kind: 'archive' | 'delete', row: InvoiceRow) => void,
): RowAction[] {
  const actions: RowAction[] = [];
  const paid = row.state === 'paid' || row.state === 'draft';
  if (perms.canPay && !row.isArchived && !row.isDeleted && !paid) {
    actions.push({ label: 'Record payment', onClick: () => onPay(row) });
  }
  if (perms.canArchive && !row.isArchived && !row.isDeleted) {
    actions.push({ label: 'Archive', onClick: () => onAct('archive', row) });
  }
  if (perms.canDelete && !row.isDeleted) {
    actions.push({ label: 'Delete', danger: true, onClick: () => onAct('delete', row) });
  }
  return actions;
}

const VIEW_META: Record<InvoiceView, { label: string; blurb: string }> = {
  active: { label: 'Active', blurb: 'manage, track and record payments' },
  archived: { label: 'Archived', blurb: 'hidden from the main list, kept for your records' },
  deleted: { label: 'Deleted', blurb: 'soft-deleted invoices, visible to admins only' },
  all: { label: 'All', blurb: 'every invoice you can access' },
};

// Number + state + total + actions are the columns worth keeping when space runs out; the
// rest peel off as the grid narrows. Module-level so the hook's memo identity holds.
const INVOICE_COLUMN_TIERS: ColumnTiers = {
  lg: ['type', 'billTo'],
  md: ['balanceDue'],
  sm: ['status'],
};

export default function InvoicesPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canView = useCan(Permission.InvoiceView);
  const canCreate = useCan(Permission.InvoiceCreate);
  const canPay = useCan(Permission.PaymentRecord);
  const canArchive = useCan(Permission.InvoiceArchive);
  const canDelete = useCan(Permission.InvoiceDelete);
  const canSeeDeleted = useCan(Permission.InvoiceViewAllArchived);

  const columnVisibility = useBreakpointColumns(INVOICE_COLUMN_TIERS);

  const { pageSize } = usePreferences();
  const [view, setView] = useState<InvoiceView>('active');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [type, setType] = useState<'' | InvoiceType>('');
  // Defaults to the last 7 days, per the agreed filter. Clearing both dates shows everything.
  const [range, setRange] = useState({ from: daysAgo(7), to: today() });
  const [exportOpen, setExportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize });

  // Preselect the type filter from ?type=tax|cash|pk (e.g. clicked from a dashboard card).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    if (t === InvoiceType.Tax || t === InvoiceType.Cash || t === InvoiceType.PK) setType(t);
  }, []);

  // Back to the first page whenever a filter changes.
  useEffect(() => {
    setPaginationModel((m) => (m.page === 0 ? m : { ...m, page: 0 }));
  }, [search, type, view, range.from, range.to]);

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
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const { data, isLoading, mutate } = useApi<{ items: InvoiceRow[]; total: number }>(`/api/invoices?${params.toString()}`);
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  const typeOptions: { value: string; label: string }[] = [
    { value: '', label: 'All types' },
    { value: InvoiceType.Tax, label: 'Tax' },
    { value: InvoiceType.Cash, label: 'Cash' },
    { value: InvoiceType.PK, label: 'PK' },
  ];

  // Details modal (row click)
  const [detailId, setDetailId] = useState<string | null>(null);

  // Record-payment dialog. The modal owns the form and the request; the page only says which
  // invoice is being paid.
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);

  // Archive / delete dialog (both need a reason)
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const views: InvoiceView[] = ['active', 'archived', ...(canSeeDeleted ? (['deleted'] as const) : []), 'all'];

  function openAction(kind: 'archive' | 'delete', row: InvoiceRow) {
    setAction({ kind, row });
    setReason('');
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
      headerAlign: 'center',
      align: 'center',
      renderCell: (p) => (
        <Typography component="span" sx={{ fontWeight: 700, color: 'primary.main' }}>
          {p.value}
        </Typography>
      ),
    },
    { field: 'type', headerName: 'Type', width: 90, headerAlign: 'center', align: 'center' },
    {
      field: 'state',
      headerName: 'State',
      flex: 0.9,
      minWidth: 130,
      headerAlign: 'center',
      align: 'center',
      renderCell: (p) => <StatusChip label={p.value} tone={invoiceStateTone[p.value] ?? 'neutral'} />,
    },
    { field: 'billTo', headerName: 'Bill to', flex: 1.4, minWidth: 150, headerAlign: 'center', align: 'center', valueGetter: (_v, r) => r.billTo?.name ?? 'No customer' },
    { field: 'grandTotal', headerName: 'Total', flex: 1, minWidth: 120, headerAlign: 'center', align: 'center', valueGetter: (_v, r) => formatMoney(r.currency, Number(r.grandTotal)) },
    { field: 'balanceDue', headerName: 'Balance', flex: 1, minWidth: 120, headerAlign: 'center', align: 'center', valueGetter: (_v, r) => formatMoney(r.currency, Number(r.balanceDue)) },
    {
      field: 'status',
      headerName: 'Status',
      flex: 0.9,
      minWidth: 120,
      headerAlign: 'center',
      align: 'center',
      sortable: false,
      renderCell: (p) => {
        const label = p.row.isDeleted ? 'Deleted' : p.row.isArchived ? 'Archived' : 'Active';
        const tone = p.row.isDeleted ? 'error' : p.row.isArchived ? 'warning' : 'success';
        return <StatusChip label={label} tone={tone} />;
      },
    },
    {
      field: 'actions',
      headerName: '',
      width: 64,
      sortable: false,
      headerAlign: 'center',
      align: 'center',
      renderCell: (p) => (
        <RowActionsMenu
          actions={rowActions(p.row, { canPay, canArchive, canDelete }, setPayFor, openAction)}
        />
      ),
    },
  ];

  if (!canView) {
    return <NoAccess message="You do not have permission to view invoices." />;
  }

  return (
    <Box className="rise-in">
      <PageHeader
        title={`${VIEW_META[view].label} invoices`}
        subtitle={`${rowCount} invoice${rowCount === 1 ? '' : 's'} · ${VIEW_META[view].blurb}`}
        actions={
          <>
            <Button
              variant="outlined"
              startIcon={<FileDownloadRounded />}
              onClick={() => setExportOpen(true)}
            >
              Export
            </Button>
            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                onClick={() => setCreateOpen(true)}
              >
                New invoice
              </Button>
            )}
          </>
        }
      />

      {/* Search + two fused filter dropdowns (type + view), same pattern as user management */}
      <Box sx={{ mb: 2 }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by number or customer"
          dateRange={{ from: range.from, to: range.to, onChange: setRange }}
          filters={[
            {
              label: 'All types',
              value: type,
              onChange: (v) => setType(v as '' | InvoiceType),
              options: typeOptions,
            },
            {
              label: VIEW_META.active.label,
              value: view,
              onChange: (v) => setView(v as InvoiceView),
              options: views.map((v) => ({ value: v, label: VIEW_META[v].label })),
            },
          ]}
        />
      </Box>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r._id}
          loading={isLoading}
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          onRowClick={setDetailId}
          columnVisibilityModel={columnVisibility}
        />
      </Paper>

      <InvoiceDetailsModal id={detailId} onClose={() => setDetailId(null)} />

      <InvoiceFormDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => void mutate()}
      />

      <ExportInvoicesModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        view={view}
        type={type}
        search={search}
      />

      <RecordPaymentModal
        invoice={payFor}
        onClose={() => setPayFor(null)}
        onRecorded={() => void mutate()}
      />

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
