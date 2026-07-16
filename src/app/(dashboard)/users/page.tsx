'use client';

import { useState } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import type { GridColDef } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission, Role } from '@/modules/auth/rbac';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DataTable } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, type Tone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { apiPost } from '@/lib/api/client';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

const statusTone: Record<string, Tone> = {
  active: 'success',
  invited: 'warning',
  disabled: 'neutral',
};

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.UserCreate);
  const canCreateAdmin = useCan(Permission.UserCreateAdmin);
  const canManage = useCan(Permission.UserManage);

  const { data, isLoading, mutate } = useApi<{ items: UserRow[] }>('/api/auth/users?limit=100');
  const rows = data?.items ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: Role.Accountant as Role });
  const [saving, setSaving] = useState(false);
  const [toDeactivate, setToDeactivate] = useState<UserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  async function createUser() {
    setSaving(true);
    const res = await apiPost('/api/auth/users', form);
    setSaving(false);
    if (res.ok) {
      enqueueSnackbar('User created. Invite email sent.', { variant: 'success' });
      setOpen(false);
      setForm({ name: '', email: '', role: Role.Accountant });
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Failed to create user', { variant: 'error' });
    }
  }

  async function confirmDeactivate() {
    if (!toDeactivate) return;
    setDeactivating(true);
    const res = await fetch(`/api/auth/users/${toDeactivate._id}`, { method: 'DELETE' });
    const json = await res.json();
    setDeactivating(false);
    if (json.ok) {
      enqueueSnackbar('User deactivated', { variant: 'success' });
      setToDeactivate(null);
      void mutate();
    } else {
      enqueueSnackbar(json.error ?? 'Could not deactivate user', { variant: 'error' });
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
      renderCell: (p) => <StatusChip label={p.value} tone={statusTone[p.value] ?? 'neutral'} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 140,
      sortable: false,
      renderCell: (p) =>
        canManage && p.row.status !== 'disabled' ? (
          <Button size="small" color="error" onClick={() => setToDeactivate(p.row)}>
            Deactivate
          </Button>
        ) : null,
    },
  ];

  return (
    <Box className="rise-in">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>Users</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.25 }}>
            {rows.length} team member{rows.length === 1 ? '' : 's'} · manage access and roles
          </Typography>
        </Box>
        {canCreate && (
          <Button variant="contained" onClick={() => setOpen(true)} startIcon={<PersonAddRounded />}>
            New user
          </Button>
        )}
      </Box>

      <Paper sx={{ p: { xs: 1, md: 1.5 } }}>
        <DataTable rows={rows} columns={columns} getRowId={(r) => r._id} loading={isLoading} />
      </Paper>

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
          <Button onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <SubmitButton variant="contained" loading={saving} onClick={createUser} disabled={!form.name || !form.email}>
            Create
          </SubmitButton>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toDeactivate)}
        title="Deactivate this user?"
        description={
          <>
            {toDeactivate?.name} will lose access right away and any active sessions end.
            You can reactivate them later. Users are never deleted.
          </>
        }
        confirmLabel="Deactivate"
        confirmColor="error"
        loading={deactivating}
        onConfirm={confirmDeactivate}
        onClose={() => setToDeactivate(null)}
      />
    </Box>
  );
}
