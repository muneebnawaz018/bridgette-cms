'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import AddRounded from '@mui/icons-material/AddRounded';
import PersonAddAlt1Rounded from '@mui/icons-material/PersonAddAlt1Rounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';
import { DataTable } from '@/components/ui/DataTable';
import { useBreakpointColumns, type ColumnTiers } from '@/lib/ui/useBreakpointColumns';
import { SearchBar } from '@/components/ui/SearchBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { NoAccess } from '@/components/ui/NoAccess';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  CustomerFormDialog,
  type EditableCustomer,
} from '@/components/customers/CustomerFormDialog';
import { IntakeLinkDialog } from '@/components/customers/IntakeLinkDialog';
import type { FormMode } from '@/components/ui/Modal';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete } from '@/lib/api/client';
import type { AddressParts } from '@/modules/customers/address';

interface CustomerRow {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  addressParts?: AddressParts | null;
  email?: string;
  phone?: string;
  address?: string;
  reseller?: boolean;
  /** Free-text team names. Edited in the dialog, which opens from a row. */
  teams?: string[];
  /** Product ids this customer buys — the edit form prefills its picker from these. */
  products?: string[];
  /** True when this customer has sent details that nobody has reviewed yet. */
  /** Delivery details, when they differ from billing. */
  shipping?: {
    sameAsBilling?: boolean;
    name?: string;
    phone?: string;
    address?: string;
    addressParts?: AddressParts | null;
  } | null;
  createdAt: string;
}

/*
 * Name + actions always survive. Widths below are floors, not targets — `flex` governs on a
 * roomy screen — so they are set to what actually fits the narrowest viewport each tier has to
 * serve: 568px at 900 (the rail costs 268 from 768 up), 436 at 768, 288 at 320.
 */
const CUSTOMER_COLUMN_TIERS: ColumnTiers = {
  // The address is reference data, not scanning data: first to go.
  lg: ['location'],
  md: ['reseller'],
  sm: ['email'],
};

