'use client';

import dynamic from 'next/dynamic';
import Box from '@mui/material/Box';
import useMediaQuery from '@mui/material/useMediaQuery';
import type {
  GridColDef,
  GridValidRowModel,
  GridPaginationModel,
  GridColumnVisibilityModel,
} from '@mui/x-data-grid';
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
  height?: { xs: number | string; md: number | string } | number | string;
  /**
   * Which columns are visible, keyed by field. Pages drive this from `useBreakpointColumns`
   * so a narrow screen shows three columns instead of eight.
   *
   * Column `minWidth` totals here run to ~900px, and from 768px up the shell reserves a 268px
   * rail, so without this both grids scrolled sideways at every width below roughly 1266px —
   * a 1280 laptop included. It is a JS decision rather than CSS because DataGrid measures
   * columns itself and cannot be told to drop one with a media query.
   */
  columnVisibilityModel?: GridColumnVisibilityModel;
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
  height,
  columnVisibilityModel,
  rowCount,
  paginationModel,
  onPaginationModelChange,
  onRowClick,
}: DataTableProps<T>) {
  const server = Boolean(paginationModel && onPaginationModelChange);
  // A phone screen is ~568-640px tall, and the app bar, page header and stacked search/filter
  // rows eat ~350px of it. A fixed 480px box then overflowed the page AND scrolled internally
  // — two nested scrollbars, with the pagination footer pushed off-screen. Letting the grid
  // size to its rows below md leaves one scroll: the page's own.
  const compact = useMediaQuery('(max-width:899.95px)');

  // Size the box to the rows it actually shows, so a full page of 10 fits without an inner
  // scrollbar. A fixed 560px box was shorter than 10 default-height rows plus header and
  // footer (~628px), which is what produced the extra vertical scroll. Capped at the viewport
  // so a larger "rows per page" (25/50) scrolls the page rather than growing without bound; a
  // short last page shrinks to fit instead of leaving an empty gap. `height` still overrides.
  const DGRID = { row: 52, header: 56, footer: 54, pad: 2 };
  const shownRows = Math.max(1, rows.length || paginationModel?.pageSize || DEFAULT_PAGE_SIZE);
  const fitPx = DGRID.header + shownRows * DGRID.row + DGRID.footer + DGRID.pad;
  const boxHeight = height ?? (compact ? 'auto' : `min(${fitPx}px, calc(100dvh - 200px))`);

  // Rows loading asks for the one app-wide overlay. The grid's own indicator stays off: it
  // drew a second, smaller spinner in the table's top-left while the overlay was already up.
  useGlobalLoading(Boolean(loading));

  return (
    <Box sx={{ height: boxHeight, width: '100%' }}>
      <DataGrid
        rows={rows as GridValidRowModel[]}
        columns={columns as GridColDef<GridValidRowModel>[]}
        getRowId={getRowId as (row: GridValidRowModel) => string}
        pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
        paginationMode={server ? 'server' : 'client'}
        rowCount={server ? (rowCount ?? 0) : undefined}
        paginationModel={paginationModel}
        onPaginationModelChange={onPaginationModelChange}
        columnVisibilityModel={columnVisibilityModel}
        autoHeight={compact}
        // The default footer wants ~320px for "Rows per page:" + select + "1-10 of 128" + two
        // arrows, against 288px of usable width at 320px. Dropping the label is enough; the
        // select still says what it is.
        slotProps={compact ? { pagination: { labelRowsPerPage: '' } } : undefined}
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
          server
            ? undefined
            : { pagination: { paginationModel: { pageSize: DEFAULT_PAGE_SIZE, page: 0 } } }
        }
        disableRowSelectionOnClick
        sx={onRowClick ? { '& .MuiDataGrid-row': { cursor: 'pointer' } } : undefined}
      />
    </Box>
  );
}
