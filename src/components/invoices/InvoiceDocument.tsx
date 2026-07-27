'use client';

import { memo } from 'react';
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
  items: { description: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  shippingHandlingTariff: number;
  totalBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
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

export function InvoiceDocument({ invoice }: { invoice: InvoiceDocumentData }) {
  const rows = invoice.items ?? [];
  const pad = Math.max(0, MIN_ROWS - rows.length);
  const typeLabel = TYPE_LABEL[invoice.type] ?? 'INVOICE';

  return (
    <div className="inv-doc">
      <style>{`
        .inv-doc { width: 820px; margin: 0 auto; background: ${PAPER}; color: ${BODY};
          font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35; }
        .inv-doc * { box-sizing: border-box; }
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
        .inv-totals { width: 350px; flex-shrink: 0; font-size: 13px; }
        .inv-totals .tr { display: flex; justify-content: flex-end; align-items: center; gap: 12px;
          padding: 6px 0; }
        .inv-totals .tr .k { font-weight: 700; text-align: right; font-size: 13px;
          white-space: nowrap; min-width: 0; }
        .inv-totals .tr .k .red { color: ${RED}; }
        .inv-totals .tr .v { flex: 0 0 110px; width: 110px; text-align: right;
          white-space: nowrap; font-size: 13px;
          border-bottom: 1px solid ${HAIR}; padding-bottom: 4px; }
        .inv-totals .grand { margin-top: 0; padding-top: 6px; }
        .inv-totals .grand .v { border-top: none; border-bottom: 2px solid ${BORDER};
          padding-top: 0; padding-bottom: 4px; font-weight: 800; font-size: 16px; }
        .inv-totals .grand .k { font-size: 16px; }
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
          @page { size: A4; margin: 12mm; }
          html, body { background: ${PAPER} !important; }
          .inv-doc { width: 100%; }
          .inv-terms a { color: ${LINK}; }
        }
      `}</style>

      <div className="inv-bar" />

      <div className="inv-head">
        <div className="inv-logo">
          <Image
            src="/brand/logo.png"
            alt="Bridgette"
            width={1978}
            height={1145}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
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
              <th style={{ width: 110 }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it, i) => (
              <tr key={i}>
                <td>{it.description}</td>
                <td className="qty">{it.quantity}</td>
                <td className="num">{usd(it.unitPrice)}</td>
                <td className="num">{usd(it.lineTotal)}</td>
              </tr>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <tr key={`pad-${i}`}>
                <td>&nbsp;</td>
                <td />
                <td />
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
          </div>

          <div className="inv-totals">
            <Total k="SUBTOTAL" v={usd(invoice.subtotal)} />
            <Total k="SHIPPING/HANDLING/TARIFF" v={usd(invoice.shippingHandlingTariff)} />
            <Total k="Discount" v={usd(invoice.discount)} />
            <Total k="TOTAL BEFORE TAX" v={usd(invoice.totalBeforeTax)} />
            <div className="tr">
              <span className="k">
                SALES <span className="red">TAX</span> ({pct(invoice.taxRate)})
              </span>
              <span className="v">{usd(invoice.taxAmount)}</span>
            </div>
            <div className="tr grand">
              <span className="k">TOTAL</span>
              <span className="v">{usd(invoice.grandTotal)}</span>
            </div>
            <Total k="AMOUNT PAID" v={usd(invoice.amountPaid)} />
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

const Party = memo(function Party({
  label,
  party,
}: {
  label: string;
  party?: { name?: string; address?: string };
}) {
  return (
    <div className="inv-party">
      <div className="lbl">{label}</div>
      <div className="nm">{party?.name || 'NAME'}</div>
      <div className="val">{party?.address || 'ADDRESS'}</div>
    </div>
  );
});

const Total = memo(function Total({
  k,
  v,
  className,
}: {
  k: string;
  v: string;
  className?: string;
}) {
  return (
    <div className={className ? `tr ${className}` : 'tr'}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
});
