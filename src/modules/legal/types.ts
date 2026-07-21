/**
 * Shape of a legal document rendered by `components/legal/LegalDocument`. Two documents use it
 * and they are deliberately kept apart: the system Terms & Policies (how the Portal may be used)
 * and the billing Terms & Policies (how invoices and payment work). Same layout, different words.
 */

export interface LegalClause {
  heading: string;
  /** One or more paragraphs. */
  paragraphs: string[];
}

export interface LegalSection {
  /** Numbered in one running sequence across the document, e.g. "3. Acceptable Use". */
  title: string;
  clauses: LegalClause[];
}

export interface LegalDoc {
  /** Title shown on screen and in the printed PDF, e.g. "Terms & Policies". */
  title: string;
  /** One-line summary under the on-screen title. */
  subtitle: string;
  company: string;
  /** "last updated" line, e.g. "Effective 1 January 2026". */
  effective: string;
  /** Lead paragraph under the document title. */
  intro: string;
  sections: LegalSection[];
}
