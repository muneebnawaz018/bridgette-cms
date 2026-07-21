# Bridgette Enterprises — Customer Support Portal & Management System

Internal management system and customer support portal for **Bridgette Enterprises LLC**.
Invoicing is the first core module; support, customer, and operations management are built
around it using a modular, injectable architecture.

The invoicing module manages three independent invoice types (**Tax**, **Cash**, **PK**),
each with its own monthly numbering sequence, tax rules, and template — covering the full
lifecycle: create, track payments, archive, and (planned) generate PDFs.

- **Repo:** <https://github.com/muneebnawaz018/bridgette-cms>
- **Stack:** Next.js 15 (App Router) · MongoDB / Mongoose · TypeScript · MUI · Tailwind

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Invoice types](#invoice-types)
- [Invoice state model](#invoice-state-model)
- [Roles & RBAC](#roles--rbac)
- [Authentication](#authentication)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Security](#security)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

---

## Features

- **Three invoice types** — Tax (US, always taxed), Cash (US, never taxed), PK (Pakistan,
  optional tax) — each with an independent, concurrency-safe monthly number sequence.
- **Enum-driven RBAC** — a single `Role → Permission` matrix enforced on **every API** (server)
  and mirrored to the **frontend** for hiding/disabling actions.
- **Auth** — JWT access + rotating refresh tokens in **httpOnly cookies**, email-OTP onboarding,
  forgot/reset-password flows, and a seeded, undeletable **Super Admin**.
- **Server-authoritative money math** — totals, tax, and balances are always recomputed on the
  server; the client display is convenience only.
- **5-state invoice lifecycle** — Draft → Pending → Partially Paid → Paid, plus Overdue.
- **Archive, never delete** — invoices and users are never hard-deleted; archived invoices are
  visible only to Admins or the creator, enforced at the database query level.
- **Mandatory pagination** — every list endpoint is paginated and role-scoped; longer queries use
  MongoDB aggregation pipelines (`$facet`) with compound indexes.
- **Branded UI** — MUI components + Tailwind CSS, brand theme/logo/favicon extracted from the
  official invoice template, SEO metadata, and a web manifest.

## Tech stack

| Concern          | Choice                                                     |
| ---------------- | ---------------------------------------------------------- |
| Framework        | Next.js 15 (App Router, RSC, Route Handlers)               |
| Language         | TypeScript (strict)                                        |
| Database         | MongoDB + Mongoose                                         |
| Auth             | Custom JWT (access + rotating refresh) in httpOnly cookies |
| Validation       | Zod (shared client/server schemas)                         |
| UI               | MUI (`@mui/material`, `@mui/x-data-grid`)                  |
| CSS              | Tailwind (preflight off to coexist with MUI)               |
| Email            | Nodemailer (SMTP)                                          |
| Password hashing | bcryptjs                                                   |

> **Money:** amounts are handled as numbers rounded to 2 decimals via a shared money helper.
> `Decimal128` storage at the DB edge is planned hardening.

## Architecture

Feature modules live under `src/modules/`. Each module owns its models, services, validation,
and (where relevant) UI, and exposes a public API via `index.ts`. Adding a feature means adding a
folder — no edits to existing modules. Shared plumbing lives in `src/lib/`; route/page files under
`src/app/` stay thin and delegate to modules.

Guiding principles:

1. **Server owns the math** — totals/tax/balances recomputed on every write.
2. **Nothing is deleted, only archived** — invoices and users included.
3. **Every list query is paginated and role-scoped** — visibility filter applied before pagination.
4. **RBAC everywhere** — coarse cookie gate in middleware, fine-grained `requirePermission` in
   handlers, `useCan` on the frontend.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

## Invoice types

Number format: `{TYPE}-{YY}-{MM}-{####}` (e.g. `TAX-26-06-0001`). The `####` counter **resets to
`0001` at the start of every month** via an atomic per-(type, month) MongoDB counter, so
concurrent users never receive the same number.

| Type | Example           | Currency | Sales tax | Purpose                                                                                                                                 |
| ---- | ----------------- | -------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Tax  | `TAX-26-06-0001`  | USD      | Always    | US customers paying by account/bank transfer. Full invoice with line items, shipping/handling/tariff, sales tax, discount, balance due. |
| Cash | `CASH-26-06-0001` | USD      | Never     | US customers, direct cash. Simplified: items, discount, cash received + change.                                                         |
| PK   | `PK-26-06-0001`   | PKR      | Optional  | Pakistan operations. Advance + remaining balance. Payments recorded manually.                                                           |

## Invoice state model

Five states. Payment-driven states are computed from the ledger + due date — never set by hand.

```text
Draft ──finalize──▶ Pending ──partial payment──▶ Partially Paid ──full payment──▶ Paid
                       │
                       └── unpaid & past due date ──▶ Overdue
```

Wrongly-created invoices are **archived** (with who/when/reason), never cancelled or deleted.

## Roles & RBAC

**Current scope:** Super Admin, Administrator, Accountant / Manager. Sales User and Read-Only User
are defined in the model for later, not yet granted UI.

| Role                 | Status  | Capabilities                                                                                                 |
| -------------------- | ------- | ------------------------------------------------------------------------------------------------------------ |
| Super Admin          | current | Seeded, **undeletable**. Creates anyone (incl. Admins), assigns any role. All Admin powers.                  |
| Administrator        | current | Settings, numbering, taxes, all invoices, reports, audit. Creates non-admin users. **Cannot create Admins.** |
| Accountant / Manager | current | Create/edit invoices, record payments, reports. **No user management.**                                      |
| Sales User           | future  | Create invoices, manage assigned customers, tracking.                                                        |
| Read-Only User       | future  | View / search / print only.                                                                                  |

Authorization is a single source of truth: a `Role → Permission` matrix
([policy.ts](src/modules/auth/rbac/policy.ts)) exposed as `can()` / `assertCan()`. Every API route
calls `requirePermission(...)` before its service, and the service re-checks (defense in depth). The
frontend uses `useCan()` seeded from the same matrix.

## Authentication

- **Login** issues a short-lived JWT access token + a rotating refresh token, both in
  httpOnly / secure / sameSite cookies.
- **Onboarding** — an Admin creates a user → the system emails a one-time code → the user verifies
  and sets a password → the account becomes active. Users start inactive.
- **Forgot password** — a single-use, expiring token is emailed; completing it invalidates the token
  and revokes all existing sessions.
- **Refresh** rotates the refresh token (old one revoked, new one issued and persisted hashed).
- **Users are never hard-deleted** — deactivation only, to preserve invoice/audit references.

## Project structure

```text
src/
  app/                        # Next.js routes (thin)
    (auth)/                   # login, forgot-password, set-password, reset-password
    (dashboard)/              # protected shell: dashboard, invoices, invoices/new
    api/
      auth/                   # login, logout, refresh, verify, forgot, reset, users, me
      invoices/               # list/create, [id] get/update, [id]/archive
    [...not_found]/           # catch-all → home
    layout.tsx  page.tsx  manifest.ts  icon.png  apple-icon.png
  modules/
    auth/                     # rbac, models, jwt, cookies, otp, session, service, schemas
    invoicing/                # enums, calc, numbering, state, visibility, models, service, schemas
  lib/
    db/                       # cached Mongoose connection
    money/  query/  email/  api/  config/  colors.ts  theme.ts
  components/                 # AuthCard, SessionProvider, LogoutButton
  scripts/seed.ts            # Super Admin seed
  middleware.ts              # coarse auth gate
docs/                         # architecture, data model, business rules, branding, open questions
```

## Getting started

### Prerequisites

- Node.js **20+**
- A MongoDB instance (local or Atlas)
- An SMTP account (for auth/OTP emails)

### Install & run

```bash
git clone https://github.com/muneebnawaz018/bridgette-cms.git
cd bridgette-cms
npm install

cp .env.example .env.local        # then fill in the values (see below)
npm run seed                       # creates the Super Admin
npm run dev                        # http://localhost:3000
```

Visiting `/` redirects to `/login` when signed out, or `/dashboard` when signed in. Sign in with the
seeded Super Admin credentials.

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable                                                                            | Purpose                                     |
| ----------------------------------------------------------------------------------- | ------------------------------------------- |
| `MONGODB_URI`                                                                       | MongoDB connection string                   |
| `NEXT_PUBLIC_SITE_URL`                                                              | Base URL (used in emailed links)            |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                                          | Token signing secrets (long random strings) |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`                                                | Token lifetimes (e.g. `15m`, `7d`)          |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Email transport                             |
| `SUPER_ADMIN_NAME` / `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`                   | Seeded Super Admin                          |

`.env.local` is gitignored — never commit it.

## Scripts

| Script                            | Description                               |
| --------------------------------- | ----------------------------------------- |
| `npm run dev`                     | Start the dev server (hot reload)         |
| `npm run build`                   | Production build                          |
| `npm run start`                   | Run the production build                  |
| `npm run seed`                    | Seed the Super Admin (idempotent)         |
| `npm run lint` / `lint:md`        | ESLint / markdownlint                     |
| `npm run format` / `format:check` | Prettier                                  |
| `npm run typecheck`               | `tsc --noEmit`                            |
| `npm run check`                   | typecheck + lint + md-lint + format check |

## API reference

All routes return `{ ok, data }` or `{ ok: false, error }`. Auth is via httpOnly cookies. Invoice
routes require the matching permission (`403` otherwise); unauthenticated calls get `401`.

| Method | Route                       | Permission                       | Description                           |
| ------ | --------------------------- | -------------------------------- | ------------------------------------- |
| POST   | `/api/auth/login`           | —                                | Email + password → sets cookies       |
| POST   | `/api/auth/logout`          | session                          | Revoke refresh + clear cookies        |
| POST   | `/api/auth/refresh`         | —                                | Rotate tokens                         |
| POST   | `/api/auth/verify`          | —                                | Onboarding: verify OTP + set password |
| POST   | `/api/auth/forgot`          | —                                | Email a reset link                    |
| POST   | `/api/auth/reset`           | —                                | Complete password reset               |
| GET    | `/api/auth/me`              | session                          | Current session + permissions         |
| POST   | `/api/auth/users`           | `UserCreate` / `UserCreateAdmin` | Create a user (emails OTP)            |
| GET    | `/api/invoices`             | `InvoiceView`                    | Paginated, role-scoped list           |
| POST   | `/api/invoices`             | `InvoiceCreate`                  | Create an invoice                     |
| GET    | `/api/invoices/:id`         | `InvoiceView`                    | Get one (archive visibility enforced) |
| PATCH  | `/api/invoices/:id`         | `InvoiceEdit`                    | Update + recompute totals             |
| POST   | `/api/invoices/:id/archive` | `InvoiceArchive`                 | Archive with a reason                 |

## Security

- Passwords hashed with bcrypt (cost 12).
- JWTs in httpOnly / secure / sameSite cookies; refresh tokens persisted hashed and rotated.
- RBAC enforced server-side on every mutating and reading endpoint.
- No user enumeration on forgot-password.
- Users and invoices are archived/deactivated, never hard-deleted (audit integrity).
- Secrets and `.env.local` are gitignored.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, folder structure, stack decisions
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — MongoDB collections and relationships
- [docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md) — server-enforced invariants
- [docs/BRANDING.md](docs/BRANDING.md) — colors, logo, typography
- [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) — items pending client confirmation
- `docs/Invoicing_System_Requirements.pdf` — source requirements spec
- `docs/Invoice Template.pdf` — reference Tax Invoice layout

## Roadmap

**Done:** auth (RBAC, JWT, OTP onboarding, forgot/reset, seed), invoicing (types, numbering, calc,
5-state, archive/visibility, pagination), invoice list + create UI, branded theme.

**Next:**

- Payments module — record payments → recompute state/balance
- Invoice detail + edit pages
- Reminder scheduler → email escalation (Admin + creator)
- Customers & products modules
- PDF generation per invoice type
- Dashboard analytics & reports
