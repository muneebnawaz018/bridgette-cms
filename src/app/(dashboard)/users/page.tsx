'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import type { GridColDef, GridPaginationModel } from '@mui/x-data-grid';
import { useSnackbar } from 'notistack';
import { Permission, Role, ACTIVE_ROLES } from '@/modules/auth/rbac';
import { useCan, useSession } from '@/components/auth/SessionProvider';
import { DataTable } from '@/components/ui/DataTable';
import { AvatarPicker } from '@/components/ui/AvatarPicker';
import { SearchBar } from '@/components/ui/SearchBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { NoAccess } from '@/components/ui/NoAccess';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { UserDetailsModal } from '@/components/users/UserDetailsModal';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, userStatusTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { useDebounced } from '@/lib/api/useDebounce';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { apiDelete, apiPost } from '@/lib/api/client';
import { ROLE_LABEL } from '@/lib/format/labels';

interface UserRow {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  notes?: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
  isProtected?: boolean;
  createdAt: string;
}


/** Which of the row actions this user may take on this particular account. */
function rowActions(
  row: UserRow,
  canManage: boolean,
  isSelf: boolean,
  onEdit: (row: UserRow) => void,
  onDeactivate: (row: UserRow) => void,
  onResendInvite: (row: UserRow) => void,
  onReactivate: (row: UserRow) => void,
): RowAction[] {
  const actions: RowAction[] = [];
  // The protected Super Admin is locked — only the account holder can edit it.
  if (canManage && (!row.isProtected || isSelf)) {
    actions.push({ label: 'Edit', onClick: () => onEdit(row) });
  }
  // An invite that expired or never arrived otherwise strands the account: the address is
  // taken, so it cannot be re-created, and there was no other way to issue a fresh code.
  if (canManage && row.status === 'invited') {
    actions.push({ label: 'Resend invitation', onClick: () => onResendInvite(row) });
  }
  // Deactivation had no counterpart, so a disabled account could never be brought back.
  if (canManage && row.status === 'disabled' && !row.isProtected) {
    actions.push({ label: 'Enable', onClick: () => onReactivate(row) });
  }
  // Cannot deactivate a disabled user, a protected user, or your own account.
  if (canManage && row.status !== 'disabled' && !row.isProtected && !isSelf) {
    actions.push({ label: 'Deactivate', danger: true, onClick: () => onDeactivate(row) });
  }
  return actions;
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

  // Resend invitation / enable. Both are single-step and reversible, so neither gets a
  // confirmation dialog the way Deactivate does.
  const resendInvite = useCallback(
    async (row: UserRow) => {
      const res = await apiPost<{ emailSent: boolean; otpTtlMinutes: number }>(
        `/api/auth/users/${row._id}/resend-invite`,
      );
      if (!res.ok) {
        enqueueSnackbar(res.error ?? 'Could not resend the invitation', { variant: 'error' });
        return;
      }
      // The code is issued either way — say so plainly when the email itself failed, rather
      // than reporting success for a message that never left.
      if (res.data?.emailSent) {
        enqueueSnackbar(
          `Invitation sent to ${row.email} — the code expires in ${res.data.otpTtlMinutes} minutes`,
          { variant: 'success' },
        );
      } else {
        enqueueSnackbar('New code issued, but the email failed to send', { variant: 'warning' });
      }
    },
    [enqueueSnackbar],
  );

  const reactivate = useCallback(
    async (row: UserRow) => {
      const res = await apiPost<{ status: string }>(`/api/auth/users/${row._id}/reactivate`);
      if (!res.ok) {
        enqueueSnackbar(res.error ?? 'Could not enable user', { variant: 'error' });
        return;
      }
      // Someone disabled before they ever set a password goes back to invited, not active —
      // say which, so the admin knows an invite still has to be sent.
      enqueueSnackbar(
        res.data?.status === 'invited'
          ? 'User enabled — they still need an invitation to set a password'
          : 'User enabled',
        { variant: 'success' },
      );
      void mutate();
    },
    [enqueueSnackbar, mutate],
  );

  // Memoized so the grid isn't handed a brand-new column array on every render.
  const columns: GridColDef<UserRow>[] = useMemo(
    () => [
      {
        field: 'avatar',
        headerName: '',
        width: 72,
        sortable: false,
        filterable: false,
        headerAlign: 'center',
        align: 'center',
        // Same component the details modal and profile page use, in view-only mode: clicking
        // the photo opens it full size.
        //
        // The wrapper stops the click rather than relying on DataTable's field exclusion
        // alone: AvatarPicker's own handler has already opened the viewer by the time the
        // event reaches here, and letting it continue to the grid opened the details modal on
        // top of it. With no photo there is nothing to view, so the cell falls back to the
        // row's own behavior instead of being dead.
        //
        // It must also fill the cell — sized to its content it collapsed to the avatar and sat
        // against the left edge, which is why the photos looked off-centre.
        renderCell: (p) => (
          <Box
            onClick={(e) => {
              e.stopPropagation();
              if (!p.row.avatarUrl) setDetailId(p.row._id);
            }}
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: p.row.avatarUrl ? 'zoom-in' : 'pointer',
            }}
          >
            <AvatarPicker
              src={p.row.avatarUrl}
              fallback={(p.row.name || p.row.email).charAt(0).toUpperCase()}
              title={p.row.name}
              size={36}
            />
          </Box>
        ),
      },
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
        renderCell: (p) => (
          <StatusChip label={p.value} tone={userStatusTone[p.value] ?? 'neutral'} />
        ),
      },
      {
        field: 'actions',
        headerName: '',
        width: 64,
        sortable: false,
        headerAlign: 'center',
        align: 'center',
        renderCell: (p) => (
          <RowActionsMenu
            ariaLabel="User actions"
            actions={rowActions(
              p.row,
              canManage,
              p.row._id === currentUserId,
              openEdit,
              setToDeactivate,
              resendInvite,
              reactivate,
            )}
          />
        ),
      },
    ],
    [canManage, currentUserId, openEdit, resendInvite, reactivate],
  );

  if (!canView) {
    return <NoAccess message="You do not have permission to view users." />;
  }

  return (
    <Box className="rise-in">
      <PageHeader
        title="Team members"
        subtitle={`${rowCount} ${rowCount === 1 ? 'member' : 'members'} · manage access and roles`}
        actions={
          canCreate && (
            <Button variant="contained" onClick={openCreate} startIcon={<PersonAddRounded />}>
              New user
            </Button>
          )
        }
      />

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
        // The modal can change a user's photo, which this list also renders. Its own revalidate
        // only covers the single-user key, so the grid needs telling.
        onChanged={() => void mutate()}
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
        confirmIcon={<BlockRounded />}
        confirmColor="error"
        loading={deactivating}
        onConfirm={confirmDeactivate}
        onClose={() => setToDeactivate(null)}
      />
    </Box>
  );
}
