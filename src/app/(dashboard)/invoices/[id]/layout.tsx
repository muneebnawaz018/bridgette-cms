import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSession } from '@/modules/auth';
import { getInvoice } from '@/modules/invoicing';

// Metadata-only layout. The page itself is a Client Component and so cannot export
// `metadata`; a server layout wrapping it is the supported way to set the title.
//
// This costs one extra read of the invoice, since the client page fetches it again for the
// actual render. Accepted so that several open invoices are tellable apart by their tabs.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return { title: 'Invoice' };
    // getInvoice enforces the view permission and archive visibility itself, so a caller who
    // may not open the invoice cannot learn its number from the tab either.
    const invoice = await getInvoice(session, id);
    return { title: `Invoice ${invoice.number}` };
  } catch {
    // Missing, not visible, malformed id — the page renders its own error state for all of
    // these. A title is never worth turning one of them into a failed render.
    return { title: 'Invoice' };
  }
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
