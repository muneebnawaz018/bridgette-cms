/** System roles. Values are stored on the user document (`roleId` / role key). */
export enum Role {
  SuperAdmin = 'superAdmin',
  Admin = 'admin',
  Accountant = 'accountant',
  // Future roles — defined now, not yet granted UI:
  Sales = 'sales',
  ReadOnly = 'readOnly',
}

/** Currently active roles (built now). Sales/ReadOnly are future. */
export const ACTIVE_ROLES: readonly Role[] = [Role.SuperAdmin, Role.Admin, Role.Accountant];

/**
 * Seniority rank — higher = more privileged. Used for "at least" checks and to decide
 * who may see archived invoices (Admin and above, or the creator).
 */
export const ROLE_RANK: Record<Role, number> = {
  [Role.SuperAdmin]: 100,
  [Role.Admin]: 80,
  [Role.Accountant]: 40,
  [Role.Sales]: 20,
  [Role.ReadOnly]: 10,
};

/** True if `role` is at least as senior as `min`. */
export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
