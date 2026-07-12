# Bridgette Enterprises — Customer Support Portal & Management System

Internal management system and customer support portal for Bridgette Enterprises LLC.
Invoicing is the first core module, with support, customer, and operations management
built around it.

The invoicing module manages three independent invoice types (**Tax**, **Cash**, **PK**),
each with its own numbering sequence, template, and business rules — covering the full
lifecycle: create, track, pay, ship, generate PDFs, and audit.

## Tech stack

- **Framework:** Next.js (App Router, React Server Components, Server Actions / Route Handlers)
- **Database:** MongoDB (with Mongoose ODM)
- **Auth:** session-based, role-based access control
- **PDF:** server-side generation per invoice type
- **Money:** `Decimal128` — never floating point

## Invoice types

Number format: `{TYPE}-{YY}-{MM}-{####}` (e.g. `TAX-26-06-0001`). The `####` counter
**resets to `0001` at the start of every month**; the `MM` segment tracks the month.

| Type | Number format | Currency | Sales tax | Purpose |
| --- | --- | --- | --- | --- |
| Tax | `TAX-26-06-0001` | USD | **Yes** — full sales tax | US customers paying **by account/bank transfer**. Full invoice: bill/ship-to, line items, shipping/handling/tariff, sales tax, discount, balance due. Follows the red/black/white Bridgette template. |
| Cash | `CASH-26-06-0001` | USD | **No** | US customers, **direct cash**. Simplified: items, discount, cash received + change. No sales tax charged. |
| PK | `PK-26-06-0001` | PKR | Optional | Pakistan operations. Advance + remaining balance. No shipping/tracking yet (future). Payments recorded manually. |

## User roles

**Current scope: `Super Admin`, `Administrator`, `Accountant / Manager`.** `Sales User`
and `Read-Only User` are **future roles** — kept in the design for later, not built now.

| Role | Status | Can do |
| --- | --- | --- |
| Super Admin | current | **Seeded** on install; **cannot be deleted**. Creates anyone incl. other Admins; assigns any role. All Admin capabilities. |
| Administrator | current | Settings, templates, numbering, taxes, all invoices, reports, audit logs. Creates **non-admin** users (Accountant/Manager). **Cannot create Admins.** |
| Accountant / Manager | current | Create/edit invoices, record payments, manage tracking, reports, send/cancel invoices. **No user management.** |
| Sales User | future | Create invoices, manage assigned customers, add order/tracking details, upload docs. |
| Read-Only User | future | View, search, filter, print, download. No financial changes. |

The Super Admin is created by a seed script, is also an Admin, and is protected from
deletion at the database and application level. When an Admin or Super Admin creates a
user, the system emails an **OTP** and runs a verify → set-password flow before the
account is active. All notifications (auth, reminders, receipts) go over **SMTP email**.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, folder structure, stack decisions
- [docs/DATA-MODEL.md](docs/DATA-MODEL.md) — MongoDB collections and relationships
- [docs/BUSINESS-RULES.md](docs/BUSINESS-RULES.md) — invariants the server must enforce
- [docs/BRANDING.md](docs/BRANDING.md) — colors, logo, typography (follows bridgetteenterprises.com)
- [docs/OPEN-QUESTIONS.md](docs/OPEN-QUESTIONS.md) — items needing client confirmation before build
- `docs/Invoicing_System_Requirements.pdf` — source requirements spec (Draft 1.0, July 2026)
- `docs/Invoice Template.pdf` — reference Tax Invoice layout

## Status

Pre-development. Requirements captured; no application code yet.
