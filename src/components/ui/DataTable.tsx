'use client';

import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import type { GridColDef, GridValidRowModel, GridPaginationModel } from '@mui/x-data-grid';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/pagination';

// Code-split the heavy DataGrid so list pages don't ship it in their initial bundle.
const DataGrid = dynamic(() => import('@mui/x-data-grid').then((m) => m.DataGrid), {
  ssr: false,
  loading: () => <BrandLoader label="Loading table…" minHeight={0} />,
});

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
}: DataTableProps<T>) {
  const server = Boolean(paginationModel && onPaginationModelChange);

  return (
    <Box sx={{ height, width: '100%' }}>
      <DataGrid
        rows={rows as GridValidRowModel[]}
        columns={columns as GridColDef<GridValidRowModel>[]}
        getRowId={getRowId as (row: GridValidRowModel) => string}
        loading={loading}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        paginationMode={server ? 'server' : 'client'}
        rowCount={server ? (rowCount ?? 0) : undefined}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        initialState={
          server ? undefined : { pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }
        }
        disableRowSelectionOnClick
      />
    </Box>
  );
}
