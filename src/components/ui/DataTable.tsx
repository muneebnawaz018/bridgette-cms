'use client';

import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid';
import { BrandLoader } from '@/components/ui/BrandLoader';

// Code-split the heavy DataGrid so list pages don't ship it in their initial bundle.
const DataGrid = dynamic(() => import('@mui/x-data-grid').then((m) => m.DataGrid), {
  ssr: false,
  loading: () => <BrandLoader label="Loading table…" />,
});

interface DataTableProps<T extends GridValidRowModel> {
  rows: T[];
  columns: GridColDef<T>[];
  loading?: boolean;
  getRowId: (row: T) => string;
  height?: { xs: number; md: number } | number;
}

export function DataTable<T extends GridValidRowModel>({
  rows,
  columns,
  loading,
  getRowId,
  height = { xs: 480, md: 560 },
}: DataTableProps<T>) {
  return (
    <Box sx={{ height, width: '100%' }}>
      <DataGrid
        rows={rows as GridValidRowModel[]}
        columns={columns as GridColDef<GridValidRowModel>[]}
        getRowId={getRowId as (row: GridValidRowModel) => string}
        loading={loading}
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
