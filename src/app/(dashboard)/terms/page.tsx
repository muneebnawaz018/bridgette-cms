'use client';

import { LegalDocument } from '@/components/legal/LegalDocument';
import { SYSTEM_TERMS } from '@/modules/legal/systemTerms';

/**
 * System Terms & Policies — the rules for using the Portal itself. Linked from the app footer.
 * Distinct from the Billing Terms at /billing-terms, which cover invoices and payment.
 */
export default function TermsPage() {
  return <LegalDocument doc={SYSTEM_TERMS} />;
}
