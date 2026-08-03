import Image from 'next/image';
import { COMPANY_CONTACT, INVOICE_TERMS } from '@/modules/legal/company';
import { InvoiceType } from '@/modules/invoicing/enums';
import { formatMoney } from '@/lib/format/money';
import { colors } from '@/lib/colors';

/*
 * The printable invoice document — a pixel replica of the company's invoice template. Built
 * entirely in code (no image), but the header band reads as a fixed masthead. Styled with inline
 * styles + a scoped <style> so it renders identically on screen and in the browser's Print →
 * Save as PDF, independent of the app's MUI theme.
 *
 * Deliberately NOT a client component. The PDF renderer calls it directly on the server through
 * renderToStaticMarkup, and a 'use client' module reaches server code as a reference proxy rather
 * than a function — calling it throws "Attempted to call InvoiceDocument() from the server". It
 * needs no client behaviour anyway: no state, no effects, no handlers. Client pages can still
 * import it, which is why the memo() wrappers were dropped — memo has no meaning in a server
 * component, and it is a static sheet with nothing to re-render.
 */

const D = colors.invoiceDoc;
const RED = D.red;
const HEADER_BG = D.headerBg;
const PINK = D.pink;
const BORDER = D.tableBorder;
const LINK = D.link;
const PAPER = D.paper;
const BODY = D.bodyText;
const META = D.metaText;
const CELL = D.cellText;
const MUTED = D.muted;
const FAINT = D.faint;
const HAIR = D.hairline;

export interface InvoiceDocumentData {
  number: string;
  type: InvoiceType;
  issueDate?: string | Date;
  dueDate?: string | Date;
  billTo?: { name?: string; email?: string; phone?: string; address?: string };
  shipTo?: { name?: string; email?: string; phone?: string; address?: string };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    /** Percent off this line. Absent or 0 on invoices raised before line discounts existed. */
    discountPercent?: number;
    lineTotal: number;
  }[];
  subtotal: number;
  shippingHandlingTariff: number;
  totalBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  /** Whether the billed party is a tax-exempt reseller. Stated under the terms. */
  reseller?: boolean;
}

/** Header label per invoice type (top-right masthead). */
const TYPE_LABEL: Record<InvoiceType, string> = {
  [InvoiceType.Tax]: 'TAX INVOICE',
  [InvoiceType.Cash]: 'CASH INVOICE',
  [InvoiceType.PK]: 'INVOICE',
};

