'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import AddRounded from '@mui/icons-material/AddRounded';
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
import { ProductFormDialog, type EditableProduct } from '@/components/products/ProductFormDialog';
import { FabricsPanel } from '@/components/products/FabricsPanel';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';

interface ProductRow {
  _id: string;
  name: string;
  sku: string;
  defaultRate: number;
  unit?: string;
  /** Fabric id, plus the joined name/GSM the list renders. */
  fabric?: string | null;
  fabricName?: string;
  fabricGsm?: number | null;
  createdAt: string;
}

// Name + rate + actions always survive; unit goes first as it narrows, then fabric, then SKU.
const PRODUCT_COLUMN_TIERS: ColumnTiers = {
  lg: ['unit'],
  md: ['sku', 'fabricName'],
};

type TabKey = 'products' | 'fabrics';

export default function ProductsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [tab, setTab] = useState<TabKey>('products');
  const [fabricCount, setFabricCount] = useState(0);
  const [fabricCreateOpen, setFabricCreateOpen] = useState(false);
  const canView = useCan(Permission.ProductView);
  const canCreate = useCan(Permission.ProductCreate);
  const canEdit = useCan(Permission.ProductEdit);
  const canDelete = useCan(Permission.ProductDelete);

  const columnVisibility = useBreakpointColumns(PRODUCT_COLUMN_TIERS);

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
  const { data, isLoading, mutate } = useApi<{ items: ProductRow[]; total: number }>(
    `/api/products?${params.toString()}`,
  );
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  const [formOpen, setFormOpen] = useState(false);
  const [formProduct, setFormProduct] = useState<EditableProduct | null>(null);

  const openCreate = useCallback(() => {
    setFormProduct(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: ProductRow) => {
    setFormProduct(row);
    setFormOpen(true);
  }, []);

  const [toDelete, setToDelete] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await apiDelete(`/api/products/${toDelete._id}`);
    setDeleting(false);
    if (res.ok) {
      enqueueSnackbar('Product deleted', { variant: 'success' });
      setToDelete(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not delete product', { variant: 'error' });
    }
  }

  const columns: GridColDef<ProductRow>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Name', flex: 1.4, minWidth: 160 },
      {
        field: 'sku',
        headerName: 'SKU',
        flex: 0.9,
        minWidth: 120,
        valueGetter: (_v, r) => r.sku || '—',
      },
      {
        field: 'fabricName',
        headerName: 'Fabric',
        flex: 1.1,
        minWidth: 140,
        sortable: false,
        valueGetter: (_v, r) =>
          r.fabricName
            ? [r.fabricName, r.fabricGsm != null ? `${r.fabricGsm} GSM` : null]
                .filter(Boolean)
                .join(' · ')
            : '—',
      },
      {
        field: 'unit',
        headerName: 'Unit',
        flex: 0.7,
        minWidth: 100,
        valueGetter: (_v, r) => r.unit || '—',
      },
      {
        field: 'defaultRate',
        headerName: 'Default rate',
        flex: 0.9,
        minWidth: 130,
        headerAlign: 'right',
        align: 'right',
        valueGetter: (_v, r) => formatMoney('USD', r.defaultRate),
      },
      {
        field: 'actions',
        headerName: '',
        width: 64,
        sortable: false,
        renderCell: (p) => {
          const actions: RowAction[] = [];
          if (canEdit) actions.push({ label: 'Edit', onClick: () => openEdit(p.row) });
          if (canDelete)
            actions.push({ label: 'Delete', danger: true, onClick: () => setToDelete(p.row) });
          if (actions.length === 0) return null;
          return <RowActionsMenu ariaLabel="Product actions" actions={actions} />;
        },
      },
    ],
    [canEdit, canDelete, openEdit],
  );

  if (!canView) {
    return <NoAccess message="You do not have permission to view products." />;
  }

  const isFabrics = tab === 'fabrics';

  return (
    <Box className="rise-in">
      <PageHeader
        title="Products & fabrics"
        subtitle={
          isFabrics
            ? `${fabricCount} ${fabricCount === 1 ? 'fabric' : 'fabrics'} · materials products are made of`
            : `${rowCount} ${rowCount === 1 ? 'product' : 'products'} · catalogue & customer pricing`
        }
        actions={
          canCreate && (
            <Button
              variant="contained"
              onClick={isFabrics ? () => setFabricCreateOpen(true) : openCreate}
              startIcon={<AddRounded />}
            >
              {isFabrics ? 'New fabric' : 'New product'}
            </Button>
          )
        }
      />

      <Tabs
        value={tab}
        onChange={(_e, v: TabKey) => setTab(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="products" label="Products" />
        <Tab value="fabrics" label="Fabrics" />
      </Tabs>

      {isFabrics && (
        <FabricsPanel
          createOpen={fabricCreateOpen}
          onCreateClose={() => setFabricCreateOpen(false)}
          onCountChange={setFabricCount}
        />
      )}

      {/*
        Unmounted while on the fabrics tab, not display:none — the DataGrid measures a hidden
        container as zero-wide and collapses its flex columns. Search/page state lives in this
        component (not the grid), so it survives the switch anyway.
      */}
      {!isFabrics && (
        <Box>
          <Box sx={{ mb: 2 }}>
            <SearchBar
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search by name or SKU"
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

          <ProductFormDialog
            open={formOpen}
            product={formProduct}
            onClose={() => setFormOpen(false)}
            onSaved={() => void mutate()}
          />

          <ConfirmDialog
            open={Boolean(toDelete)}
            title="Delete this product?"
            description={
              <>
                {toDelete?.name} will be removed from the catalogue and its negotiated rates
                cleared. Existing invoices are unaffected.
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
      )}
    </Box>
  );
}
