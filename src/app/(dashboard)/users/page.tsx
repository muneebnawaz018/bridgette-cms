'use client';

import { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Typography from '@mui/material/Typography';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission, Role } from '@/modules/auth/rbac';
import { UserStatus } from '@/modules/auth/enums';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { DataTable } from '@/components/ui/DataTable';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, type Tone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiPost, apiPatch, apiDelete } from '@/lib/api/client';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  status: string;
  isProtected?: boolean;
  createdAt: string;
}

const statusTone: Record<string, Tone> = {
  active: 'success',
  invited: 'warning',
  disabled: 'neutral',
};

const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  admin: 'Administrator',
  accountant: 'Accountant / Manager',
  sales: 'Sales',
  readOnly: 'Read only',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Per-row overflow menu (Edit / Deactivate). Owns its own anchor state. */
function UserRowActions({
  row,
  canManage,
  onEdit,
  onDeactivate,
}: {
  row: UserRow;
  canManage: boolean;
  onEdit: (row: UserRow) => void;
  onDeactivate: (row: UserRow) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const deactivatable = canManage && row.status !== 'disabled' && !row.isProtected;
  if (!canManage) return null;

  const close = () => setAnchor(null);
  return (
    <>
      <IconButton size="small" aria-label="User actions" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem onClick={() => { close(); onEdit(row); }}>Edit</MenuItem>
        {deactivatable && (
          <MenuItem sx={{ color: 'error.main' }} onClick={() => { close(); onDeactivate(row); }}>
            Deactivate
          </MenuItem>
        )}
      </Menu>
    </>
  );
}

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.UserCreate);
  const canCreateAdmin = useCan(Permission.UserCreateAdmin);
  const canManage = useCan(Permission.UserManage);

  const { pageSize } = usePreferences();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [roleFilter, setRoleFilter] = useState<'' | Role>('');
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize });

  useEffect(() => {
    setPaginationModel((m) => (m.page === 0 ? m : { ...m, page: 0 }));
  }, [search, roleFilter]);

  // Follow the app-wide "rows per page" preference chosen in Settings.
  useEffect(() => {
    setPaginationModel((m) => (m.pageSize === pageSize ? m : { page: 0, pageSize }));
  }, [pageSize]);

  const params = new URLSearchParams({ page: String(paginationModel.page + 1), limit: String(paginationModel.pageSize) });
  if (search) params.set('search', search);
  if (roleFilter) params.set('role', roleFilter);
  const { data, isLoading, mutate } = useApi<{ items: UserRow[]; total: number }>(`/api/auth/users?${params.toString()}`);
  const rows = data?.items ?? [];
  const rowCount = data?.total ?? 0;

  // Create
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: Role.Accountant as Role });
  const [saving, setSaving] = useState(false);

  // Edit
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', role: Role.Accountant as Role, status: UserStatus.Active as UserStatus });
  const [savingEdit, setSavingEdit] = useState(false);

  // Deactivate
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

  function openEdit(row: UserRow) {
    setEditUser(row);
    setEditForm({
      name: row.name,
      phone: row.phone ?? '',
      role: (row.role as Role) ?? Role.Accountant,
      status: (row.status as UserStatus) ?? UserStatus.Active,
    });
  }

  async function saveEdit() {
    if (!editUser) return;
    setSavingEdit(true);
    // Protected users (seeded Super Admin) can change name/phone only; the server rejects
    // role/status changes, so we don't send them.
    const payload = {
      name: editForm.name,
      phone: editForm.phone || undefined,
      ...(editUser.isProtected ? {} : { role: editForm.role, status: editForm.status }),
    };
    const res = await apiPatch(`/api/auth/users/${editUser._id}`, payload);
    setSavingEdit(false);
    if (res.ok) {
      enqueueSnackbar('User updated', { variant: 'success' });
      setEditUser(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update user', { variant: 'error' });
    }
  }

  async function confirmDeactivate() {
    if (!toDeactivate) return;
    setDeactivating(true);
    const res = await apiDelete(`/api/auth/users/${toDeactivate._id}`);
    setDeactivating(false);
    if (res.ok) {
      enqueueSnackbar('User deactivated', { variant: 'success' });
      setToDeactivate(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not deactivate user', { variant: 'error' });
    }
  }

  const columns: GridColDef<UserRow>[] = [
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'email', headerName: 'Email', width: 240 },
    { field: 'role', headerName: 'Role', width: 170, valueGetter: (_v, r) => ROLE_LABEL[r.role] ?? r.role },
    {
      field: 'status',
      headerName: 'Status',
      width: 130,
      renderCell: (p) => <StatusChip label={p.value} tone={statusTone[p.value] ?? 'neutral'} />,
    },
    {
      field: 'actions',
      headerName: '',
      width: 70,
      sortable: false,
      align: 'center',
      renderCell: (p) => (
        <UserRowActions row={p.row} canManage={canManage} onEdit={openEdit} onDeactivate={setToDeactivate} />
      ),
    },
  ];

  // Role options for the edit form: Accountant always; Admin only for Super Admin; plus the
  // user's current role so the select is never empty.
  const roleOptions: { v: Role; label: string }[] = [
    { v: Role.Accountant, label: ROLE_LABEL.accountant },
    ...(canCreateAdmin ? [{ v: Role.Admin, label: ROLE_LABEL.admin }] : []),
  ];
  if (editForm.role && !roleOptions.some((o) => o.v === editForm.role)) {
    roleOptions.unshift({ v: editForm.role, label: ROLE_LABEL[editForm.role] ?? editForm.role });
  }

  return (
    <Box className="rise-in">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
        <Typography color="text.secondary" sx={{ flexGrow: 1 }}>
          {rowCount} team member{rowCount === 1 ? '' : 's'} · manage access and roles
        </Typography>
        {canCreate && (
          <Button variant="contained" onClick={() => setOpen(true)} startIcon={<PersonAddRounded />}>
            New user
          </Button>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search name or email"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }}
          sx={{ minWidth: { xs: '100%', sm: 280 }, flexGrow: { xs: 1, sm: 0 } }}
        />
        <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }} />
        <TextField select size="small" label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as '' | Role)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All roles</MenuItem>
          {Object.values(Role).map((r) => (
            <MenuItem key={r} value={r}>{ROLE_LABEL[r] ?? r}</MenuItem>
          ))}
        </TextField>
      </Box>

      <Paper sx={{ p: { xs: 1, md: 1.5 } }}>
        <DataTable
          rows={rows}
          columns={columns}
          getRowId={(r) => r._id}
          loading={isLoading}
          rowCount={rowCount}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
        />
      </Paper>

      {/* Create */}
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
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <SubmitButton variant="contained" loading={saving} onClick={createUser} disabled={!form.name || !form.email}>
            Create
          </SubmitButton>
        </DialogActions>
      </Dialog>

      {/* Edit (modify) */}
      <ConfirmDialog
        open={Boolean(editUser)}
        title={`Edit ${editUser?.name ?? 'user'}`}
        description="Changes take effect immediately."
        confirmLabel="Save changes"
        confirmDisabled={!editForm.name.trim()}
        loading={savingEdit}
        onConfirm={saveEdit}
        onClose={() => setEditUser(null)}
      >
        <Stack spacing={2}>
          <TextField label="Email" value={editUser?.email ?? ''} fullWidth disabled helperText="Email is the account identity and cannot be changed." />
          <TextField label="Name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} fullWidth required disabled={savingEdit} />
          <TextField label="Phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} fullWidth disabled={savingEdit} />
          <TextField
            select
            label="Role"
            value={editForm.role}
            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as Role }))}
            fullWidth
            disabled={savingEdit || Boolean(editUser?.isProtected)}
            helperText={editUser?.isProtected ? 'Protected user role cannot be changed.' : undefined}
          >
            {roleOptions.map((o) => (
              <MenuItem key={o.v} value={o.v}>{o.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Status"
            value={editForm.status}
            onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as UserStatus }))}
            fullWidth
            disabled={savingEdit || Boolean(editUser?.isProtected)}
          >
            {Object.values(UserStatus).map((s) => (
              <MenuItem key={s} value={s}>{cap(s)}</MenuItem>
            ))}
          </TextField>
        </Stack>
      </ConfirmDialog>

      {/* Deactivate */}
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
