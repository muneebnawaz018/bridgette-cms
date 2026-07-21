'use client';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { BILLING_TERMS } from '@/modules/invoicing/terms';

/**
 * Billing Terms & Policies — the terms that apply to invoices and payment. Linked from the
 * invoice screens. Distinct from the system Terms at /terms, which cover using the Portal.
 */
export default function BillingTermsPage() {
  return <LegalDocument doc={BILLING_TERMS} />;
}