/** DD-MM-YYYY, matching the template's date format. */
function fmtDate(d?: string | Date): string {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

const usd = (n: number) => formatMoney('USD', Number(n ?? 0));
const pct = (r: number) => `${Number((Number(r ?? 0) * 100).toFixed(4))}%`;

// The "For Cashapp/Paypal" line adds a 0.03% processing surcharge to the balance by default.
export const CASHAPP_SURCHARGE = 0.0003;
// Rate shown in the label, e.g. "0.03%".
export const CASHAPP_PCT = `${Number((CASHAPP_SURCHARGE * 100).toFixed(4))}%`;
export const cashappAmount = (base: number) =>
  Math.round(Number(base ?? 0) * (1 + CASHAPP_SURCHARGE) * 100) / 100;

// Empty rows padded onto the item table so it keeps the template's blocked-out look.
const MIN_ROWS = 8;

export function InvoiceDocument({
  invoice,
  logoSrc,
}: {
  invoice: InvoiceDocumentData;
  /**
   * A self-contained logo source (data: URI) for the PDF renderer. next/image emits a
   * `/_next/image?url=…` reference that only resolves inside a running Next server, so the
   * headless browser would either fetch it over the network or print a gap. Given this, the
   * markup falls back to a plain <img> and the sheet needs nothing but itself.
   */
  logoSrc?: string;
}) {
  const rows = invoice.items ?? [];
  const pad = Math.max(0, MIN_ROWS - rows.length);
  // The column only earns its width when something is actually discounted — most invoices would
  // otherwise print a column of dashes.
  const hasLineDiscount = rows.some((it) => (it.discountPercent ?? 0) > 0);
  /* Whether this invoice actually carries sales tax. A cash invoice never does, and a reseller is
     exempt on the ones that otherwise would, so the rate alone does not answer it. */
  const taxed = invoice.taxRate > 0 && invoice.taxAmount > 0;
  const typeLabel = TYPE_LABEL[invoice.type] ?? 'INVOICE';

  return (
    <div className="inv-doc">
      <style>{`
        /* max-width, not just width: without it the whole narrow-screen block below is dead —
           the rules fire but the document stays 820px wide and scrolls sideways inside its card,
           stacked content and all. Matches InvoiceTemplateForm, its editable twin. */
        .inv-doc { width: 820px; max-width: 100%; margin: 0 auto; background: ${PAPER}; color: ${BODY};
          font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
        .inv-doc, .inv-doc * { box-sizing: border-box; }
        .inv-bar { height: 14px; background: ${RED}; }
        .inv-head { display: flex; align-items: center; gap: 20px; background: ${HEADER_BG};
          padding: 20px 26px; }
        .inv-logo { width: 130px; flex-shrink: 0; }
        .inv-logo img { width: 100%; height: auto; display: block; }
        .inv-co { flex-grow: 1; min-width: 0; }
        .inv-co h1 { margin: 0 0 10px; font-size: 25px; font-weight: 800; letter-spacing: .2px; }
        .inv-co p { margin: 2px 0; font-weight: 700; font-size: 14px; }
        .inv-co .gap { height: 10px; }
        .inv-meta { text-align: right; flex-shrink: 0; min-width: 150px; }
        .inv-meta .big { font-size: 26px; color: ${FAINT}; font-weight: 500; line-height: 1.05; }
        .inv-meta .row { font-size: 11px; font-weight: 700; color: ${META}; padding: 3px 0;
          text-align: right; }
        .inv-body { padding: 22px 26px 0; }
        .inv-parties { display: flex; gap: 40px; margin-bottom: 16px; }
        .inv-party { flex: 1; }
        .inv-party .lbl { color: ${RED}; font-size: 10px; font-weight: 700; letter-spacing: .12em;
          border-bottom: 2px solid ${HAIR}; padding-bottom: 4px; margin-bottom: 8px; }
        .inv-party .nm { font-weight: 700; }
        .inv-party .val { color: ${CELL}; margin-top: 2px; white-space: pre-line; }
        table.inv-items { width: 100%; border-collapse: collapse; }
        table.inv-items th { background: ${RED}; color: ${PAPER}; font-size: 11px; padding: 6px 8px;
          border: 1px solid ${RED}; text-align: center; }
        table.inv-items th.desc { text-align: center; }
        table.inv-items td { border: 1px solid ${BORDER}; padding: 6px 8px; height: 26px;
          vertical-align: top; }
        table.inv-items td.num { text-align: right; white-space: nowrap; }
        table.inv-items td.qty { text-align: center; }
        .inv-lower { display: flex; gap: 30px; margin-top: 10px; }
        .inv-terms { flex: 1; font-size: 12px; }
        .inv-terms .h { font-weight: 400; }
        .inv-terms a { color: ${LINK}; text-decoration: underline; word-break: break-all; }
        .inv-taxstatus { margin-top: 10px; font-size: 11px; font-weight: 700; color: ${MUTED}; }
        .inv-taxstatus.exempt { color: ${RED}; }
        .inv-totals { width: 350px; flex-shrink: 0; font-size: 13px; }
        /*
         * The totals block is a two-column table of fixed-height rows. Every value cell fills its
         * row, so a rule is always the row's own edge and can never crowd the number above or
         * below it. Mirrors InvoiceTemplateForm, which has to look identical.
         */
        .inv-totals .tr { display: flex; justify-content: flex-end; align-items: stretch;
          gap: 12px; height: 34px; }
        .inv-totals .tr .k { flex: 1 1 auto; align-self: center; font-weight: 700;
          text-align: right; font-size: 13px; white-space: nowrap; min-width: 0; }
        .inv-totals .tr .k .red { color: ${RED}; }
        /* The value box hugs its text: 20px tall (13px text centred → ~3px to each rule) and
           centred in the 34px row, so a rule sits tight against its own value and level with its
           own label — 7px clear of the row edge, never near the row above. */
        .inv-totals .tr .v { flex: 0 0 110px; width: 110px; align-self: center; height: 20px;
          display: flex; align-items: center;
          justify-content: flex-end; text-align: right; white-space: nowrap; font-size: 13px;
          line-height: 1; padding: 0 6px 0 0; }
        /* Rules are opt-in per row, so the block reads as the template's grouped boxes rather
           than one underline per line. */
        .inv-totals .tr .v.line-top { border-top: 1px solid ${HAIR}; }
        .inv-totals .tr .v.line-bottom { border-bottom: 1px solid ${HAIR}; }
        /* NET TOTAL and NET TOTAL + Tax: the whole row boxed, on the same 34px rhythm. */
        .inv-totals .boxed { border: 1.5px solid ${BORDER}; }
        /* Untaxed, the two boxed rows sit flush and their touching edges read as one 3px rule
           against 1.5px everywhere else. Pull the second up so the shared edge is drawn once. */
        .inv-totals .boxed + .boxed { margin-top: -1.5px; }
        .inv-totals .boxed .k { padding-left: 10px; }
        .inv-totals .boxed .k, .inv-totals .boxed .v { font-weight: 800; }
        .inv-totals .pay-rule { border-bottom: 2px solid ${BORDER}; margin: 2px 0 8px; }
        .inv-totals .bal { background: ${PINK}; padding: 8px; margin-top: 8px;
          display: flex; justify-content: flex-end; align-items: center; gap: 16px; }
        .inv-totals .bal .k { text-align: right; font-weight: 700; }
        .inv-totals .bal .k small { display: block; font-weight: 400; font-size: 10px; color: ${MUTED}; }
        .inv-totals .bal .v { width: 90px; text-align: right; font-weight: 800; }
        .inv-totals .cashapp { background: ${RED}; color: ${PAPER}; padding: 5px 8px; margin-top: 6px;
          display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
        .inv-foot-bar { height: 16px; background: ${RED}; margin-top: 28px; }
        /* Narrow screens: the fixed masthead/columns stack instead of cramping. */
        @media (max-width: 640px) {
          .inv-head { flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px; }
          .inv-logo { width: 110px; }
          .inv-co h1 { font-size: 20px; margin-bottom: 6px; }
          .inv-co p { font-size: 12px; }
          .inv-meta { text-align: left; min-width: 0; }
          .inv-meta .big { font-size: 22px; }
          .inv-meta .row { text-align: left; }
          .inv-body { padding: 16px 16px 0; }
          .inv-parties { flex-direction: column; gap: 16px; margin-bottom: 12px; }
          .inv-lower { flex-direction: column; gap: 18px; }
          .inv-totals { width: 100%; }
          table.inv-items th, table.inv-items td { font-size: 10px; padding: 4px 5px; }
        }
        @media print {
          /* margin: 0 is what removes the browser's own header and footer — the date, the page
             title, the localhost URL and "1/1". They are drawn into the page margin, so a page
             with no margin has nowhere to put them. The document then supplies the physical
             margin itself as padding, which looks identical and prints nothing extra. */
          @page { size: A4; margin: 0; }
          html, body { background: ${PAPER} !important; }
          .inv-doc { width: 100%; padding: 12mm 10mm; }
          .inv-terms a { color: ${LINK}; }
          /* Chrome defaults to dropping background colour when printing, and its "Background
             graphics" checkbox is off by default — which strips the masthead, the table header
             and the balance strip, leaving a document that does not look like the invoice at
             all. These are structure here, not decoration, so the sheet insists on them. */
          .inv-doc, .inv-doc * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="inv-bar" />

      <div className="inv-head">
        <div className="inv-logo">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt="Bridgette" style={{ width: '100%', height: 'auto' }} />
          ) : (
            <Image
              src="/brand/logo.png"
              alt="Bridgette"
              width={1978}
              height={1145}
              priority
              style={{ width: '100%', height: 'auto' }}
            />
          )}
        </div>
        <div className="inv-co">
          <h1>{COMPANY_CONTACT.name}</h1>
          <p>{COMPANY_CONTACT.addressLine1}</p>
          <p>{COMPANY_CONTACT.addressLine2}</p>
          <div className="gap" />
          <p>{COMPANY_CONTACT.phone}</p>
          <p>{COMPANY_CONTACT.email}</p>
        </div>
        <div className="inv-meta">
          <div className="big">{typeLabel}</div>
          <div className="row">DATE: {fmtDate(invoice.issueDate)}</div>
          {/* The form has always shown a due date; the customer's copy did not, which is the one
              place it actually decides anything. */}
          {invoice.dueDate && <div className="row">DUE: {fmtDate(invoice.dueDate)}</div>}
          <div className="row">INVOICE NO: {invoice.number}</div>
        </div>
      </div>

      <div className="inv-body">
        <div className="inv-parties">
          <Party label="BILL TO" party={invoice.billTo} />
          <Party label="SHIP TO" party={invoice.shipTo} />
        </div>

        <table className="inv-items">
          <thead>
            <tr>
              <th className="desc">DESCRIPTION</th>
              <th style={{ width: 70 }}>QTY</th>
              <th style={{ width: 110 }}>UNIT PRICE</th>
              {hasLineDiscount && <th style={{ width: 70 }}>DISC %</th>}
              <th style={{ width: 110 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it, i) => (
              <tr key={i}>
                <td>{it.description}</td>
                <td className="qty">{it.quantity}</td>
                <td className="num">{usd(it.unitPrice)}</td>
                {hasLineDiscount && (
                  <td className="qty">{it.discountPercent ? `${it.discountPercent}%` : '—'}</td>
                )}
                <td className="num">{usd(it.lineTotal)}</td>
              </tr>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <tr key={`pad-${i}`}>
                <td>&nbsp;</td>
                <td />
                <td />
                {hasLineDiscount && <td />}
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="inv-lower">
          <div className="inv-terms">
            <div className="h">Terms &amp; Condition:</div>
            {INVOICE_TERMS.map((t) => (
              <div key={t.label}>
                {t.label}:{' '}
                <a href={t.url} target="_blank" rel="noreferrer">
                  {t.url}
                </a>
              </div>
            ))}
            {/* Printed twin of the same line on the form: names the rate and whether it was
                charged, so a zero tax row is never left to be guessed at. */}
            <div className={invoice.reseller ? 'inv-taxstatus exempt' : 'inv-taxstatus'}>
              {invoice.reseller
                ? 'Reseller: tax-exempt, no sales tax.'
                : taxed
                  ? `Not a reseller: sales tax ${pct(invoice.taxRate)} applied.`
                  : 'Not a reseller, but this invoice type is not taxed.'}
            </div>
          </div>

          <div className="inv-totals">
            {/*
              Row order and rules follow the client's template exactly: charges accumulate to a
              boxed NET TOTAL, tax is shown as rate then amount, and the two combine into the
              boxed NET TOTAL + Tax that the payment and balance hang off.
            */}
            <Total k="SUBTOTAL" v={usd(invoice.subtotal)} vClass="line-bottom" />
            <Total
              k="SHIPPING/HANDLING/TARIFF"
              v={usd(invoice.shippingHandlingTariff)}
              vClass="line-bottom"
            />
            <Total k="Discount" v={usd(invoice.discount)} vClass="line-bottom" />
            <Total k="NET TOTAL" v={usd(invoice.totalBeforeTax)} className="boxed" />
            {/* The rate rides in the label and the column stays money throughout, matching the
                form. Dropped entirely on an untaxed invoice, along with the "+ Tax" on the total
                below it, which would otherwise repeat the NET TOTAL box exactly. */}
            {taxed && (
              <div className="tr">
                <span className="k">
                  SALES <span className="red">TAX</span> ({pct(invoice.taxRate)})
                </span>
                <span className="v line-bottom">{usd(invoice.taxAmount)}</span>
              </div>
            )}
            <Total
              k={taxed ? 'NET TOTAL + Tax' : 'TOTAL'}
              v={usd(invoice.grandTotal)}
              className="boxed"
            />
            {/* PAYMENT stays blank until something is actually paid, as on the template. */}
            <Total k="PAYMENT" v={invoice.amountPaid > 0 ? usd(invoice.amountPaid) : ''} />
            <div className="pay-rule" />
            <div className="bal">
              <span className="k">
                Balance Due
                <small>Zelle/Direct Bank</small>
              </span>
              <span className="v">{usd(invoice.balanceDue)}</span>
            </div>
            <div className="cashapp">
              <span>For Cashapp/Paypal ({CASHAPP_PCT})</span>
              <span>{usd(cashappAmount(invoice.balanceDue))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="inv-foot-bar" />
    </div>
  );
}

function Party({ label, party }: { label: string; party?: { name?: string; address?: string } }) {
  return (
    <div className="inv-party">
      <div className="lbl">{label}</div>
      <div className="nm">{party?.name || 'NAME'}</div>
      <div className="val">{party?.address || 'ADDRESS'}</div>
    </div>
  );
}

function Total({
  k,
  v,
  className,
  vClass,
}: {
  k: string;
  v: string;
  className?: string;
  /** Which rules this row's value carries: 'line-top', 'line-bottom', or both. */
  vClass?: string;
}) {
  return (
    <div className={className ? `tr ${className}` : 'tr'}>
      <span className="k">{k}</span>
      <span className={vClass ? `v ${vClass}` : 'v'}>{v}</span>
    </div>
  );
}
