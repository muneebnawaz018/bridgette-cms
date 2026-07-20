'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import MenuItem from '@mui/material/MenuItem';
import Menu from '@mui/material/Menu';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission, Role, ACTIVE_ROLES } from '@/modules/auth/rbac';
import { useCan, useSession } from '@/components/auth/SessionProvider';
import { DataTable } from '@/components/ui/DataTable';
import { SearchBar } from '@/components/ui/SearchBar';
import { UserDetailsModal } from '@/components/users/UserDetailsModal';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, type Tone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete } from '@/lib/api/client';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
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

/** Per-row overflow menu (Edit / Deactivate). Owns its own anchor state. */
function UserRowActions({
  row,
  canManage,
  isSelf,
  onEdit,
  onDeactivate,
}: {
  row: UserRow;
  canManage: boolean;
  isSelf: boolean;
  onEdit: (row: UserRow) => void;
  onDeactivate: (row: UserRow) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  // The protected Super Admin is locked — only the account holder can edit it.
  const editable = canManage && (!row.isProtected || isSelf);
  // Cannot deactivate a disabled user, a protected user, or your own account.
  const deactivatable = canManage && row.status !== 'disabled' && !row.isProtected && !isSelf;
  if (!editable && !deactivatable) return null;

  const close = () => setAnchor(null);
  return (
    <>
      <IconButton size="small" aria-label="User actions" onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {editable && <MenuItem onClick={() => { close(); onEdit(row); }}>Edit</MenuItem>}
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
  const { userId: currentUserId } = useSession();
  const canView = useCan(Permission.UserView);
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

  // Details modal (row click)
  const [detailId, setDetailId] = useState<string | null>(null);

  // One dialog handles create and edit; `formUser` null means create. It owns its own state
  // so typing never re-renders this page (and with it the DataGrid), which was the lag.
  const [formOpen, setFormOpen] = useState(false);
  const [formUser, setFormUser] = useState<UserRow | null>(null);

  const openCreate = useCallback(() => {
    setFormUser(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((row: UserRow) => {
    setFormUser(row);
    setFormOpen(true);
  }, []);

  // Deactivate
  const [toDeactivate, setToDeactivate] = useState<UserRow | null>(null);
  const [deactivating, setDeactivating] = useState(false);

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

  // Memoized so the grid isn't handed a brand-new column array on every render.
  const columns: GridColDef<UserRow>[] = useMemo(
    () => [
      { field: 'name', headerName: 'Name', flex: 1.2, minWidth: 150, headerAlign: 'center', align: 'center' },
      {
        field: 'jobTitle',
        headerName: 'Job title',
        flex: 1,
        minWidth: 140,
        headerAlign: 'center',
        align: 'center',
        valueGetter: (_v, r) => r.jobTitle || '—',
      },
      { field: 'email', headerName: 'Email', flex: 1.8, minWidth: 200, headerAlign: 'center', align: 'center' },
      {
        field: 'role',
        headerName: 'Role',
        flex: 1.1,
        minWidth: 150,
        headerAlign: 'center',
        align: 'center',
        valueGetter: (_v, r) => ROLE_LABEL[r.role] ?? r.role,
      },
      {
        field: 'status',
        headerName: 'Status',
        flex: 0.9,
        minWidth: 120,
        headerAlign: 'center',
        align: 'center',
        renderCell: (p) => <StatusChip label={p.value} tone={statusTone[p.value] ?? 'neutral'} />,
      },
      {
        field: 'actions',
        headerName: '',
        width: 64,
        sortable: false,
        headerAlign: 'center',
        align: 'center',
        renderCell: (p) => (
          <UserRowActions
            row={p.row}
            canManage={canManage}
            isSelf={p.row._id === currentUserId}
            onEdit={openEdit}
            onDeactivate={setToDeactivate}
          />
        ),
      },
    ],
    [canManage, currentUserId, openEdit],
  );

  if (!canView) {
    return (
      <Box className="rise-in">
        <Paper sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
          <Typography variant="h6" gutterBottom>No access</Typography>
          <Typography color="text.secondary">You do not have permission to view users.</Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box className="rise-in">
      {/* Below 768px the sidebar is a drawer (mobile) — center the title + full-width button;
          from 768px up switch to title-left / button-right. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, mb: 2.5, '@media (min-width:768px)': { flexDirection: 'row', alignItems: 'flex-start' } }}>
        <Box sx={{ flexGrow: 1, minWidth: 0, textAlign: 'center', '@media (min-width:768px)': { textAlign: 'left' } }}>
          <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Team members
          </Typography>
          <Typography color="text.secondary" variant="subtitle2" sx={{ mt: 0.25 }}>
            {rowCount} {rowCount === 1 ? 'member' : 'members'} · manage access and roles
          </Typography>
        </Box>
        {canCreate && (
          /* Phones: full width. Tablet: normal width pinned right (the header is a column
             there, so alignSelf is the horizontal axis). Desktop: the row handles it. */
          <Button
            variant="contained"
            onClick={openCreate}
            startIcon={<PersonAddRounded />}
            sx={{
              flexShrink: 0,
              width: { xs: '100%', sm: 'auto' },
              alignSelf: { xs: 'stretch', sm: 'flex-end' },
              '@media (min-width:768px)': { alignSelf: 'flex-start' },
            }}
          >
            New user
          </Button>
        )}
      </Box>

      <Box sx={{ mb: 2 }}>
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name or email"
          filter={{
            label: 'All roles',
            value: roleFilter,
            onChange: (v) => setRoleFilter(v as '' | Role),
            options: [
              { value: '', label: 'All roles' },
              // ACTIVE_ROLES only — Sales/Read only are future scope and have no users.
              ...ACTIVE_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r })),
            ],
          }}
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
          onRowClick={setDetailId}
        />
      </Paper>

      <UserDetailsModal
        id={detailId}
        onClose={() => setDetailId(null)}
        canManage={canManage}
        onEdit={(uid) => {
          const row = rows.find((r) => r._id === uid);
          if (row) {
            setDetailId(null);
            openEdit(row);
          }
        }}
      />

      <UserFormDialog
        open={formOpen}
        user={formUser}
        onClose={() => setFormOpen(false)}
        canCreateAdmin={canCreateAdmin}
        onSaved={() => void mutate()}
      />

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
