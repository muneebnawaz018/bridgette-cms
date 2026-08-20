# Business Rules (server-enforced invariants)

From spec section 5, plus payment/tax/status logic. These must be enforced on the
server, not just the UI. Each should have an automated test.

1. Every invoice has a unique number, assigned at **creation** (drafts included). Keep it simple: create → get the next number in that type's monthly sequence.
2. Each invoice type uses a separate numbering sequence.
3. Finalized invoice numbers are never reused (incl. cancelled/deleted).
4. Invoice totals are calculated and validated by the server.
5. `balanceDue = grandTotal − valid payments − credits`.
6. Zero balance → status `Paid`.
7. Positive balance past `dueDate` → status `Overdue`.
8. Paid invoices cannot be permanently deleted (cancel/void only).
9. Financial changes to issued invoices are audited (with reason).
10. Tax rate is stored on the invoice at issue time; later tax-config changes don't alter it.
11. Deleted attachments on financial records remain auditable/recoverable.
12. An invoice can't be marked Paid without a payment record — unless an authorized user gives a reason (audited).
13. Cancelled/void invoices stay visible in history and reports.
14. Currency values follow the selected currency's rounding rules.
15. Concurrent users never receive the same invoice number.
16. The **Super Admin** is seeded on install, is also an Admin, and **can never be deleted** (guarded at app + DB level via `isProtected`).
17. **Role hierarchy for user creation:** Super Admin creates anyone (incl. Admins) and assigns any role. Admin creates only **non-admin** users (Accountant/Manager). Accountant/Manager cannot manage users. Others cannot.
18. **Tax invoice** always charges US sales tax. **Cash invoice** never charges sales tax. **PK invoice** tax is optional.
19. On invoice creation, a reminder threshold is chosen from a preset dropdown. When that time elapses and the invoice is still open, an **email** is sent to **both** the Admin and the invoice's creator. Each reminder is logged.
20. New users are onboarded via **email OTP**: create → email OTP → verify → set password. The account is inactive until verified.
21. All system notifications use **SMTP email** (auth, reminders, receipts). No WhatsApp/SMS.
22. **Users are never hard-deleted.** Removal = deactivate (`status: disabled`), so invoice and audit records always keep a valid creator/actor reference. (Super Admin can't even be deactivated.)
23. **Auth:** JWT access token + rotating refresh token, both in **httpOnly cookies**. Forgot-password runs a secure single-use, expiring **token** flow (request → emailed token link → verify → set new password → invalidate token + existing sessions).
24. **Invoices are never deleted** — a wrongly-created invoice is **archived** instead (creation is manual). Archiving records who + when + reason.
25. **Archived invoices are visible only to an Admin (or above) OR the user who created that invoice.** Everyone else does not see them. Search and filter must enforce this at the query level, not just the UI.
26. **All list/data fetching is paginated.** No unbounded queries — every list endpoint takes page/limit and returns a total count, and applies the role-based visibility scope before paginating.
27. **A customer's default invoice type is derived, never chosen.** Pakistan → PK, US reseller → Cash (never carries sales tax), US non-reseller → Tax. It follows from the billing country and the reseller flag on every write, whether staff typed the record in or the customer filled in their own intake link. Neither form shows the field, and `invoiceType` on the customer API is accepted but ignored. An individual invoice can still be raised as another type.
28. **A Pakistani customer is never a reseller.** A resale certificate exempts US sales tax, which PK invoices do not charge, so there is nothing for it to exempt. The reseller field is disabled for a PK address, an intake submission pairing one with a certificate is rejected, and moving an existing customer to Pakistan clears the flag — the certificate itself is kept as evidence for invoices already raised under it.
29. **An invitation link creates a customer; it never edits one.** There are two ways a customer exists: staff type the record in, or staff issue a one-time invitation and the person fills it in themselves. A customer already on file is never sent a link, and a submission whose email already belongs to a live customer is refused — the form tells them to get in touch. A link is spent only when it actually creates a customer: a refused or failed submission leaves it usable, so a mistyped address costs a correction rather than a new invitation. So a forwarded URL, or one sitting in a shared inbox, can never rewrite billing details staff verified. What does arrive through a link is applied on arrival, since the record did not exist a moment before, and the submission is kept as the evidence behind it.
30. **A customer may hold up to 15 teams.** Free-text names typed on the customer record — staff on the customer form, or the customer themselves through their invitation. Blanks are dropped and repeats removed case-insensitively ("Varsity" and "varsity" are one team, first spelling kept) before the cap is checked, so re-adding a name already there can never be what pushes a record over it.

## Derived calculation rules

- `taxableAmount = taxableSubtotal + taxableCharges − applicableDiscount`
- `taxAmount = taxableAmount × taxRate`
- Payment statuses (`Pending` / `Partially Paid` / `Paid` / `Refunded`) are computed
  from the payment ledger, not set by hand. Manual override requires a reason + audit entry.
- Overpayment is blocked unless explicitly permitted.

## State model (5 states)

`Draft → Pending → Partially Paid → Paid`, with `Overdue` for finalized+unpaid past the due date.

- **Draft** — partially created, not finalized. Editable freely.
- **Pending** — finalized, no payment yet.
- **Partially Paid** — some payment received, balance remains.
- **Paid** — balance zero.
- **Overdue** — finalized, unpaid balance past `dueDate`.

Payment-driven states (Pending/PartiallyPaid/Paid/Overdue) are computed from the ledger +
due date, never set by hand. Wrongly-created invoices are **archived** (never cancelled/deleted).
