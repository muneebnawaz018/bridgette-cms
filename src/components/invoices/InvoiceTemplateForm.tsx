'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import { COMPANY_CONTACT, INVOICE_TERMS } from '@/modules/legal/company';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import type { CalcResult } from '@/modules/invoicing/calc';
import { formatMoney } from '@/lib/format/money';
import { formatPhone } from '@/lib/format/countries';
import { cashappAmount, CASHAPP_PCT } from '@/components/invoices/InvoiceDocument';
import { colors } from '@/lib/colors';
import type { FieldErrors } from '@/lib/form/errors';

/*
 * The New / draft-edit invoice form, laid out AS the printed template so what you fill in reads
 * exactly like what prints (see InvoiceDocument, the read-only twin). The red masthead and the
 * terms block are fixed; every white area is an input. Totals recompute live from `preview`.
 */

const D = colors.invoiceDoc;
const RED = D.red;
const HEADER_BG = D.headerBg;
const PINK = D.pink;
const BORDER = D.tableBorder;
const LINK = D.link;
const FOCUS = D.focus;
const PAPER = D.paper;
const BODY = D.bodyText;
const META = D.metaText;
const CELL = D.cellText;
const MUTED = D.muted;
const FAINT = D.faint;
const HAIR = D.hairline;
const FIELD = D.fieldBorder;
const CONTROL_BG = D.controlBg;
const PLACEH = D.placeholder;

