import { redirect } from 'next/navigation';

/**
 * Creating an invoice is a dialog on the list page now, in line with every other create flow
 * in the app. The route stays so old links and bookmarks land somewhere sensible instead of
 * a 404.
 */
export default function NewInvoiceRedirect() {
  redirect('/invoices');
}
