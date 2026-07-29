'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
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
import { CustomerPricingModal } from '@/components/customers/CustomerPricingModal';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete } from '@/lib/api/client';
import { CustomerType, CUSTOMER_TYPE_LABEL } from '@/modules/customers/enums';
import type { AddressParts } from '@/modules/customers/address';

interface CustomerRow {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  customerType?: string;
  addressParts?: AddressParts | null;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  reseller?: boolean;
  invoiceType?: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { tax: 'US Tax', cash: 'US Cash', pk: 'Pakistan' };

// Name + actions always survive; company goes first as the grid narrows, then phone, then email.
const CUSTOMER_COLUMN_TIERS: ColumnTiers = {
  lg: ['company', 'invoiceType', 'customerType'],
  md: ['phone'],
  sm: ['email'],
};

export default function CustomersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canView = useCan(Permission.CustomerView);
  const canCreate = useCan(Permission.CustomerCreate);
  const canEdit = useCan(Permission.CustomerEdit);
  const canDelete = useCan(Permission.CustomerDelete);
  // Per-customer product pricing is a product-catalogue edit, so it is gated on ProductEdit.
  const canPrice = useCan(Permission.ProductEdit);

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

  const params = new URLSearchParams({
    page: String(paginationModel.page + 1),
    limit: String(paginationModel.pageSize),
  });
  if (search) params.set('search', search);
  const { data, isLoading, mutate } = useApi<{ items: CustomerRow[]; total: number }>(
    `/api/customers?${params.toString()}`,
  );
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  // One dialog handles create and edit; null = create.
  const [formOpen, setFormOpen] = useState(false);
  const [formCustomer, setFormCustomer] = useState<EditableCustomer | null>(null);

  const openCreate = useCallback(() => {
    setFormCustomer(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: CustomerRow) => {
    setFormCustomer(row);
    setFormOpen(true);
  }, []);

  const [pricing, setPricing] = useState<CustomerRow | null>(null);

  const [toDelete, setToDelete] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      { field: 'name', headerName: 'Name', flex: 1.3, minWidth: 160 },
      {
        field: 'customerType',
        headerName: 'Type',
        flex: 0.8,
        minWidth: 110,
        valueGetter: (_v, r) =>
          r.customerType ? CUSTOMER_TYPE_LABEL[r.customerType as CustomerType] : '—',
      },
      {
        field: 'company',
        headerName: 'Team / business',
        flex: 1.1,
        minWidth: 150,
        valueGetter: (_v, r) => r.company || '—',
      },
      {
        field: 'email',
        headerName: 'Email',
        flex: 1.6,
        minWidth: 190,
        valueGetter: (_v, r) => r.email || '—',
      },
      {
        field: 'phone',
        headerName: 'Phone',
        flex: 1,
        minWidth: 130,
        valueGetter: (_v, r) => r.phone || '—',
      },
      {
        field: 'invoiceType',
        headerName: 'Invoices',
        flex: 0.9,
        minWidth: 120,
        valueGetter: (_v, r) =>
          `${r.invoiceType ? (TYPE_LABEL[r.invoiceType] ?? r.invoiceType) : '—'}${r.reseller ? ' · reseller' : ''}`,
      },
      {
        field: 'actions',
        headerName: '',
        width: 64,
        sortable: false,
        renderCell: (p) => {
          const actions: RowAction[] = [];
          if (canEdit) actions.push({ label: 'Edit', onClick: () => openEdit(p.row) });
          if (canPrice) actions.push({ label: 'Pricing', onClick: () => setPricing(p.row) });
          if (canDelete)
            actions.push({ label: 'Delete', danger: true, onClick: () => setToDelete(p.row) });
          if (actions.length === 0) return null;
          return <RowActionsMenu ariaLabel="Customer actions" actions={actions} />;
        },
      },
    ],
    [canEdit, canPrice, canDelete, openEdit],
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
            <Button variant="contained" onClick={openCreate} startIcon={<PersonAddRounded />}>
              New customer
            </Button>
          )
        }
      />

      <Box sx={{ mb: 2 }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name, email or company"
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
          onRowClick={canEdit ? (id) => openEdit(rows.find((r) => r._id === id)!) : undefined}
          columnVisibilityModel={columnVisibility}
        />
      </Paper>

      <CustomerFormDialog
        open={formOpen}
        customer={formCustomer}
        onClose={() => setFormOpen(false)}
        onSaved={() => void mutate()}
      />

      <CustomerPricingModal
        customerId={pricing?._id ?? null}
        customerName={pricing?.name ?? ''}
        onClose={() => setPricing(null)}
      />

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
