/** Granular capabilities. Roles are granted a set of these (see policy.ts). */
export enum Permission {
  // User management
  UserCreateAdmin = 'user:createAdmin', // create Admins / Super Admins (Super Admin only)
  UserCreate = 'user:create', // create non-admin users
  UserManage = 'user:manage', // edit / deactivate users
  UserView = 'user:view',

  // Invoices
  InvoiceCreate = 'invoice:create',
  InvoiceEdit = 'invoice:edit',
  InvoiceArchive = 'invoice:archive', // invoices are archived, never deleted
  InvoiceCancel = 'invoice:cancel',
  InvoiceView = 'invoice:view',
  InvoiceViewAllArchived = 'invoice:viewAllArchived', // see any archived invoice (else only own)

  // Payments
  PaymentRecord = 'payment:record',
  PaymentManage = 'payment:manage',

  // Ops
  SettingsManage = 'settings:manage',
  ReportsView = 'reports:view',
  AuditView = 'audit:view',
}
