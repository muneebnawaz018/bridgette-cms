'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
import { ExportInvoicesModal } from '@/components/invoices/ExportInvoicesModal';
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { SendInvoiceSummary } from '@/components/invoices/SendInvoiceSummary';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone, invoiceStateLabel } from '@/components/ui/StatusChip';
import { invoiceTypeLabel } from '@/lib/format/labels';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiPost, apiDelete } from '@/lib/api/client';
import { monthStart, monthEnd } from '@/lib/format/date';
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
  billTo?: { name?: string; email?: string };
  /**
   * Where an email would actually go: the customer's current address, falling back to the
   * billing snapshot. Resolved server-side so the confirm dialog names the same address the
   * send will use — billTo.email is a snapshot and goes stale the moment a customer edits it.
   */
  sendTo?: string;
  /** Last time this invoice was emailed to the customer, if ever. */
  sent?: { at?: string; to?: string } | null;
}

type Action = { kind: 'archive' | 'delete'; row: InvoiceRow };

/** Which of the row actions this user may take on this particular invoice. */
function rowActions(
  row: InvoiceRow,
  perms: { canPay: boolean; canArchive: boolean; canDelete: boolean; canSend: boolean },
  onPay: (row: InvoiceRow) => void,
  onAct: (kind: 'archive' | 'delete', row: InvoiceRow) => void,
  onPdf: (row: InvoiceRow) => void,
  onCsv: (row: InvoiceRow) => void,
  onSend: (row: InvoiceRow) => void,
): RowAction[] {
  const actions: RowAction[] = [];
  const paid = row.state === 'paid' || row.state === 'draft';
  if (perms.canPay && !row.isArchived && !row.isDeleted && !paid) {
    actions.push({ label: 'Record payment', onClick: () => onPay(row) });
  }
  // A draft is not a real document yet, so no PDF; the CSV summary is fine for any row.
  if (!row.isDeleted && row.state !== 'draft') {
    actions.push({ label: 'Download PDF', onClick: () => onPdf(row) });
  }
  if (!row.isDeleted) {
    actions.push({ label: 'Download CSV', onClick: () => onCsv(row) });
  }
  /*
   * Same rule as the PDF, since sending is the PDF plus an envelope: a draft has no agreed
   * figures to put in front of a customer. The label says whether this would be the first time.
   */
  if (perms.canSend && !row.isDeleted && !row.isArchived && row.state !== 'draft') {
    actions.push({
      label: row.sent?.at ? 'Email to customer again' : 'Email to customer',
      onClick: () => onSend(row),
    });
  }
  if (perms.canArchive && !row.isArchived && !row.isDeleted) {
    actions.push({ label: 'Archive', danger: true, onClick: () => onAct('archive', row) });
  }
  return actions;
}

