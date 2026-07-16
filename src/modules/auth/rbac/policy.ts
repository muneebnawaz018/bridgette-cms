import { Role } from './roles';
import { Permission } from './permissions';

/**
 * Role → permissions matrix (RBAC). Single source of truth for authorization.
 *
 * - Super Admin: everything, incl. creating other Admins.
 * - Admin: everything except creating Admins.
 * - Accountant: invoice + payment work; no user management.
 * - Sales / ReadOnly: future — minimal grants for now.
 */
const ADMIN_PERMS: Permission[] = [
  Permission.UserCreate,
  Permission.UserManage,
  Permission.UserView,
  Permission.InvoiceCreate,
  Permission.InvoiceEdit,
  Permission.InvoiceArchive,
  Permission.InvoiceDelete,
  Permission.InvoiceCancel,
  Permission.InvoiceView,
  Permission.InvoiceViewAllArchived,
  Permission.PaymentRecord,
  Permission.PaymentManage,
  Permission.SettingsManage,
  Permission.ReportsView,
  Permission.AuditView,
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [Role.SuperAdmin]: [Permission.UserCreateAdmin, ...ADMIN_PERMS],
  [Role.Admin]: ADMIN_PERMS,
  [Role.Accountant]: [
    Permission.InvoiceCreate,
    Permission.InvoiceEdit,
    Permission.InvoiceCancel,
    Permission.InvoiceView,
    Permission.PaymentRecord,
    Permission.ReportsView,
  ],
  [Role.Sales]: [Permission.InvoiceCreate, Permission.InvoiceView],
  [Role.ReadOnly]: [Permission.InvoiceView, Permission.ReportsView],
};

/** True if the role holds the permission. */
export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Throws if the role lacks the permission (use in server actions / route handlers). */
export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Forbidden: role "${role}" lacks permission "${permission}"`);
  }
}
