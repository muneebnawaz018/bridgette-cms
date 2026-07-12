# Data Model (MongoDB)

Collections derived from the requirements spec, section 7. Money fields are
`Decimal128`. Timestamps (`createdAt`, `updatedAt`) on every collection.

## Access

- **users** — name, email (required, unique), username, passwordHash, roleId, isActive, lastLogin, createdBy.
  - `isSuperAdmin` (bool) + `isProtected` (bool) — the seeded Super Admin. `isProtected` users cannot be deleted at app or DB level.
  - Onboarding/auth: `emailVerified` (bool), `status` (`invited`|`active`|`disabled`), `mustSetPassword` (bool).
  - **Never hard-deleted** — deactivating sets `status: disabled` (`isActive: false`). Users are kept so invoice/audit records always resolve their creator.
- **otpTokens** — userId, purpose (`verifyEmail`|`resetPassword`|`login2fa`), codeHash, expiresAt, consumedAt, attempts. Backs the email-OTP onboarding + reset flows.
- **refreshTokens** — userId, tokenHash, expiresAt, revokedAt, userAgent, ip. Rotating refresh tokens for the JWT session.
- **roles** — name (`superAdmin`|`admin`|`accountant`|`sales`|`readOnly`), permissions[] (granular capability flags). Only `superAdmin` carries the "create/manage admins" permission.
- **sessions** — userId, token, expiresAt, ip, userAgent.
- **loginAttempts** — email, success, ip, at. (For rate limiting + audit.)

## Business

- **company** — name, logo, address, phone, email, website, defaultCurrency, timezone, dateFormat. (Single doc now; multi-company later.)
- **customers** — companyName, contactPerson, email, phone, taxId, preferredCurrency, defaultPaymentTerms, status (`active` | `archived`), notes.
  - Archived, not deleted, when linked to invoices.
- **customerAddresses** — customerId, type (`billing` | `shipping`), line1, city, state, postalCode, country, isDefault. (Multiple per customer.)

## Catalog

- **products** — name, sku, description, categoryId, unit, unitPrice, isTaxable, defaultTaxRate, isActive.
- **categories** — name, parentId.
- Custom invoice lines are allowed without creating a product record.

## Invoicing

- **numberingSequences** — type (`tax`|`cash`|`pk`), prefix, dateSegments (`YY-MM`), separator (`-`), length (`4`), startAt (`1`), resetPolicy (**`monthly`** — confirmed).
- **counters** — `_id` = `"{type}-{period}"`, seq. (Atomic issue — see ARCHITECTURE.)
- **invoices** — the central document:
  - `type`, `number` (**unique index**), `state` (5-state: `draft`|`pending`|`partiallyPaid`|`paid`|`overdue`)
  - `customerId` + **embedded snapshot** of bill-to / ship-to
  - `items[]`: { description, qty, unitPrice, lineTotal, isTaxable, discount } — embedded
  - `currency`, `subtotal`, `shippingHandlingTariff`, `totalBeforeTax`
  - `taxRate` (**stored per invoice**), `taxAmount`, `discount`, `grandTotal`
  - `amountPaid`, `balanceDue`
  - `issueDate`, `dueDate`, `terms`, `notes`
  - `createdBy`, `cancelledReason`
  - **Archive (never deleted):** `isArchived` (bool), `archivedBy`, `archivedAt`, `archiveReason`. Archived invoices are visible only to Admin+ or their `createdBy` — enforced in every query.
  - **Reminder / follow-up**: `reminder`: { threshold (duration — chosen from a preset dropdown), dueAt (computed = createdAt + threshold), sent (bool), sentAt, notify[] (userIds — always the Admin + the creator) }.
  - Cash-specific: `cashReceived`, `changeReturned`. **No sales tax** (US direct cash).
  - Tax-specific: full US sales tax (US account/bank customers).
  - PK-specific: `advancePayment`, `remainingBalance`. Customer invoice, uses the same `customers`. Currency PKR. Tax optional. No shipping/tracking yet — future.

## Financial

- **payments** — invoiceId, date, amount, currency, method (`cash`|`zelle`|`bank`|`paypal`|`cashapp`|`card`|`cheque`|`other`), reference, account, notes, proofAttachmentId.
- **refunds** — invoiceId, paymentId, amount, reason, date.
- **taxes** — label, rate, isActive. (Configurable; never hard-coded.)
- **discounts / charges** — reusable definitions (fixed or %, line or invoice level).
- **creditNotes** — Phase 2.

## Shipping

- **shipments** — invoiceId, carrier, shippingDate, expectedDelivery, actualDelivery, packageCount, service, cost, status (`notShipped`…`delivered`…`lost`), notes.
- **trackingNumbers** — shipmentId, number, url, status. (Multiple per invoice.)

## Documents

- **attachments** — parentType (`customer`|`invoice`|`payment`|`shipment`), parentId, fileName, mime, size, storageKey, uploadedBy, description. Bytes in object storage.
- **generatedPdfs** — invoiceId, version, storageKey, generatedAt.

## Communication

- **emailLogs** — purpose (`auth`|`reminder`|`receipt`|`invoice`), invoiceId?, toUserId?, recipients, cc, bcc, subject, status (`queued`|`sent`|`failed`), providerRef, sentAt. One log for all outbound email incl. reminder escalations.
- **notifications** — userId, type, payload, readAt.
- **reminderJobs** — invoiceId, dueAt, status (`pending`|`fired`|`cancelled`), firedAt. Drives the "after N time, send reminder email" escalation.

## Control

- **statusHistory** — invoiceId, fromStatus, toStatus, changedBy, reason, at.
- **auditLogs** — user, action, entity, entityId, oldValue, newValue, reason, at. **Append-only.**
- **settings** — key/value for tax labels, payment methods, numbering rules, policy links, retention period, SMTP/email provider config, and the **reminder threshold presets** (the dropdown time options offered at invoice creation).

## Key indexes

- `invoices.number` — **unique**
- `invoices` — compound on `{ type, status, issueDate }`, `{ customerId }`, `{ dueDate }`
- Text index for search: number, customer name/email/phone, tracking number, payment reference, item description.
- `counters._id` — unique (natural).
