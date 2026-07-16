/**
 * OpenAPI 3.1 spec for the Bridgette Portal API, hand-authored and served at
 * `/api/openapi`. Rendered by Scalar at `/api-docs`.
 *
 * Auth is via httpOnly cookies set by `/api/auth/login`, so "Try it out" works from the
 * browser once you're signed in. Invoice/user routes require the matching permission.
 */
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Bridgette Portal API',
    version: '0.1.0',
    description:
      'Invoicing & management portal API. RBAC-enforced; auth via httpOnly cookies. ' +
      'Responses are `{ ok, data }` on success or `{ ok: false, error }` on failure.',
  },
  servers: [{ url: '/', description: 'Current host' }],
  tags: [
    { name: 'Auth', description: 'Authentication & session' },
    { name: 'Users', description: 'User management (RBAC)' },
    { name: 'Invoices', description: 'Invoice CRUD (RBAC)' },
  ],
  components: {
    schemas: {
      Ok: { type: 'object', properties: { ok: { type: 'boolean' }, data: {} } },
      Error: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: false }, error: { type: 'string' }, details: {} },
      },
      Login: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
      },
      CreateUser: {
        type: 'object',
        required: ['name', 'email', 'role'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['admin', 'accountant'] },
          phone: { type: 'string' },
        },
      },
      UpdateUser: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['superAdmin', 'admin', 'accountant', 'sales', 'readOnly'] },
          status: { type: 'string', enum: ['invited', 'active', 'disabled'] },
          avatarUrl: { type: 'string', nullable: true, description: 'base64 image data URL (≤~500KB), or null to clear' },
        },
      },
      InvoiceItem: {
        type: 'object',
        required: ['description', 'quantity', 'unitPrice'],
        properties: {
          description: { type: 'string' },
          quantity: { type: 'number' },
          unitPrice: { type: 'number' },
          taxable: { type: 'boolean' },
          discount: { type: 'number' },
        },
      },
      CreateInvoice: {
        type: 'object',
        required: ['type', 'billTo', 'items'],
        properties: {
          type: { type: 'string', enum: ['tax', 'cash', 'pk'] },
          currency: { type: 'string', enum: ['USD', 'PKR'] },
          billTo: { type: 'object', properties: { name: { type: 'string' }, email: { type: 'string' } } },
          items: { type: 'array', items: { $ref: '#/components/schemas/InvoiceItem' } },
          taxRate: { type: 'number' },
          applyTax: { type: 'boolean' },
          asDraft: { type: 'boolean' },
        },
      },
      Reason: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } },
      ChangePassword: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } },
      },
      UpdateProfile: {
        type: 'object',
        description: 'At least one field required.',
        properties: { name: { type: 'string' }, phone: { type: 'string' }, avatarUrl: { type: 'string', nullable: true, description: 'base64 image data URL (≤~500KB), or null to clear' } },
      },
      RevokeSessions: {
        type: 'object',
        required: ['scope'],
        properties: { scope: { type: 'string', enum: ['others', 'all'], description: 'others = keep this device; all = sign out everywhere' } },
      },
      RequestEmailChange: {
        type: 'object',
        required: ['newEmail', 'currentPassword'],
        properties: { newEmail: { type: 'string', format: 'email' }, currentPassword: { type: 'string' } },
      },
      ConfirmEmailChange: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', description: 'Code emailed to the new address' } },
      },
    },
  },
  paths: {
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in (sets httpOnly cookies)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Login' } } } },
        responses: { 200: { description: 'OK' }, 400: { description: 'Invalid credentials' } },
      },
    },
    '/api/auth/logout': {
      post: { tags: ['Auth'], summary: 'Sign out', responses: { 200: { description: 'OK' } } },
    },
    '/api/auth/refresh': {
      post: { tags: ['Auth'], summary: 'Rotate tokens', responses: { 200: { description: 'OK' } } },
    },
    '/api/auth/verify': {
      post: { tags: ['Auth'], summary: 'Onboarding: verify OTP + set password', responses: { 200: { description: 'OK' } } },
    },
    '/api/auth/forgot': {
      post: { tags: ['Auth'], summary: 'Email a reset link', responses: { 200: { description: 'OK' } } },
    },
    '/api/auth/reset': {
      post: { tags: ['Auth'], summary: 'Complete password reset', responses: { 200: { description: 'OK' } } },
    },
    '/api/auth/me': {
      get: { tags: ['Auth'], summary: 'Current session + profile + permissions', responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } },
      patch: {
        tags: ['Auth'],
        summary: 'Update your own profile (name/phone) — requires session',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfile' } } } },
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/password': {
      post: {
        tags: ['Auth'],
        summary: 'Change your own password — verifies the current one (requires session)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ChangePassword' } } } },
        responses: { 200: { description: 'OK' }, 400: { description: 'Wrong current password' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/email/request': {
      post: {
        tags: ['Auth'],
        summary: 'Start an email change — verifies password, emails a code to the new address (requires session)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RequestEmailChange' } } } },
        responses: { 200: { description: 'Code sent' }, 400: { description: 'Wrong password / email taken' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/email/confirm': {
      post: {
        tags: ['Auth'],
        summary: 'Confirm the code and switch to the new email (requires session; rotates tokens)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/ConfirmEmailChange' } } } },
        responses: { 200: { description: 'Email updated' }, 400: { description: 'Invalid/expired code' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/sessions': {
      get: { tags: ['Auth'], summary: 'Your active sessions + recent revokes (requires session)', responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } },
    },
    '/api/auth/sessions/revoke': {
      post: {
        tags: ['Auth'],
        summary: 'Sign out other devices, or all (requires session)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/RevokeSessions' } } } },
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/auth/sessions/{jti}': {
      delete: {
        tags: ['Auth'],
        summary: 'Revoke one specific device by session id (requires session)',
        parameters: [{ name: 'jti', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } },
      },
    },
    '/api/dashboard/stats': {
      get: {
        tags: ['Invoices'],
        summary: 'Aggregated, role-scoped invoice metrics (InvoiceView)',
        description:
          'byType totals are lifetime-to-date; byState is the pipeline for the current calendar month only, and pipelineMonth is the ISO start of that month.',
        responses: {
          200: {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'integer' },
                    pipelineMonth: { type: 'string', format: 'date-time', description: 'ISO start of the month byState covers' },
                    byState: { type: 'object', additionalProperties: { type: 'integer' }, description: 'Current month only' },
                    byType: { type: 'object', additionalProperties: { type: 'object' } },
                  },
                },
              },
            },
          },
          403: { description: 'Forbidden' },
        },
      },
    },
    '/api/auth/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (UserView)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'role', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated users' }, 403: { description: 'Forbidden' } },
      },
      post: {
        tags: ['Users'],
        summary: 'Create user (UserCreate / UserCreateAdmin) — emails OTP',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUser' } } } },
        responses: { 201: { description: 'Created' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/auth/users/{id}': {
      get: { tags: ['Users'], summary: 'Get user (UserView)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      patch: {
        tags: ['Users'],
        summary: 'Update user (UserManage)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUser' } } } },
        responses: { 200: { description: 'OK' } },
      },
      delete: { tags: ['Users'], summary: 'Deactivate user (soft delete, UserManage)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
    },
    '/api/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'List invoices (InvoiceView) — paginated, role-scoped',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['tax', 'cash', 'pk'] } },
          { name: 'view', in: 'query', schema: { type: 'string', enum: ['active', 'archived', 'deleted', 'all'], default: 'active' }, description: 'archived = Admin+ or creator; deleted = admins only; all = everything the caller may see' },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filters createdAt from the start of this UTC day (inclusive)' },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' }, description: 'Filters createdAt to the end of this UTC day (inclusive)' },
        ],
        responses: { 200: { description: 'Paginated invoices' }, 403: { description: 'Forbidden' } },
      },
      post: {
        tags: ['Invoices'],
        summary: 'Create invoice (InvoiceCreate)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInvoice' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/invoices/export': {
      get: {
        tags: ['Invoices'],
        summary: 'Export invoices as a file (InvoiceView) — same filters as the list, no pagination',
        description: 'Streams the matching invoices as a download. Capped at EXPORT_LIMIT (5000) rows; check the X-Export-Truncated header to detect a clipped file.',
        parameters: [
          { name: 'format', in: 'query', required: true, schema: { type: 'string', enum: ['csv', 'xlsx', 'json'] } },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['tax', 'cash', 'pk'] } },
          { name: 'view', in: 'query', schema: { type: 'string', enum: ['active', 'archived', 'deleted', 'all'], default: 'active' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          200: {
            description: 'The export file, as an attachment',
            headers: {
              'X-Export-Count': { schema: { type: 'integer' }, description: 'Rows in the file' },
              'X-Export-Total': { schema: { type: 'integer' }, description: 'Rows matching the filters' },
              'X-Export-Truncated': { schema: { type: 'boolean' }, description: 'True when the cap clipped the file' },
            },
            content: {
              'text/csv': { schema: { type: 'string' } },
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { schema: { type: 'string', format: 'binary' } },
              'application/json': { schema: { type: 'object' } },
            },
          },
          403: { description: 'Forbidden' },
          422: { description: 'Validation failed' },
        },
      },
    },
    '/api/invoices/{id}': {
      get: { tags: ['Invoices'], summary: 'Get invoice (InvoiceView)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      patch: { tags: ['Invoices'], summary: 'Update invoice (InvoiceEdit)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      delete: {
        tags: ['Invoices'],
        summary: 'Soft-delete invoice (InvoiceDelete) — hidden from all but admins, never removed',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Reason' } } } },
        responses: { 200: { description: 'OK' }, 403: { description: 'Forbidden' } },
      },
    },
    '/api/invoices/{id}/payments': {
      get: {
        tags: ['Invoices'],
        summary: 'List payments for an invoice (InvoiceView)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Payment ledger' } },
      },
      post: {
        tags: ['Invoices'],
        summary: 'Record a payment (PaymentRecord) — recomputes balance + state',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['amount', 'method'],
                properties: {
                  amount: { type: 'number' },
                  method: { type: 'string' },
                  reference: { type: 'string' },
                  allowOverpay: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Recorded' }, 400: { description: 'Overpayment / invalid' } },
      },
    },
    '/api/invoices/{id}/archive': {
      post: {
        tags: ['Invoices'],
        summary: 'Archive invoice (InvoiceArchive) — never deletes',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Reason' } } } },
        responses: { 200: { description: 'OK' } },
      },
    },
  },
} as const;
