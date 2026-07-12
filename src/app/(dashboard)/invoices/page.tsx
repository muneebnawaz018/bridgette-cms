'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Permission } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';

interface InvoiceRow {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  grandTotal: number;
  isArchived: boolean;
  billTo?: { name?: string };
  createdAt: string;
}

const stateColor: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  draft: 'default',
  pending: 'warning',
  partiallyPaid: 'info',
  paid: 'success',
  overdue: 'error',
};

export default function InvoicesPage() {
  const canCreate = useCan(Permission.InvoiceCreate);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/invoices?limit=50');
    const json = await res.json();
    setRows(json.ok ? json.data.items : []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, []);

  const columns: GridColDef<InvoiceRow>[] = [
    { field: 'number', headerName: 'Number', width: 160 },
    { field: 'type', headerName: 'Type', width: 90 },
    {
      field: 'state',
      headerName: 'State',
      width: 140,
      renderCell: (p) => <Chip size="small" label={p.value} color={stateColor[p.value] ?? 'default'} />,
    },
    { field: 'billTo', headerName: 'Bill to', width: 180, valueGetter: (_v, r) => r.billTo?.name ?? '—' },
    {
      field: 'grandTotal',
      headerName: 'Total',
      width: 130,
      valueGetter: (_v, r) => `${r.currency} ${Number(r.grandTotal).toFixed(2)}`,
    },
    {
      field: 'isArchived',
      headerName: '',
      width: 100,
      renderCell: (p) => (p.value ? <Chip size="small" label="archived" variant="outlined" /> : null),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" fontWeight={700} sx={{ flexGrow: 1 }}>
          Invoices
        </Typography>
        {canCreate && (
          <Button component={Link} href="/invoices/new" variant="contained">
            New invoice
          </Button>
        )}
      </Box>
      <div style={{ height: 560, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(r) => r._id}
          loading={loading}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25, page: 0 } } }}
          disableRowSelectionOnClick
        />
      </div>
    </Box>
  );
}
