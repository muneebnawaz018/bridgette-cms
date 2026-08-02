'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';
import { DataTable } from '@/components/ui/DataTable';
import { useBreakpointColumns, type ColumnTiers } from '@/lib/ui/useBreakpointColumns';
import { SearchBar } from '@/components/ui/SearchBar';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FabricFormDialog, type EditableFabric } from '@/components/products/FabricFormDialog';
import type { FormMode } from '@/components/ui/Modal';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete } from '@/lib/api/client';

/*
 * The Fabrics tab of the products page. Same grid/search/dialog shape as the products tab; the
 * parent owns the "New fabric" button (it lives in the page header) and drives it through the
 * `createOpen` pair so both entry points share one dialog.
 */

// Name + GSM + actions fit the 288px a 320px phone leaves; type goes below sm.
const FABRIC_COLUMN_TIERS: ColumnTiers = {
  sm: ['type'],
};

interface FabricRow {
  _id: string;
  name: string;
  gsm?: number | null;
  type?: string;
  createdAt: string;
}

export function FabricsPanel({
  createOpen,
  onCreateClose,
  onCountChange,
}: {
  createOpen: boolean;
  onCreateClose: () => void;
  onCountChange?: (n: number) => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = useCan(Permission.ProductEdit);
  const canDelete = useCan(Permission.ProductDelete);

  const columnVisibility = useBreakpointColumns(FABRIC_COLUMN_TIERS);

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
  const { data, isLoading, mutate } = useApi<{ items: FabricRow[]; total: number }>(
    `/api/fabrics?${params.toString()}`,
  );
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  useEffect(() => {
    onCountChange?.(rowCount);
  }, [rowCount, onCountChange]);

  const [editing, setEditing] = useState<EditableFabric | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Rows open read-only. Editing is reached from the pencil inside, or from the row menu.
  const [editMode, setEditMode] = useState<FormMode>('edit');

  const openView = useCallback((row: FabricRow) => {
    setEditing(row);
    setEditMode('view');
    setEditOpen(true);
  }, []);

  const openEdit = useCallback((row: FabricRow) => {
    setEditing(row);
    setEditMode('edit');
    setEditOpen(true);
  }, []);

  const [toDelete, setToDelete] = useState<FabricRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const res = await apiDelete(`/api/fabrics/${toDelete._id}`);
    setDeleting(false);
    if (res.ok) {
      enqueueSnackbar('Fabric deleted', { variant: 'success' });
      setToDelete(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not delete fabric', { variant: 'error' });
    }
  }

  const columns: GridColDef<FabricRow>[] = useMemo(
    () => [
      // Three data columns only, so keep the flexes near-equal — a dominant Name column makes
      // the grid read as one wide column with leftovers.
      { field: 'name', headerName: 'Name', flex: 1.1, minWidth: 130 },
      {
        field: 'gsm',
        headerName: 'GSM',
        flex: 0.7,
        minWidth: 80,
        valueGetter: (_v, r) => (r.gsm != null ? String(r.gsm) : '—'),
      },
      {
        field: 'type',
        headerName: 'Type',
        flex: 1,
        minWidth: 120,
        valueGetter: (_v, r) => r.type || '—',
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
          return <RowActionsMenu ariaLabel="Fabric actions" actions={actions} />;
        },
      },
    ],
    [canEdit, canDelete, openEdit, openView],
  );

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name or type"
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

      {/* One dialog, two entry points: the header's New button and a row's View / Edit. */}
      <FabricFormDialog
        open={createOpen || editOpen}
        fabric={createOpen ? null : editing}
        initialMode={editMode}
        canEdit={canEdit}
        onClose={() => {
          setEditOpen(false);
          onCreateClose();
        }}
        onSaved={() => void mutate()}
      />

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete this fabric?"
        description={
          <>
            {toDelete?.name} will be removed from the fabric list. Products still using it must be
            re-assigned first.
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
