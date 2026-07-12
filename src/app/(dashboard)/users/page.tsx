'use client';

import { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission, Role } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';
import { apiPost } from '@/lib/api/client';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

const statusColor: Record<string, 'default' | 'success' | 'warning'> = {
  active: 'success',
  invited: 'warning',
  disabled: 'default',
};

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.UserCreate);
  const canCreateAdmin = useCan(Permission.UserCreateAdmin);
  const canManage = useCan(Permission.UserManage);

  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: Role.Accountant as Role });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/auth/users?limit=100');
    const json = await res.json();
    setRows(json.ok ? json.data.items : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function createUser() {
    setSaving(true);
    const res = await apiPost('/api/auth/users', form);
    setSaving(false);
    if (res.ok) {
      enqueueSnackbar('User created — invite email sent', { variant: 'success' });
      setOpen(false);
      setForm({ name: '', email: '', role: Role.Accountant });
      void load();
    } else {
      enqueueSnackbar(res.error ?? 'Failed to create user', { variant: 'error' });
    }
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.ok) {
      enqueueSnackbar('User deactivated', { variant: 'success' });
      void load();
    } else {
      enqueueSnackbar(json.error ?? 'Failed', { variant: 'error' });
    }
  }

  const columns: GridColDef<UserRow>[] = [
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'email', headerName: 'Email', width: 240 },
    { field: 'role', headerName: 'Role', width: 140 },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (p) => <Chip size="small" label={p.value} color={statusColor[p.value] ?? 'default'} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 140,
      sortable: false,
      renderCell: (p) =>
        canManage && p.row.status !== 'disabled' ? (
          <Button size="small" color="error" onClick={() => deactivate(p.row._id)}>
            Deactivate
          </Button>
        ) : null,
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Users
        </Typography>
        {canCreate && (
          <Button variant="contained" onClick={() => setOpen(true)}>
            New user
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

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>New user</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth required />
            <TextField label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} fullWidth required />
            <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })} fullWidth>
              <MenuItem value={Role.Accountant}>Accountant / Manager</MenuItem>
              {canCreateAdmin && <MenuItem value={Role.Admin}>Administrator</MenuItem>}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={createUser} disabled={saving || !form.name || !form.email}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
