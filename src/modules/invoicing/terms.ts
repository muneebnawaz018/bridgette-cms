/**
 * Billing Terms & Policies — the terms that apply to invoices, orders, and payment. This is the
 * document the invoice screens link to. It is about the *commercial relationship on an invoice*,
 * not about using the Portal software — those system terms live separately in
 * `modules/legal/systemTerms` and must not be mixed in here.
 *
 * A professional template. Clause numbers run in one sequence across all sections. Have it
 * reviewed by qualified counsel before relying on it as a binding agreement.
 */
import { COMPANY } from '@/modules/legal/company';
import type { LegalDoc } from '@/modules/legal/types';

/** Kept as a named export because the app footer and other copy still reference the entity. */
export const TERMS_COMPANY = COMPANY;

export const BILLING_TERMS: LegalDoc = {
  title: 'Billing Terms & Policies',
  subtitle: `Billing terms for invoices issued by ${COMPANY}.`,
  company: COMPANY,
  effective: 'Effective 1 January 2026',
  intro: `These Billing Terms & Policies govern invoices, orders, and payments between ${COMPANY} ("we", "us", "our") and the client named on an invoice ("you"). By accepting an invoice or placing an order you agree to these terms. Where a signed agreement exists between the parties, that agreement prevails to the extent of any conflict.`,
  sections: [
    {
      title: '1. Definitions',
      clauses: [
        {
          heading: '1.1 Key terms',
          paragraphs: [
            `"Invoice" means a bill we issue for goods or services. "Order" means an accepted request for goods or services. "Client" means the party named on an invoice. "Business day" means a day other than a weekend or public holiday in our place of registration.`,
          ],
        },
      ],
    },
    {
      title: '2. Billing & Payment',
      clauses: [
        {
          heading: '2.1 Payment terms',
          paragraphs: [
            `Unless a different due date is stated on the invoice, payment is due within thirty (30) days of the invoice date ("net 30"). Amounts are payable in the currency shown on the invoice.`,
            `Payment is treated as received only when funds have fully cleared into an account we nominate. You bear any bank, transfer, or currency-conversion charges.`,
          ],
        },
        {
          heading: '2.2 Payment methods & references',
          paragraphs: [
            `Pay using a method shown on, or agreed for, the invoice. Quote the invoice number with every payment so it can be matched. Payments that cannot be identified may be treated as unpaid until reconciled.`,
          ],
        },
        {
          heading: '2.3 Late payment',
          paragraphs: [
            `Overdue invoices may accrue interest at 1.5% per month, or the maximum rate permitted by applicable law, whichever is lower, on the outstanding balance until paid in full.`,
            `We may suspend ongoing work, services, or deliveries while an account is overdue, and may recover reasonable costs of collection, including legal and agency fees.`,
          ],
        },
        {
          heading: '2.4 Taxes & duties',
          paragraphs: [
            `Prices exclude taxes unless stated otherwise. Where sales tax, VAT, GST, or an equivalent applies, it is added to the invoice at the prevailing rate and is your responsibility.`,
            `Tax-exempt clients must supply a valid exemption certificate before an invoice is issued. Import duties, tariffs, and customs charges on cross-border orders are your responsibility.`,
          ],
        },
        {
          heading: '2.5 Deposits & advance payment',
          paragraphs: [
            `Some orders require a deposit or full advance payment before work begins or goods are dispatched. Deposits are applied against the final invoice and are non-refundable once work has commenced, except where the law requires otherwise.`,
          ],
        },
      ],
    },
    {
      title: '3. Orders & Delivery',
      clauses: [
        {
          heading: '3.1 Quotations & acceptance',
          paragraphs: [
            `Quotations are valid for thirty (30) days unless stated otherwise and are not a binding offer until we confirm them in writing. An order is accepted when we acknowledge it or when we issue the corresponding invoice.`,
          ],
        },
        {
          heading: '3.2 Delivery & risk',
          paragraphs: [
            `Delivery dates are good-faith estimates and are not guaranteed. We are not liable for delays caused by events beyond our reasonable control.`,
            `Risk in goods passes to you on delivery. Title to goods remains with us until the invoice for those goods is paid in full.`,
          ],
        },
        {
          heading: '3.3 Inspection & acceptance',
          paragraphs: [
            `You must inspect goods or deliverables on receipt and report shortages, defects, or damage in writing within ten (10) business days. Absent a timely report, the delivery is treated as accepted.`,
          ],
        },
      ],
    },
    {
      title: '4. Disputes, Refunds & Cancellation',
      clauses: [
        {
          heading: '4.1 Billing disputes',
          paragraphs: [
            `Raise any dispute about an invoice in writing within ten (10) business days of the invoice date, identifying the item and the reason. Undisputed amounts remain due on their original schedule while a disputed item is resolved in good faith.`,
          ],
        },
        {
          heading: '4.2 Refunds & adjustments',
          paragraphs: [
            `We correct a genuine billing error by issuing an adjustment or credit note against the original invoice. Agreed refunds are returned by the original payment method within a reasonable period after the adjustment is confirmed.`,
          ],
        },
        {
          heading: '4.3 Cancellation',
          paragraphs: [
            `Orders cancelled after acceptance may be charged for work already performed and for materials or third-party commitments already incurred. We may cancel an order if you are in material breach of these terms.`,
          ],
        },
      ],
    },
    {
      title: '5. Warranties & Liability',
      clauses: [
        {
          heading: '5.1 Warranties',
          paragraphs: [
            `Goods and services are provided in accordance with the specification agreed in writing. Except as expressly stated here and as required by law, all other warranties, whether express or implied, are excluded.`,
          ],
        },
        {
          heading: '5.2 Limitation of liability',
          paragraphs: [
            `To the fullest extent permitted by law, our total liability arising out of or in connection with any invoice or order is limited to the amount paid for the goods or services giving rise to the claim.`,
            `We are not liable for indirect, incidental, or consequential loss, including loss of profit, revenue, data, or business. Nothing in these terms excludes liability that cannot be excluded by law.`,
          ],
        },
        {
          heading: '5.3 Indemnity',
          paragraphs: [
            `You agree to indemnify us against claims, losses, and costs arising from your breach of these terms or your unlawful or negligent use of the goods or services supplied.`,
          ],
        },
      ],
    },
    {
      title: '6. Confidentiality & Data',
      clauses: [
        {
          heading: '6.1 Confidentiality',
          paragraphs: [
            `Invoice details, pricing, and account information are confidential between you and us and are not disclosed to third parties except as needed to process payment or comply with the law.`,
          ],
        },
        {
          heading: '6.2 Data protection',
          paragraphs: [
            `We process personal data supplied for billing only to raise and settle invoices, meet legal obligations, and maintain our records. We do not sell it. Data is retained for as long as the law and legitimate business needs require, then deleted or anonymised.`,
          ],
        },
        {
          heading: '6.3 Intellectual property',
          paragraphs: [
            `Unless agreed otherwise in writing, all intellectual property in materials and deliverables remains ours until the corresponding invoice is paid in full, at which point agreed rights transfer to you.`,
          ],
        },
      ],
    },
    {
      title: '7. General',
      clauses: [
        {
          heading: '7.1 Force majeure',
          paragraphs: [
            `Neither party is liable for failure or delay caused by events beyond its reasonable control, including natural events, war, civil unrest, labour disputes, failure of utilities or carriers, or government action.`,
          ],
        },
        {
          heading: '7.2 Governing law',
          paragraphs: [
            `These terms are governed by the laws of the jurisdiction in which ${COMPANY} is registered, and the parties submit to the exclusive jurisdiction of its courts, without regard to conflict-of-laws principles.`,
          ],
        },
        {
          heading: '7.3 Severability & waiver',
          paragraphs: [
            `If any provision is found unenforceable, the rest remain in force. A failure to enforce a provision is not a waiver of the right to enforce it later.`,
          ],
        },
        {
          heading: '7.4 Entire agreement & changes',
          paragraphs: [
            `These terms, together with the invoice and any signed agreement, are the entire agreement between the parties on their subject and supersede prior discussions.`,
            `We may update these terms from time to time. The version in effect on the date an invoice is issued governs that invoice. Material changes are communicated through the usual account channels.`,
          ],
        },
      ],
    },
  ],
};
