# Open Questions (confirm before / during build)

From spec section 9, plus stack-specific gaps. All schema-blocking items are resolved;
remaining items are business-logic / scope choices that can be settled during build.

## Resolved

- [x] **Numbering format** — `TAX-26-06-0001` (`{TYPE}-{YY}-{MM}-{####}`). Same pattern for `CASH-` and `PK-`.
- [x] **Sequence reset** — **monthly**. `MM` segment updates each month; the `####` counter resets to `0001` at the start of every month.
- [x] **Number assignment timing** — at **draft creation**. Every invoice (drafts included) gets a sequence number the moment it's created. Simple monotonic sequence per type per month.
- [x] **PK Invoice** — defined:
  - **Customer invoice** (we bill the customer). Uses the same `customers` list.
  - **Multi-currency** — PKR **and** USD (business operates in Pakistan + USA). Currency picked per invoice; payment handled **manually** for now.
  - **Tax fields optional** — present but not required.
  - **No shipping/tracking** for now — future feature.
  - Format `PK-26-06-0001` is fine. No FBR/special legal format; only the shared Bridgette invoice template applies.
- [x] **Tax per type** — Tax invoice **always** taxed (US account/bank customers); Cash invoice **never** taxed (US direct cash); PK **optional**.
- [x] **Currencies** — Tax/Cash = USD; PK = PKR. Payments recorded manually for now.
- [x] **Super Admin** — seeded, undeletable, sole creator of Admins + roles. Regular Admin cannot create Admins.
- [x] **Role hierarchy** — Super Admin creates anyone (incl. Admins). Admin creates **non-admin** users (Accountant/Manager) but not Admins. Accountant/Manager have **no** user-management.
- [x] **User onboarding** — when an Admin/Super Admin creates a user, the system sends an **email OTP** with a proper verify → set-password auth flow.
- [x] **Notification channel** — **SMTP email** everywhere (reminders, receipts, auth). No WhatsApp.

## Reminder escalation — via email (confirm details)

Channel decided: **SMTP email** (not WhatsApp). Email is already required for auth.

- [ ] Exact **threshold preset values** for the dropdown (e.g. 1h / 24h / 3d / 7d?).
- [ ] What counts as "still open" when the timer fires — any non-paid status, or specific ones?
- [ ] Should the reminder repeat, or fire once only?
- [ ] Besides Admin + creator, notify anyone else (e.g. Super Admin)?
- [ ] SMTP provider / credentials (e.g. SendGrid, SES, Gmail SMTP).

## Business logic

- [ ] Exact tax calculation rules (line-level vs invoice-level as default; rounding).
- [ ] Are credit notes required for correcting issued invoices in Phase 1, or Phase 2?
- [ ] Final roles + permission matrix (granular flags per role).
- [ ] Record-retention period.

## Scope / integrations

- [ ] Is inventory in scope?
- [ ] Emailing invoices directly from the system — Phase 1 or Phase 2?
- [ ] Multiple businesses / branches — needed now or future-proof only?
- [ ] Which accounting / payment / shipping integrations, and when?

## Resolved (stack)

- [x] **Auth** — custom **JWT** (access + rotating refresh) in **httpOnly cookies**. Forgot-password via secure single-use token. Email OTP onboarding.
- [x] **Notifications** — SMTP email via **nodemailer**.
- [x] **User deletion** — soft only (deactivate); never hard-delete.

## Stack decisions (still open)

- [ ] 2FA in Phase 1, or later?
- [ ] Attachment storage target (S3 / R2 / other).
- [ ] Hosting + backup provider (drives RPO/RTO of 24h/4h).