export interface TemplateLine {
  productId?: string;
  productName?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface TemplateForm {
  type: InvoiceType;
  billName: string;
  billEmail: string;
  billPhone: string;
  billAddress: string;
  shipName: string;
  shipAddress: string;
  items: TemplateLine[];
  reseller: boolean;
  applyTax: boolean;
  taxPercent: number;
  shippingHandling: number;
  discount: number;
  issueDate: string;
  dueDate: string;
  notes: string;
}

export interface CustomerOption {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  reseller?: boolean;
  invoiceType?: InvoiceType;
}
export interface ProductOption {
  _id: string;
  name: string;
  sku: string;
  unit: string;
  defaultRate: number;
  rate: number;
  negotiated: boolean;
  /** This customer has a negotiated rate for it — shown first, under its own heading. */
  linked?: boolean;
}

export const TYPE_OPTIONS = [
  { value: InvoiceType.Tax, label: 'US Tax (taxed)' },
  { value: InvoiceType.Cash, label: 'US Cash (no tax)' },
  { value: InvoiceType.PK, label: 'Pakistan' },
];
/** Short forms for the customer picker's badges — the full labels are too long for a chip. */
const TYPE_TAG: Record<InvoiceType, string> = {
  [InvoiceType.Tax]: 'US Tax',
  [InvoiceType.Cash]: 'US Cash',
  [InvoiceType.PK]: 'Pakistan',
};
const TYPE_LABEL: Record<InvoiceType, string> = {
  [InvoiceType.Tax]: 'TAX INVOICE',
  [InvoiceType.Cash]: 'CASH INVOICE',
  [InvoiceType.PK]: 'INVOICE',
};

const usd = (n: number) => formatMoney('USD', Number(n ?? 0));

/** DD-MM-YYYY from a YYYY-MM-DD string. */
function fmtDate(s?: string): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}-${m}-${y}` : s;
}

const MIN_ROWS = 8;

// Customer picker page size — loaded a page at a time as the dropdown scrolls (matches the API default).
const CUST_PAGE = 20;

/*
 * The party NAME field, doubling as the customer search. Typing hits the API (debounced) and drops
 * a dropdown right under the field; while the request is in flight a spinner shows. Picking one
 * fires onPick (parent auto-fills address/email/phone). Free text with no match is kept verbatim
 * (onType) and the dropdown says "No customer found". A bare template input (not a boxed MUI field)
 * so it matches the print.
 *
 * Custom combobox rather than MUI Autocomplete: freeSolo suppresses the no-options popup and hides
 * the list when empty — the opposite of the "show me it found nothing" behaviour we want.
 */
function CustomerNameField({
  value,
  placeholder,
  disabled,
  onType,
  onPick,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onType: (v: string) => void;
  onPick: (opt: CustomerOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // One bag of paging state instead of four separate flags.
  const [page, setPage] = useState<{
    items: CustomerOption[];
    skip: number;
    hasMore: boolean;
    loading: boolean;
  }>({ items: [], skip: 0, hasMore: false, loading: false });
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped per request; a response for an older seq is ignored (stale-guard against races).
  const seqRef = useRef(0);

  // Debounce the typed value into `query` so we hit the API ~once the user pauses, not per key.
  useEffect(() => {
    const t = setTimeout(() => setQuery(value.trim()), 250);
    return () => clearTimeout(t);
  }, [value]);

  // Fetch one page. append=false replaces (new query / first open); append=true adds the next page.
  const fetchPage = useCallback(async (q: string, nextSkip: number, append: boolean) => {
    const seq = ++seqRef.current;
    setPage((p) => ({ ...p, loading: true }));
    try {
      const res = await fetch(
        `/api/customers/options?q=${encodeURIComponent(q)}&limit=${CUST_PAGE}&skip=${nextSkip}`,
      );
      const json = await res.json();
      if (seq !== seqRef.current) return; // a newer request superseded this one
      const rows: CustomerOption[] = json?.data?.items ?? [];
      setPage((p) => ({
        items: append ? [...p.items, ...rows] : rows,
        skip: nextSkip + rows.length,
        hasMore: Boolean(json?.data?.hasMore),
        loading: false,
      }));
    } catch {
      if (seq === seqRef.current) setPage((p) => ({ ...p, hasMore: false, loading: false }));
    }
  }, []);

  // First page whenever the menu opens or the (debounced) query changes.
  useEffect(() => {
    if (!open) return;
    setPage({ items: [], skip: 0, hasMore: false, loading: false });
    void fetchPage(query, 0, false);
  }, [open, query, fetchPage]);

  // Load the next page when scrolled near the bottom of the list.
  const onScroll = (e: React.UIEvent<HTMLUListElement>) => {
    if (page.loading || !page.hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 16) {
      void fetchPage(query, page.skip, true);
    }
  };

  // Debounce still catching up → the visible list is stale; show the spinner, not "no results".
  const busy = page.loading || value.trim() !== query;

  return (
    <div className="cust-field">
      <input
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        style={{ fontWeight: 700 }}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so an option's mousedown pick lands before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && (
        <ul className="cust-menu" onScroll={onScroll}>
          {page.items.map((c) => (
            <li
              key={c._id}
              className="pick-opt"
              // mousedown (not click) so it fires before the input's blur closes the menu.
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                onPick(c);
                setOpen(false);
              }}
            >
              <span className="pick-top">
                <span className="pick-nm">{c.name}</span>
                {/* What actually changes the invoice: a reseller pays no sales tax, and the
                    default type picks the template. Worth seeing before committing to a pick. */}
                {c.reseller && <span className="pick-tag is-reseller">Reseller</span>}
                {c.invoiceType && <span className="pick-tag">{TYPE_TAG[c.invoiceType]}</span>}
              </span>
              {/* Email first — two customers can share a name (and often do), so it is the line
                  that tells them apart. */}
              {(c.email || c.phone) && (
                <span className="pick-sub">
                  {[c.email, formatPhone(c.phone)].filter(Boolean).join('  ·  ')}
                </span>
              )}
              {c.address && <span className="pick-addr">{c.address}</span>}
            </li>
          ))}
          {busy && (
            <li className="cust-loading">
              <CircularProgress size={20} thickness={5} sx={{ color: RED }} />
            </li>
          )}
          {!busy && page.items.length === 0 && <li className="cust-empty">No customer found</li>}
        </ul>
      )}
    </div>
  );
}

export function InvoiceTemplateForm({
  form,
  setForm,
  preview,
  saving,
  errors,
  products,
  onCustomerPick,
}: {
  form: TemplateForm;
  setForm: React.Dispatch<React.SetStateAction<TemplateForm>>;
  preview: CalcResult;
  saving: boolean;
  errors: FieldErrors;
  products: ProductOption[];
  onCustomerPick: (opt: CustomerOption | null) => void;
}) {
  const policy = TAX_POLICY[form.type];
  const resellerExempt = form.type === InvoiceType.Tax && form.reseller;
  const taxable =
    (policy === 'always' || (policy === 'optional' && form.applyTax)) && !resellerExempt;

  // Text fields (bill/ship party, notes) commit to parent state on blur rather than on every
  // keystroke, so typing a name/address does not re-render the whole template. Live-total fields
  // (qty, price, tax, shipping, discount) stay controlled below. When a picker fills the party
  // fields programmatically we bump the remount key so the uncontrolled inputs pick up the new
  // defaults.
  const [billKey, setBillKey] = useState(0);
  const [shipKey, setShipKey] = useState(0);

  const setField = <K extends keyof TemplateForm>(key: K, value: TemplateForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const commit = useCallback(
    (key: keyof TemplateForm) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    [setForm],
  );
  const setLine = (i: number, patch: Partial<TemplateLine>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));
  // A new line is only allowed once the last one has a description — no blank rows stacking up.
  const addLine = () =>
    setForm((f) => {
      const last = f.items[f.items.length - 1];
      if (last && last.description.trim() === '') return f;
      return { ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0 }] };
    });

  /*
   * Auto-fill: a customer with exactly one linked product has only one thing they can be billed
   * for, so picking them fills the first line with it — product, description and their rate, all
   * still editable. Two or more linked products stay a choice, which is what the dropdown is for.
   *
   * Only fires on a form whose lines are all still blank, so it can never overwrite work in
   * progress or re-add itself to a draft being edited. The ref makes it once-per-product: clear
   * the line back out and it stays cleared.
   */
  const autoFilledRef = useRef<string | null>(null);
  useEffect(() => {
    const linked = products.filter((p) => p.linked);
    if (linked.length !== 1) return;
    const only = linked[0];
    if (autoFilledRef.current === only._id) return;

    setForm((f) => {
      const untouched = f.items.every((l) => !l.productId && !l.description.trim());
      if (!untouched || f.items.length === 0) return f;
      autoFilledRef.current = only._id;
      const items = f.items.slice();
      items[0] = {
        ...items[0],
        productId: only._id,
        productName: only.name,
        description: only.name,
        unitPrice: only.rate,
      };
      return { ...f, items };
    });
  }, [products, setForm]);

  // A picker fills the party fields programmatically, so bump the remount key to refresh the
  // uncontrolled inputs' defaults.
  const handleBillPick = (opt: CustomerOption | null) => {
    onCustomerPick(opt);
    setBillKey((k) => k + 1);
  };
  // SHIP TO is also a customer pick (or blank). It only fills the ship name/address.
  const onShipPick = (opt: CustomerOption | null) => {
    setForm((f) => ({
      ...f,
      shipName: opt ? opt.name : f.shipName,
      shipAddress: opt ? (opt.address ?? '') : f.shipAddress,
    }));
    setShipKey((k) => k + 1);
  };

  const dueRef = useRef<HTMLInputElement>(null);
  const openDuePicker = () => {
    if (saving) return;
    const el = dueRef.current;
    if (!el) return;
    // showPicker is the modern way to pop the native calendar from a custom trigger.
    if (typeof el.showPicker === 'function') el.showPicker();
    else el.focus();
  };

  const rows = form.items;
  const pad = Math.max(0, MIN_ROWS - rows.length);
  const lastFilled = rows.length === 0 || rows[rows.length - 1].description.trim() !== '';
  const balanceDue = preview.grandTotal; // no payment recorded yet at creation

  return (
    <div className="tpl">
      <style>{`
        .tpl { width: 900px; max-width: 100%; margin: 0 auto; background: ${PAPER}; color: ${BODY};
          font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.35;
          border: 1px solid ${FIELD}; border-radius: 8px; overflow: hidden; }
        .tpl * { box-sizing: border-box; }
        /* Reset only the template's own bare inputs — never MUI's (Autocomplete/TextField),
           which must keep their outline so the customer/product pickers stay usable. */
        .tpl input:not(.MuiInputBase-input), .tpl textarea:not(.MuiInputBase-input) {
          font-family: inherit; font-size: inherit; color: ${BODY};
          border: none; background: transparent; outline: none; width: 100%; padding: 2px 3px; }
        .tpl input:not(.MuiInputBase-input):focus,
        .tpl textarea:not(.MuiInputBase-input):focus { background: ${FOCUS}; border-radius: 3px; }
        .tpl input:not(.MuiInputBase-input)::placeholder { color: ${PLACEH}; }
        .tpl .num-in { text-align: right; }
        /* Line-cell inputs (incl. the MUI product picker's bare input) stay borderless. */
        .tpl-items td input { border: none !important; background: transparent; outline: none;
          width: 100%; padding: 4px 3px; }
        .tpl-items td input:focus { background: ${FOCUS}; }
        /* Hide number spinners so values sit clean and right-aligned; reveal on hover/focus. */
        .tpl input[type=number] { -moz-appearance: textfield; appearance: textfield; }
        .tpl input[type=number]::-webkit-outer-spin-button,
        .tpl input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .tpl input[type=number]:hover::-webkit-inner-spin-button,
        .tpl input[type=number]:focus::-webkit-inner-spin-button {
          -webkit-appearance: inner-spin-button; }
        .tpl input[type=number]:hover, .tpl input[type=number]:focus { -moz-appearance: number-input; }
        .tpl-bar { height: 14px; background: ${RED}; }
        .tpl-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
          padding: 12px 26px; background: ${CONTROL_BG}; border-bottom: 1px solid ${FIELD}; }
        .tpl-head { display: flex; align-items: center; gap: 20px; background: ${HEADER_BG};
          padding: 20px 26px; }
        .tpl-logo { width: 130px; flex-shrink: 0; }
        .tpl-logo img { width: 100%; height: auto; display: block; }
        .tpl-co { flex-grow: 1; min-width: 0; }
        .tpl-co h1 { margin: 0 0 10px; font-size: 25px; font-weight: 800; letter-spacing: .2px; }
        .tpl-co p { margin: 2px 0; font-weight: 700; font-size: 14px; }
        .tpl-co .gap { height: 10px; }
        .tpl-meta { text-align: right; flex-shrink: 0; min-width: 170px; }
        .tpl-meta .big { font-size: 26px; color: ${FAINT}; font-weight: 500; line-height: 1.05; }
        .tpl-meta .row { font-size: 11px; font-weight: 700; color: ${META}; padding: 3px 0;
          text-align: right; }
        .tpl-meta .due-row { position: relative; cursor: pointer; }
        .tpl-meta .due-native { position: absolute; right: 0; bottom: 0; width: 1px; height: 1px;
          opacity: 0; padding: 0; pointer-events: none; }
        .tpl-body { padding: 22px 26px 0; }
        .tpl-parties { display: flex; gap: 40px; margin-bottom: 16px; }
        .tpl-party { flex: 1; }
        .tpl-party .lbl { color: ${RED}; font-size: 10px; font-weight: 700; letter-spacing: .12em;
          border-bottom: 2px solid ${HAIR}; padding-bottom: 4px; margin-bottom: 8px; }
        .cust-field { position: relative; }
        .cust-menu { list-style: none; margin: 2px 0 0; padding: 4px 0; position: absolute;
          z-index: 20; left: 0; right: 0; background: ${PAPER}; border: 1px solid ${FIELD};
          border-radius: 10px; box-shadow: 0 6px 18px ${HAIR}; max-height: 300px; overflow-y: auto; }
        /* One option style for both pickers (customer + product): name and the tags that change
           the invoice on top, the detail that decides the pick beneath. Every line clips rather
           than wraps, so rows are a fixed height and the list scans. */
        .pick-opt { padding: 8px 10px; cursor: pointer; display: flex; flex-direction: column;
          align-items: flex-start; justify-content: flex-start; text-align: left; gap: 1px;
          border-bottom: 1px solid ${HAIR};
          font-size: 13px; line-height: 1.35; color: ${BODY}; }
        .pick-opt:last-child { border-bottom: none; }
        .pick-opt:hover { background: ${FOCUS}; }
        .pick-top { display: flex; align-items: center; gap: 6px; width: 100%; }
        .pick-nm { font-weight: 700; min-width: 0; flex: 0 1 auto; overflow: hidden;
          text-overflow: ellipsis; white-space: nowrap; }
        /* margin-left:auto pins it right whatever the name's length; tabular figures keep the
           column of prices aligned down the list. */
        .pick-rate { margin-left: auto; padding-left: 12px; flex-shrink: 0; font-weight: 700;
          font-variant-numeric: tabular-nums; }
        .pick-tag { flex-shrink: 0; font-size: 9px; font-weight: 700; letter-spacing: .05em;
          text-transform: uppercase; padding: 1px 6px; border-radius: 999px; line-height: 1.5;
          background: ${CONTROL_BG}; color: ${MUTED}; }
        .pick-tag.is-reseller { background: ${PINK}; color: ${RED}; }
        .pick-sub, .pick-addr { font-size: 11px; color: ${MUTED}; max-width: 100%;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pick-addr { color: ${FAINT}; }
        /* The product picker is a MUI Autocomplete, so its popup arrives with the app's Paper
           and 1rem body type — twice the template's scale. Pull it back to the same card the
           customer menu draws, and strip the option padding MUI applies to the li we style. */
        .pick-pop { border: 1px solid ${FIELD} !important; border-radius: 10px !important;
          box-shadow: 0 6px 18px ${HAIR} !important;
          /* At least the cell's width, up to a line length that still reads. */
          min-width: 300px; max-width: 480px; }
        .pick-pop .MuiAutocomplete-listbox { padding: 0; max-height: 300px; }
        /* Two classes, to outrank MUI's own listbox-scoped option rule — that one is a row with
           align-items:center, which left our two stacked lines centred. */
        .pick-pop .MuiAutocomplete-option.pick-opt { display: flex; flex-direction: column;
          align-items: flex-start; justify-content: flex-start; text-align: left;
          padding: 8px 10px; min-height: 0; }
        .pick-pop .MuiAutocomplete-noOptions { font-size: 11px; color: ${MUTED};
          font-style: italic; text-align: center; padding: 14px 10px; }
        /* Group headings ("For this customer" / "All products"). Sticky is MUI's own behaviour,
           kept — it tells you which half of the list you have scrolled into. */
        .pick-pop .MuiAutocomplete-groupLabel { font-size: 9px; font-weight: 700;
          letter-spacing: .08em; text-transform: uppercase; color: ${MUTED};
          background: ${CONTROL_BG}; line-height: 1; padding: 7px 10px;
          border-bottom: 1px solid ${HAIR}; }
        .pick-pop .MuiAutocomplete-groupUl { padding: 0; }
        .cust-empty { padding: 14px 10px; color: ${MUTED}; font-size: 11px; font-style: italic;
          text-align: center; }
        .cust-loading { padding: 14px 10px; display: flex; align-items: center;
          justify-content: center; }
        table.tpl-items { width: 100%; border-collapse: collapse; }
        table.tpl-items th { background: ${RED}; color: ${PAPER}; font-size: 11px; padding: 6px 8px;
          border: 1px solid ${RED}; text-align: center; }
        table.tpl-items td { border: 1px solid ${BORDER}; padding: 2px 4px; height: 28px;
          vertical-align: middle; }
        table.tpl-items td.tot { text-align: right; white-space: nowrap; padding-right: 8px;
          color: ${CELL}; }
        table.tpl-items tr.pad { cursor: pointer; }
        table.tpl-items tr.pad:hover td { background: ${FOCUS}; }
        table.tpl-items td.rm { border: none; width: 30px; text-align: center; }
        .tpl-items .rm button { border: none; background: none; cursor: pointer; color: ${RED};
          font-size: 16px; line-height: 1; }
        .tpl-items .rm button:disabled { color: ${HAIR}; cursor: default; }
        .tpl-addline { margin: 8px 0 0; }
        .tpl-addline button { border: none; background: none; color: ${RED}; font-weight: 700;
          cursor: pointer; font-size: 13px; padding: 4px 0; }
        .tpl-addline button:disabled { color: ${HAIR}; cursor: default; }
        .tpl-hint { color: ${MUTED}; font-size: 12px; }
        .tpl-lower { display: flex; gap: 30px; margin-top: 10px; }
        .tpl-terms { flex: 1; font-size: 12px; }
        .tpl-terms a { color: ${LINK}; text-decoration: underline; word-break: break-all; }
        .tpl-totals { width: 350px; flex-shrink: 0; font-size: 13px; }
        /*
         * The totals block is a two-column table of fixed-height rows. Every value cell fills its
         * row, so a rule is always the row's own edge — it can never crowd the number above or
         * below it, whatever a row contains (text, input, or a box).
         */
        .tpl-totals .tr { display: flex; justify-content: flex-end; align-items: stretch;
          gap: 12px; height: 34px; }
        /* Kept inline (not a flex box) so "SALES TAX" keeps its word space; centred by align-self. */
        .tpl-totals .tr .k { flex: 1 1 auto; align-self: center; font-weight: 700;
          text-align: right; font-size: 13px; white-space: nowrap; min-width: 0; }
        .tpl-totals .tr .k .red { color: ${RED}; }
        /* The value box hugs its text: 20px tall (13px text centred → ~3px to each rule) and
           centred in the 34px row, so a rule sits tight against its own value and level with its
           own label — 7px clear of the row edge, never near the row above. */
        .tpl-totals .tr .v, .tpl-totals .tr .v-in { flex: 0 0 110px; width: 110px;
          align-self: center; height: 20px;
          display: flex; align-items: center; justify-content: flex-end;
          text-align: right; white-space: nowrap; font-size: 13px; line-height: 1;
          padding: 0 6px 0 0; }
        /* Rules are opt-in per row so the block reads as the template's grouped boxes rather
           than one underline per line. */
        .tpl-totals .tr .v.line-top, .tpl-totals .tr .v-in.line-top {
          border-top: 1px solid ${HAIR}; }
        .tpl-totals .tr .v.line-bottom, .tpl-totals .tr .v-in.line-bottom {
          border-bottom: 1px solid ${HAIR}; }
        .tpl .tpl-totals .tr .v-in input { border: none; border-radius: 0; text-align: right;
          padding: 0; font-size: 13px; line-height: 1; height: 100%; }
        .tpl-totals .tr .v-in input:focus { background: ${FOCUS}; }
        /* The tax rate reads "8.75 %": the input shrinks so the sign sits with the number
           instead of drifting to the column edge. */
        .tpl-totals .tr .v-in.pct-in i { font-style: normal; font-size: 13px; padding-left: 4px; }
        .tpl .tpl-totals .tr .v-in.pct-in input { flex: 1 1 auto; width: auto; min-width: 0; }
        /* NET TOTAL and NET TOTAL + Tax: the whole row boxed, on the same 34px rhythm. */
        .tpl-totals .boxed { border: 1.5px solid ${BORDER}; }
        .tpl-totals .boxed .k { padding-left: 10px; }
        .tpl-totals .boxed .k, .tpl-totals .boxed .v { font-weight: 800; }
        .tpl-totals .pay-rule { border-bottom: 2px solid ${BORDER}; margin: 2px 0 8px; }
        .tpl-totals .bal { background: ${PINK}; padding: 8px; margin-top: 8px;
          display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
        .tpl-totals .bal .k { text-align: right; font-weight: 700; }
        .tpl-totals .bal .k small { display: block; font-weight: 400; font-size: 10px; color: ${MUTED}; }
        .tpl-totals .bal .v { width: 95px; text-align: right; font-weight: 800; }
        .tpl-totals .cashapp { background: ${RED}; color: ${PAPER}; padding: 5px 8px; margin-top: 6px;
          display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
        .tpl-reseller { display: flex; align-items: center; gap: 6px; margin: 4px 0 8px;
          justify-content: flex-end; font-size: 11px; }
        .tpl-notes { padding: 4px 26px 20px; }
        .tpl-notes .lbl { font-size: 10px; font-weight: 700; letter-spacing: .1em; color: ${MUTED};
          margin-bottom: 4px; }
        /* Higher specificity than the bare-input reset above, so the box border survives. */
        .tpl .tpl-notes textarea { border: 1px solid ${HAIR}; border-radius: 6px; min-height: 54px;
          padding: 8px; resize: vertical; overflow-x: hidden; background: ${PAPER}; }
        .tpl .tpl-notes textarea:focus { border-color: ${RED}; background: ${PAPER}; }
        .tpl-foot-bar { height: 16px; background: ${RED}; }
        .tpl-err { color: ${RED}; font-size: 11px; margin-top: 4px; }
        /* Narrow screens: the fixed masthead/columns stack instead of cramping. */
        @media (max-width: 640px) {
          .tpl-head { flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px; }
          .tpl-logo { width: 110px; }
          .tpl-co h1 { font-size: 20px; margin-bottom: 6px; }
          .tpl-co p { font-size: 12px; }
          .tpl-meta { text-align: left; min-width: 0; }
          .tpl-meta .big { font-size: 22px; }
          .tpl-meta .row { text-align: left; }
          .tpl-meta .due-native { left: 0; right: auto; }
          .tpl-body { padding: 16px 16px 0; }
          .tpl-parties { flex-direction: column; gap: 16px; margin-bottom: 12px; }
          .tpl-lower { flex-direction: column; gap: 18px; }
          .tpl-totals { width: 100%; }
          .tpl-notes { padding: 4px 16px 20px; }
          table.tpl-items th, table.tpl-items td { font-size: 10px; }
        }
      `}</style>

      <div className="tpl-bar" />

      <div className="tpl-head">
        <div className="tpl-logo">
          <Image
            src="/brand/logo.png"
            alt="Bridgette"
            width={1978}
            height={1145}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        <div className="tpl-co">
          <h1>{COMPANY_CONTACT.name}</h1>
          <p>{COMPANY_CONTACT.addressLine1}</p>
          <p>{COMPANY_CONTACT.addressLine2}</p>
          <div className="gap" />
          <p>{COMPANY_CONTACT.phone}</p>
          <p>{COMPANY_CONTACT.email}</p>
        </div>
        <div className="tpl-meta">
          <div className="big">{TYPE_LABEL[form.type]}</div>
          <div className="row">DATE: {fmtDate(form.issueDate)}</div>
          <div className="row due-row" onClick={openDuePicker}>
            DUE: {fmtDate(form.dueDate)}
            <input
              ref={dueRef}
              className="due-native"
              type="date"
              value={form.dueDate}
              min={form.issueDate || undefined}
              disabled={saving}
              onChange={(e) => setField('dueDate', e.target.value)}
            />
          </div>
          {/* Assigned on save; shown as the template placeholder until then. */}
          <div className="row">INVOICE NO: YY-MM-##</div>
        </div>
      </div>

      <div className="tpl-body">
        <div className="tpl-parties">
          {/* Party fields are uncontrolled + blur-commit (see `commit`), so typing a name or
              address never re-renders the template. `key` remounts them after a picker fills them. */}
          <div className="tpl-party" key={`bill-${billKey}`}>
            <div className="lbl">BILL TO</div>
            {/* NAME is the customer search: type to filter the book; pick to auto-fill
                address/email/phone. Free text is kept as-is when no customer matches. */}
            <CustomerNameField
              value={form.billName}
              placeholder="NAME *"
              disabled={saving}
              onType={(v) => setField('billName', v)}
              onPick={handleBillPick}
            />
            <input
              placeholder="ADDRESS"
              defaultValue={form.billAddress}
              disabled={saving}
              onBlur={commit('billAddress')}
            />
            <input
              placeholder="Email"
              defaultValue={form.billEmail}
              disabled={saving}
              onBlur={commit('billEmail')}
            />
            <input
              placeholder="Phone"
              defaultValue={form.billPhone}
              disabled={saving}
              onBlur={commit('billPhone')}
            />
            {errors.billToName && <div className="tpl-err">{errors.billToName}</div>}
            {errors.billToEmail && <div className="tpl-err">{errors.billToEmail}</div>}
          </div>
          <div className="tpl-party" key={`ship-${shipKey}`}>
            <div className="lbl">SHIP TO</div>
            <CustomerNameField
              value={form.shipName}
              placeholder="NAME"
              disabled={saving}
              onType={(v) => setField('shipName', v)}
              onPick={onShipPick}
            />
            <input
              placeholder="ADDRESS"
              defaultValue={form.shipAddress}
              disabled={saving}
              onBlur={commit('shipAddress')}
            />
          </div>
        </div>

        <table className="tpl-items">
          <thead>
            <tr>
              <th style={{ width: 200 }}>PRODUCT</th>
              <th>DESCRIPTION</th>
              <th style={{ width: 70 }}>QTY</th>
              <th style={{ width: 120 }}>UNIT PRICE</th>
              <th style={{ width: 110 }}>TOTAL</th>
              <th className="rm" />
            </tr>
          </thead>
          <tbody>
            {rows.map((line, i) => (
              <tr key={i}>
                <td>
                  {products.length > 0 ? (
                    <Autocomplete<ProductOption, false, false, false>
                      options={products}
                      getOptionLabel={(o) => (o.sku ? `${o.name} (${o.sku})` : o.name)}
                      isOptionEqualToValue={(o, v) => o._id === v._id}
                      // Only worth splitting when the customer actually has linked products;
                      // otherwise every row would sit under one pointless "All products" header.
                      groupBy={
                        products.some((p) => p.linked)
                          ? (o) => (o.linked ? 'For this customer' : 'All products')
                          : undefined
                      }
                      value={products.find((p) => p._id === line.productId) ?? null}
                      disabled={saving}
                      onChange={(_e, picked) =>
                        picked &&
                        // Picking a product fills the description + the customer's rate; both stay editable.
                        setLine(i, {
                          productId: picked._id,
                          productName: picked.name,
                          description: picked.name,
                          unitPrice: picked.rate,
                        })
                      }
                      slotProps={{
                        paper: { className: 'pick-pop' },
                        // MUI pins the popup to the anchor's width, and the PRODUCT cell is
                        // narrower than a product name. Let it size to its content instead,
                        // bounded by the CSS below, so names stop truncating.
                        popper: { style: { width: 'auto' } },
                      }}
                      // Same option layout as the customer picker: name and code on top, the
                      // numbers that decide the pick beneath. MUI owns the li (keyboard nav,
                      // highlight), so pick-opt only styles what is inside it.
                      renderOption={(props, o) => (
                        <li {...props} key={o._id} className={`${props.className ?? ''} pick-opt`}>
                          {/* Price sits at the right edge, where the table's UNIT PRICE column
                              puts it — the row then spans the width instead of trailing off. */}
                          <span className="pick-top">
                            <span className="pick-nm">{o.name}</span>
                            {o.sku && <span className="pick-tag">{o.sku}</span>}
                            <span className="pick-rate">
                              {usd(o.rate)}
                              {o.unit ? ` / ${o.unit}` : ''}
                            </span>
                          </span>
                          {/* Only worth a second line when this customer is not on the list
                              price — otherwise the rate above says everything. */}
                          {o.negotiated && (
                            <span className="pick-sub">
                              Negotiated&nbsp;&nbsp;·&nbsp;&nbsp;list {usd(o.defaultRate)}
                            </span>
                          )}
                        </li>
                      )}
                      renderInput={(params) => (
                        <div ref={params.InputProps.ref}>
                          <input {...params.inputProps} placeholder="Pick a product" />
                        </div>
                      )}
                    />
                  ) : (
                    <input placeholder="—" disabled />
                  )}
                </td>
                <td>
                  <input
                    placeholder="Description"
                    value={line.description}
                    disabled={saving}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="num-in"
                    type="number"
                    value={line.quantity}
                    disabled={saving}
                    onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    className="num-in"
                    type="number"
                    value={line.unitPrice}
                    disabled={saving}
                    onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })}
                  />
                </td>
                <td className="tot">{usd(preview.lineTotals[i] ?? 0)}</td>
                <td className="rm">
                  <button
                    type="button"
                    aria-label="Remove line"
                    disabled={saving || rows.length === 1}
                    onClick={() =>
                      setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {Array.from({ length: pad }).map((_, i) => (
              <tr
                key={`pad-${i}`}
                className="pad"
                onClick={saving ? undefined : addLine}
                title="Click to add a line"
              >
                <td>&nbsp;</td>
                <td />
                <td />
                <td />
                <td className="tot" />
                <td className="rm" />
              </tr>
            ))}
          </tbody>
        </table>
        {errors.items && <div className="tpl-err">{errors.items}</div>}

        <div className="tpl-addline">
          <button type="button" disabled={saving || !lastFilled} onClick={addLine}>
            + Add line
          </button>
          {!lastFilled && <span className="tpl-hint"> — fill the last line first</span>}
        </div>

        <div className="tpl-lower">
          <div className="tpl-terms">
            <div>Terms &amp; Condition:</div>
            {INVOICE_TERMS.map((t) => (
              <div key={t.label}>
                {t.label}:{' '}
                <a href={t.url} target="_blank" rel="noreferrer">
                  {t.url}
                </a>
              </div>
            ))}
          </div>

          <div className="tpl-totals">
            {/* Reseller tax-exemption comes from the chosen customer, not a per-invoice toggle. */}
            {form.type === InvoiceType.Tax && form.reseller && (
              <div className="tpl-reseller">Reseller — tax-exempt (no sales tax)</div>
            )}
            <Total k="SUBTOTAL" v={usd(preview.subtotal)} vClass="line-bottom" />
            <div className="tr">
              <span className="k">SHIPPING/HANDLING/TARIFF</span>
              <span className="v-in line-bottom">
                <input
                  type="number"
                  value={form.shippingHandling}
                  disabled={saving}
                  onChange={(e) => setField('shippingHandling', Number(e.target.value))}
                />
              </span>
            </div>
            <div className="tr">
              <span className="k">Discount</span>
              <span className="v-in line-bottom">
                <input
                  type="number"
                  value={form.discount}
                  disabled={saving}
                  onChange={(e) => setField('discount', Number(e.target.value))}
                />
              </span>
            </div>
            <Total k="NET TOTAL" v={usd(preview.totalBeforeTax)} className="boxed" />
            {/* Tax is split across two rows on the template: the rate, then the amount it makes. */}
            <div className="tr">
              <span className="k">
                SALES <span className="red">TAX</span>
              </span>
              <span className="v-in line-bottom pct-in">
                <input
                  type="number"
                  value={form.taxPercent}
                  disabled={saving || !taxable}
                  onChange={(e) => setField('taxPercent', Number(e.target.value))}
                />
                <i>%</i>
              </span>
            </div>
            <div className="tr">
              <span className="k">TAX AMOUNT</span>
              <span className="v line-bottom">{usd(preview.taxAmount)}</span>
            </div>
            <Total k="NET TOTAL + Tax" v={usd(preview.grandTotal)} className="boxed" />
            {/* Nothing is paid at creation, so PAYMENT stays blank as on the template. */}
            <Total k="PAYMENT" v="" />
            <div className="pay-rule" />
            <div className="bal">
              <span className="k">
                Balance Due
                <small>Zelle/Direct Bank</small>
              </span>
              <span className="v">{usd(balanceDue)}</span>
            </div>
            <div className="cashapp">
              <span>For Cashapp/Paypal ({CASHAPP_PCT})</span>
              <span>{usd(cashappAmount(balanceDue))}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tpl-notes">
        <div className="lbl">NOTES</div>
        <textarea
          placeholder="Internal notes (not printed on the invoice)"
          defaultValue={form.notes}
          disabled={saving}
          onBlur={commit('notes')}
        />
      </div>

      <div className="tpl-foot-bar" />
    </div>
  );
}

const Total = memo(function Total({
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
});
