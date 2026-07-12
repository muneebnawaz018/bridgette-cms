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
      get: { tags: ['Auth'], summary: 'Current session + permissions', responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } },
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
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated invoices' } },
      },
      post: {
        tags: ['Invoices'],
        summary: 'Create invoice (InvoiceCreate)',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInvoice' } } } },
        responses: { 201: { description: 'Created' } },
      },
    },
    '/api/invoices/{id}': {
      get: { tags: ['Invoices'], summary: 'Get invoice (InvoiceView)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      patch: { tags: ['Invoices'], summary: 'Update invoice (InvoiceEdit)', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
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
