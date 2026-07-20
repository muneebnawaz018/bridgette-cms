'use client';

import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import type { GridColDef, GridValidRowModel, GridPaginationModel } from '@mui/x-data-grid';
import { GlobalLoading } from '@/components/ui/GlobalLoading';
import { useGlobalLoading } from '@/lib/api/useGlobalLoading';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/pagination';

// Code-split the heavy DataGrid so list pages don't ship it in their initial bundle. Waiting
// on the chunk asks for the app-wide overlay rather than drawing one here, which would sit
// inside the page and leave the sidebar and top bar uncovered.
const DataGrid = dynamic(() => import('@mui/x-data-grid').then((m) => m.DataGrid), {
  ssr: false,
  loading: () => <GlobalLoading />,
});

/** Columns whose cells handle their own clicks and must not also trigger `onRowClick`. */
const INTERACTIVE_FIELDS = new Set(['actions', 'avatar']);

interface DataTableProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef<T>[];
  loading?: boolean;
  getRowId: (row: T) => string;
  height?: { xs: number; md: number } | number;
  /** Server pagination: pass all three to drive paging from the server (rowCount = total). */
  rowCount?: number;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  /** Row click (opens a details modal). The `actions` column is excluded so its buttons work. */
  onRowClick?: (id: string) => void;
}

export function DataTable<T extends GridValidRowModel>({
  rows,
  columns,
  loading,
  getRowId,
  height = { xs: 480, md: 560 },
  rowCount,
  paginationModel,
  onPaginationModelChange,
  onRowClick,
}: DataTableProps<T>) {
  const server = Boolean(paginationModel && onPaginationModelChange);

  // Rows loading asks for the one app-wide overlay. The grid's own indicator stays off: it
  // drew a second, smaller spinner in the table's top-left while the overlay was already up.
  useGlobalLoading(Boolean(loading));

  return (
    <Box sx={{ height, width: '100%' }}>
      <DataGrid
        rows={rows as GridValidRowModel[]}
        columns={columns as GridColDef<GridValidRowModel>[]}
        getRowId={getRowId as (row: GridValidRowModel) => string}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        paginationMode={server ? 'server' : 'client'}
        rowCount={server ? (rowCount ?? 0) : undefined}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        onCellClick={
          onRowClick
            ? (params) => {
                // Skip columns whose cells are themselves interactive, so their own click
                // handler is not shadowed by the row's: `actions` owns an overflow menu, and
                // `avatar` opens a full-size viewer.
                if (!INTERACTIVE_FIELDS.has(params.field)) onRowClick(String(params.id));
              }
            : undefined
        }
        initialState={
          server ? undefined : { pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }
        }
        disableRowSelectionOnClick
        sx={onRowClick ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : undefined}
      />
    </Box>
  );
}
