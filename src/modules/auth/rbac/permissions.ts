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
  InvoiceArchive = 'invoice:archive', // archive: hidden from default list, visible to Admin+ or creator
  InvoiceDelete = 'invoice:delete', // soft-delete: hidden from everyone, visible to admins only
  InvoiceCancel = 'invoice:cancel',
  InvoiceView = 'invoice:view',
  InvoiceViewAllArchived = 'invoice:viewAllArchived', // see any archived/deleted invoice (else only own archived)

  // Payments
  PaymentRecord = 'payment:record',
  PaymentManage = 'payment:manage',

  // Ops
  SettingsManage = 'settings:manage',
  ReportsView = 'reports:view',
  AuditView = 'audit:view',
}