/** One-row CSV for a single invoice (summary columns), built + downloaded client-side. */
function downloadInvoiceCsv(row: InvoiceRow) {
  const paid = Number(row.grandTotal) - Number(row.balanceDue);
  const cell = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = ['Number', 'Type', 'State', 'Customer', 'Currency', 'Total', 'Paid', 'Balance'];
  const values = [
    row.number,
    row.type,
    row.state,
    row.billTo?.name ?? '',
    row.currency,
    Number(row.grandTotal ?? 0),
    paid,
    Number(row.balanceDue ?? 0),
  ];
  // Prepend a BOM so Excel/Sheets read UTF-8 correctly.
  const csv = `﻿${headers.map(cell).join(',')}\n${values.map(cell).join(',')}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${row.number}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  // Sending is a customer-facing act, so it rides on edit rather than plain view.
  const canSend = useCan(Permission.InvoiceEdit);

  const columnVisibility = useBreakpointColumns(INVOICE_COLUMN_TIERS);

  const { pageSize } = usePreferences();
  const [view, setView] = useState<InvoiceView>('active');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [type, setType] = useState<'' | InvoiceType>('');
  // Defaults to the whole current month (1st → last day, whatever its length). Clearing both
  // dates shows everything.
  const [range, setRange] = useState({ from: monthStart(), to: monthEnd() });
  const router = useRouter();
  const [exportOpen, setExportOpen] = useState(false);
  const [toSend, setToSend] = useState<InvoiceRow | null>(null);
  const [sending, setSending] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize,
  });

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
  const { data, isLoading, mutate } = useApi<{ items: InvoiceRow[]; total: number }>(
    `/api/invoices?${params.toString()}`,
  );
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  const typeOptions: { value: string; label: string }[] = [
    { value: '', label: 'All types' },
    { value: InvoiceType.Tax, label: invoiceTypeLabel(InvoiceType.Tax) },
    { value: InvoiceType.Cash, label: invoiceTypeLabel(InvoiceType.Cash) },
    { value: InvoiceType.PK, label: invoiceTypeLabel(InvoiceType.PK) },
  ];

  // Details modal (row click)

  // Record-payment dialog. The modal owns the form and the request; the page only says which
  // invoice is being paid.
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);

  // Archive / delete dialog (both need a reason)
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  // Invoices are only ever archived, never deleted, so the Deleted view is not offered.
  const views: InvoiceView[] = ['active', 'archived', 'all'];

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
      enqueueSnackbar(kind === 'archive' ? 'Invoice archived' : 'Invoice deleted', {
        variant: 'success',
      });
      setAction(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? `Could not ${kind} invoice`, { variant: 'error' });
    }
  }

  async function sendInvoice() {
    if (!toSend) return;
    setSending(true);
    const res = await apiPost<{ to?: string }>(`/api/invoices/${toSend._id}/send`, {});
    setSending(false);
    if (res.ok) {
      // The address the server actually used, not the one the row was showing.
      enqueueSnackbar(`Invoice emailed to ${res.data?.to ?? toSend.sendTo}`, {
        variant: 'success',
      });
      setToSend(null);
      // The row carries a "sent" stamp now, which changes its menu label.
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not send the invoice', { variant: 'error' });
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
    {
      field: 'type',
      headerName: 'Type',
      width: 110,
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_v, r) => invoiceTypeLabel(r.type),
    },
    {
      field: 'state',
      headerName: 'State',
      flex: 0.9,
      minWidth: 130,
      headerAlign: 'center',
      align: 'center',
      renderCell: (p) => (
        <StatusChip
          label={invoiceStateLabel(p.value)}
          tone={invoiceStateTone[p.value] ?? 'neutral'}
        />
      ),
    },
    {
      field: 'billTo',
      headerName: 'Bill to',
      flex: 1.4,
      minWidth: 150,
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_v, r) => r.billTo?.name ?? 'No customer',
    },
    {
      field: 'grandTotal',
      headerName: 'Total',
      flex: 1,
      minWidth: 120,
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_v, r) => formatMoney(r.currency, Number(r.grandTotal)),
    },
    {
      field: 'balanceDue',
      headerName: 'Balance',
      flex: 1,
      minWidth: 120,
      headerAlign: 'center',
      align: 'center',
      valueGetter: (_v, r) => formatMoney(r.currency, Number(r.balanceDue)),
    },
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
          actions={rowActions(
            p.row,
            { canPay, canArchive, canDelete, canSend },
            setPayFor,
            openAction,
            // A real generated PDF, not the browser's print dialog on a styled page — the same
            // file the customer receives by email.
            (row) => window.open(`/api/invoices/${row._id}/pdf`, '_blank'),
            downloadInvoiceCsv,
            setToSend,
          )}
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
            {/* Straight into an empty US Tax invoice — the type is chosen on the form now, from
                the heading itself, so asking for it before the form opens was a decision made
                twice and one screen too early. */}
            {canCreate && (
              <Button
                variant="contained"
                startIcon={<AddRounded />}
                onClick={() => router.push('/invoices/new')}
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
          onRowClick={(rowId) => router.push(`/invoices/${rowId}`)}
          columnVisibilityModel={columnVisibility}
        />
      </Paper>

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
        title={
          action?.kind === 'delete'
            ? `Delete ${action.row.number}?`
            : `Archive ${action?.row.number ?? ''}?`
        }
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

      {/* Sending is irreversible in the only way that matters: the customer has it. So it asks
          first, and names the address it will actually use rather than "the customer". */}
      <ConfirmDialog
        open={Boolean(toSend)}
        title={`Email ${toSend?.number ?? 'this invoice'}?`}
        // Wider than the default so the address is not broken across lines — a half-wrapped
        // email is the one thing on this dialog that has to be read carefully.
        maxWidth="sm"
        description={
          <SendInvoiceSummary
            customerName={toSend?.billTo?.name}
            sendTo={toSend?.sendTo}
            total={toSend?.grandTotal ?? 0}
            currency={toSend?.currency ?? 'USD'}
            alreadySent={Boolean(toSend?.sent?.at)}
          />
        }
        confirmLabel="Send"
        confirmDisabled={!toSend?.sendTo}
        loading={sending}
        onConfirm={sendInvoice}
        onClose={() => setToSend(null)}
      />
    </Box>
  );
}
