import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoices/InvoiceDocument';
import { withBrowser } from '@/lib/pdf/browser';

/*
 * Invoice → PDF.
 *
 * The sheet is rendered from InvoiceDocument, the very component the app and the print page show,
 * so the file a customer receives cannot drift from what staff approved on screen. A hand-built
 * PDF layout would have been lighter and would have started disagreeing with the UI the first
 * time either changed.
 *
 * The markup is handed to Chromium directly rather than pointing it at a URL: there is no page to
 * authenticate, no token to mint and expire, and no dependency on the deployment being reachable
 * from inside its own function.
 */

/** Cached across invocations — the logo is ~100KB and never changes within a deploy. */
let logoDataUri: string | null = null;

async function getLogoDataUri(): Promise<string> {
  if (logoDataUri) return logoDataUri;
  const file = await readFile(path.join(process.cwd(), 'public', 'brand', 'logo.png'));
  logoDataUri = `data:image/png;base64,${file.toString('base64')}`;
  return logoDataUri;
}

/** The full document, styles and image included, with nothing left to fetch. */
async function invoiceHtml(invoice: InvoiceDocumentData): Promise<string> {
  /*
   * Imported here rather than at the top of the file. Next scans a route's static import graph
   * for react-dom/server and refuses the build outright — it assumes anything reaching for it is
   * trying to hand-render a component tree that should have been a Server Component. This is the
   * exception it does not model: markup destined for a headless browser, not for the response.
   * Behind an await, it is outside that graph and only ever loaded when a PDF is actually made.
   */
  const { renderToStaticMarkup } = await import('react-dom/server');
  const body = renderToStaticMarkup(
    <InvoiceDocument invoice={invoice} logoSrc={await getLogoDataUri()} />,
  );
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      /* The sheet sets its own width; the page around it just has to not interfere. */
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; background: #fff; }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

/**
 * Render one invoice to a PDF buffer.
 *
 * `printBackground` is not optional here: the masthead, the table header and the balance strip
 * are all background colour. Without it the document prints as an unrecognisable skeleton.
 */
export async function renderInvoicePdf(invoice: InvoiceDocumentData): Promise<Buffer> {
  const html = await invoiceHtml(invoice);

  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    // 'load' rather than 'networkidle0': everything is inline, so there is no network to idle
    // and waiting for one would just add a fixed 500ms to every render.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      /*
       * No margin here on purpose. The document's own print stylesheet sets `@page { margin: 0 }`
       * — which is what stops a browser printing its header/footer into the margin — and pads
       * itself instead. Setting a margin here too would apply it a second time.
       */
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    });
    return Buffer.from(pdf);
  });
}

/** `invoice-TAX-26-08-0001.pdf` — safe on every filesystem and obvious in a mail client. */
export function invoicePdfFilename(number: string): string {
  return `invoice-${String(number).replace(/[^a-zA-Z0-9-_]/g, '-')}.pdf`;
}
