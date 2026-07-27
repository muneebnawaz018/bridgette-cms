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

  // Customers (reusable billing parties). Admins maintain them; every role may view/pick.
  CustomerCreate = 'customer:create',
  CustomerEdit = 'customer:edit',
  CustomerDelete = 'customer:delete', // soft-delete, admins only
  CustomerView = 'customer:view',

  // Products (catalogue + per-customer rates). Admins maintain them; every role may view/pick.
  ProductCreate = 'product:create',
  ProductEdit = 'product:edit',
  ProductDelete = 'product:delete', // soft-delete, admins only
  ProductView = 'product:view',

  // Payments
  PaymentRecord = 'payment:record',
  PaymentManage = 'payment:manage',

  // Ops
  SettingsManage = 'settings:manage',
  ReportsView = 'reports:view',
  AuditView = 'audit:view',
}
