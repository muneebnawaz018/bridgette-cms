# Architecture

## Stack

| Concern | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js (App Router) | Server components + server actions keep all money math and validation on the server, which the spec requires. |
| Database | MongoDB + Mongoose | Flexible documents suit invoices with embedded line items and per-invoice snapshots. |
| Auth | Session-based (NextAuth or custom) | RBAC; current scope 2 roles (Admin, Accountant/Manager), 2 future roles; configurable session timeout; optional 2FA. |
| Validation | Zod (shared client/server schemas) | Single source of truth for input shapes. No form library (no react-hook-form) — plain controlled inputs validated with Zod. |
| UI components | MUI (`@mui/material` + `@mui/x-data-grid`) | Ready-made components and data tables — less setup. Tables use MUI DataGrid. |
| CSS | Tailwind (preflight off) | Utility styling alongside MUI; preflight disabled so it doesn't fight MUI's baseline. |
| PDF | React-PDF or Puppeteer/Playwright | Three separate templates; must render consistently across readers. |
| File storage | S3-compatible bucket (not in DB) | Attachments up to XLSX/DOCX; store metadata in Mongo, bytes in object storage. |

## Guiding principles (from the spec)

1. **Server owns the math.** Totals, tax, and balances are recalculated server-side on every write. The client display is convenience only.
2. **Invoices are immutable history.** Each invoice stores its own tax rate and a snapshot of customer + item data. Editing a customer or product later must not change past invoices.
3. **Numbering is atomic.** Invoice numbers are issued via an atomic counter update, guarded by a unique index. No two concurrent users get the same number; cancelled numbers are never reused.
4. **Financial records are archived, never hard-deleted.** Drafts can be deleted; issued/paid invoices are cancelled/voided and stay in history.
5. **Everything financial is audited.** Append-only audit log records who/what/when/old/new/reason.
6. **Nothing is deleted, only archived.** Invoices (and users) are never removed. A bad invoice is archived with who/when/reason.
7. **Every list query is paginated and role-scoped.** All data fetching goes through a shared paginate helper (page/limit + total). The role-based visibility filter — e.g. archived invoices only for Admin+ or the creator — is applied to the DB query *before* pagination, never in the UI.

## Modular structure — features are self-contained and injectable

The app is organized as **feature modules** under `src/modules/`. Each module owns its
own models, business logic, validation, and UI — so a new feature (support tickets,
inventory, a customer portal) can be dropped in as a new folder without touching the
others. Shared plumbing lives in `src/lib/`; thin route/page files under `src/app/`
just wire modules into URLs.

```text
src/
  app/                      # Next.js routes — thin, delegate to modules
    (auth)/                 # login, forgot-password
    (dashboard)/            # authenticated shell
      dashboard/
      invoices/             # list, [id], new  (tax | cash | pk)
      customers/
      products/
      payments/
      shipments/
      reports/
      settings/
    api/                    # route handlers where server actions don't fit
  modules/                  # <-- each feature is a self-contained module
    invoicing/
      models/               # mongoose schemas for this module
      services/             # business logic (create, finalize, calc)
      schemas/              # zod input/output validation
      components/           # module-specific UI
      index.ts              # public API of the module
    customers/
    products/
    payments/
    shipments/
    audit/
    auth/                   # session + RBAC guards; Super Admin seed
    reminders/              # invoice follow-up: schedule + email escalation
    # future modules just add a folder here:
    # support/  inventory/  portal/  reporting/
  lib/                      # shared, feature-agnostic plumbing
    db/                     # mongoose connection (singleton)
    numbering/              # atomic sequence generator
    money/                  # Decimal128 helpers + rounding
    query/                  # shared paginate + role-based visibility scoping
    pdf/                    # base PDF renderer (templates live in invoicing module)
    email/                  # SMTP client + templates (auth OTP, reminders, receipts)
    scheduler/              # fires due reminderJobs (cron / queue worker)
    config/                 # env, constants
  types/                    # shared TS types
```

### Rules that keep modules injectable

- A module exposes a **public API** via its `index.ts`; other code imports from
  `@/modules/<name>`, never deep-reaches into another module's internals.
- Cross-module needs go through services, not shared mutable state.
- Adding a feature = add a folder under `modules/` + its routes under `app/`. No edits
  to existing modules required.
- Path aliases (`@/modules/*`, `@/lib/*`) are set in `tsconfig.json`.

## Numbering sequence — the critical path

`issueNumber` runs at **invoice creation** — drafts included. Every invoice gets its
number up front; keeps the model simple.

```text
counters collection:  { _id: "TAX-2026-06", seq: 42 }

issueNumber(type, period):
  doc = counters.findOneAndUpdate(
    { _id: `${type}-${period}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  )                                    # atomic — safe under concurrency
  number = format(type, period, doc.seq)
  # invoices.number has a UNIQUE index as a second line of defense
```

**Reset policy = monthly (confirmed).** The `period` segment is `{YY}-{MM}`, so a new
counter starts each month and `####` resets to `0001`. Number format:
`{TYPE}-{YY}-{MM}-{####}`, e.g. `TAX-26-06-0001`.

## Invoice reminder escalation

At creation, the user picks a reminder threshold from a preset dropdown. A
`reminderJob` is written with `dueAt = createdAt + threshold`. A scheduler
(cron/queue worker in `lib/scheduler`) polls for due jobs; when one fires and the
invoice is still open, it sends an email via `lib/email` to **both** the Admin and the
invoice's creator, then logs it in `emailLogs`. Editing or closing the invoice
reschedules or cancels the job.

## Seeding (Super Admin)

A seed script creates the single **Super Admin** on first install: `isSuperAdmin` +
`isProtected`. Delete operations refuse `isProtected` users. Only the Super Admin holds
the permission to create other Admins and assign roles.

## Auth

- **JWT** access token (short-lived) + **rotating refresh token** (longer-lived), both
  stored in **httpOnly, secure, sameSite cookies** — not readable by JS.
- Refresh tokens are persisted (`refreshTokens`) so they can be rotated and revoked;
  logout / password-reset revokes them.
- Token hardening is deliberately kept simple (per client) — rotation + httpOnly cookies
  are the priority, not elaborate token schemes.
- **User onboarding:** Admin/Super Admin creates a user → email OTP → verify → set password.
- **Forgot password:** request → single-use, expiring token emailed as a link → verify →
  set new password → invalidate the token and all existing sessions.
- **Users are never hard-deleted** — deactivate only, to preserve invoice/audit references.

## Nonfunctional targets

- Page load < 3s, invoice save < 2s, PDF < 5s, search < 3s.
- 100k+ invoices without degradation — indexed queries + pagination, never full scans.
- 99.5% availability; transactions around invoice + payment writes so nothing saves half-way.
- HTTPS, hashed passwords, rate-limited login, protection against XSS/CSRF/injection, upload scanning.
- Encrypted, retained backups (RPO 24h, RTO 4h).