export default function CustomersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canView = useCan(Permission.CustomerView);
  const canCreate = useCan(Permission.CustomerCreate);
  const canEdit = useCan(Permission.CustomerEdit);
  const canDelete = useCan(Permission.CustomerDelete);

  const columnVisibility = useBreakpointColumns(CUSTOMER_COLUMN_TIERS);

  const { pageSize } = usePreferences();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize,
  });

  useEffect(() => {
    setPaginationModel((m) => (m.page === 0 ? m : { ...m, page: 0 }));
  }, [search]);

  useEffect(() => {
    setPaginationModel((m) => (m.pageSize === pageSize ? m : { page: 0, pageSize }));
  }, [pageSize]);

  // One dialog handles create and edit; null = create.
  const [formOpen, setFormOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState<EditableCustomer | null>(null);
  // Rows open read-only. Editing is reached from the pencil inside, or from the row menu.
  const [formMode, setFormMode] = useState<FormMode>('edit');
  /*
   * The invitation dialog. It carries no customer: a link creates a record, it never edits one,
   * so a customer already on file is never sent one and nothing they could submit can reach a
   * record staff typed in.
   */
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toDelete, setToDelete] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Anything covering the list. Declared before the fetch, which reads it. */
  const dialogOpen = formOpen || inviteOpen || Boolean(toDelete);

  const params = new URLSearchParams({
    page: String(paginationModel.page + 1),
    limit: String(paginationModel.pageSize),
  });
  if (search) params.set('search', search);
  const { data, isLoading, mutate } = useApi<{ items: CustomerRow[]; total: number }>(
    `/api/customers?${params.toString()}`,
    {
      /*
       * Nothing behind an open dialog can be read or acted on, and every dialog that changes the
       * list already refreshes it on save. Leaving focus revalidation on meant clicking between
       * the dialog and DevTools — or opening WhatsApp from the invite dialog and coming back —
       * refetched the whole list for a view nobody is looking at.
       */
      revalidateOnFocus: !dialogOpen,
    },
  );
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  const openCreate = useCallback(() => {
    setFormCustomer(null);
    setFormMode('edit');
    setFormOpen(true);
  }, []);

  const openView = useCallback((row: CustomerRow) => {
    setFormCustomer(row);
    setFormMode('view');
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: CustomerRow) => {
    setFormCustomer(row);
    setFormMode('edit');
    setFormOpen(true);
  }, []);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await apiDelete(`/api/customers/${toDelete._id}`);
    setDeleting(false);
    if (res.ok) {
      enqueueSnackbar('Customer deleted', { variant: 'success' });
      setToDelete(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not delete customer', { variant: 'error' });
    }
  }

  const columns: GridColDef<CustomerRow>[] = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Name',
        flex: 1.3,
        minWidth: 130,
        renderCell: (p) => (
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {p.row.name}
          </Box>
        ),
      },
      {
        field: 'email',
        headerName: 'Email',
        flex: 1.6,
        minWidth: 180,
        valueGetter: (_v, r) => r.email || '—',
      },
      {
        // Where they are, not how to call them: the state is what drives sales tax, so it earns
        // the column ahead of a phone number nobody scans a list for.
        field: 'location',
        headerName: 'Location',
        flex: 1.1,
        minWidth: 140,
        sortable: false,
        valueGetter: (_v, r) => {
          const a = r.addressParts;
          const region = [a?.state, a?.country === 'PK' ? 'PK' : null].filter(Boolean).join(' · ');
          return [a?.city, region].filter(Boolean).join(', ') || '—';
        },
      },
      {
        // Tax exemption deserves its own column rather than a suffix on another one.
        field: 'reseller',
        headerName: 'Reseller',
        flex: 0.6,
        minWidth: 90,
        valueGetter: (_v, r) => (r.reseller ? 'Yes' : 'No'),
      },
      {
        field: 'actions',
        headerName: '',
        width: 56,
        sortable: false,
        renderCell: (p) => {
          const actions: RowAction[] = [];
          actions.push({ label: 'View', onClick: () => openView(p.row) });
          if (canEdit) actions.push({ label: 'Edit', onClick: () => openEdit(p.row) });
          if (canDelete)
            actions.push({ label: 'Delete', danger: true, onClick: () => setToDelete(p.row) });
          if (actions.length === 0) return null;
          return <RowActionsMenu ariaLabel="Customer actions" actions={actions} />;
        },
      },
    ],
    [canEdit, canDelete, openEdit, openView],
  );

  if (!canView) {
    return <NoAccess message="You do not have permission to view customers." />;
  }

  return (
    <Box className="rise-in">
      <PageHeader
        title="Customers"
        subtitle={`${rowCount} ${rowCount === 1 ? 'customer' : 'customers'} · reusable billing parties`}
        actions={
          canCreate && (
            <>
              {/* Outlined, so "New customer" stays the primary action for staff who already
                  have the details in front of them. */}
              <Button
                variant="outlined"
                onClick={() => setInviteOpen(true)}
                startIcon={<PersonAddAlt1Rounded />}
              >
                Invite customer
              </Button>
              <Button variant="contained" onClick={openCreate} startIcon={<AddRounded />}>
                New customer
              </Button>
            </>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name or email"
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
          onRowClick={(id) => openView(rows.find((r) => r._id === id)!)}
          columnVisibilityModel={columnVisibility}
        />
      </Paper>

      <CustomerFormDialog
        open={formOpen}
        customer={formCustomer}
        initialMode={formMode}
        canEdit={canEdit}
        onClose={() => setFormOpen(false)}
        onSaved={() => void mutate()}
      />

      {/* An invitation, which creates nothing until somebody fills it in. */}
      <IntakeLinkDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this customer?"
        description={
          <>
            {toDelete?.name} will be removed from the customer list and can no longer be picked on
            new invoices. Existing invoices are unaffected.
          </>
        }
        confirmLabel="Delete"
        confirmIcon={<DeleteOutlineRounded />}
        confirmColor="error"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
    </Box>
  );
}
