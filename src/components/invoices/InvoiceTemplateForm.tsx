'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import { DateCalendarField } from '@/components/form/DateCalendarField';
import { COMPANY_CONTACT, INVOICE_TERMS } from '@/modules/legal/company';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import type { CalcResult } from '@/modules/invoicing/calc';
import { formatMoney } from '@/lib/format/money';
import { formatPhone, telHref } from '@/lib/format/countries';
import { NumberCell } from '@/components/form/NumberCell';
import { cashappAmount, CASHAPP_PCT } from '@/components/invoices/InvoiceDocument';
import { colors, redA } from '@/lib/colors';
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
  /** Percent off this line (0–100). Prefilled from the product, editable per line. */
  discountPercent?: number;
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
  /** Internal target date for the order (YYYY-MM-DD). Never printed on the document. */
  orderDeadline: string;
}

export interface CustomerOption {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  reseller?: boolean;
  invoiceType?: InvoiceType;
  /** Product ids this customer buys — the lines are filled from these on pick. */
  products?: string[];
  /** Where goods go. `sameAsBilling` means SHIP TO repeats the billing party. */
  shipping?: {
    sameAsBilling?: boolean;
    name?: string;
    address?: string;
  } | null;
}
export interface ProductOption {
  _id: string;
  name: string;
  /** Wording for the invoice line. Falls back to the name on products saved before it existed. */
  description?: string;
  sku: string;
  unit: string;
  defaultRate: number;
  /** The product's standing discount %, prefilled onto the line when picked. */
  discount?: number;
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

/**
 * SHIP TO for a picked customer. A customer that ships to its billing address stores no separate
 * copy, so the billing party is repeated here rather than read back from a stale duplicate.
 */
export function shipToFor(opt: CustomerOption): { name: string; address: string } {
  const ship = opt.shipping;
  if (!ship || ship.sameAsBilling !== false) {
    return { name: opt.name, address: opt.address ?? '' };
  }
  return { name: ship.name || opt.name, address: ship.address ?? '' };
}

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
  // Bumped (not toggled) so a second impatient click restarts the flash instead of being swallowed.
  const [nudge, setNudge] = useState(0);
  const [typeAnchor, setTypeAnchor] = useState<null | HTMLElement>(null);

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
      return {
        ...f,
        items: [...f.items, { description: '', quantity: 1, unitPrice: 0, discountPercent: 0 }],
      };
    });

  /*
   * Asking for another line, from the button or from a click on one of the empty template rows
   * below the last one.
   *
   * A new row is only granted once the line above is filled, otherwise the invoice collects blank
   * rows. Refusing by disabling the control was worse than refusing out loud: a dead button
   * states no reason and cannot be asked for one. So it stays live, and a request that cannot be
   * honoured flashes the line standing in the way.
   */
  const requestNewLine = () => {
    if (lastFilled) {
      addLine();
      return;
    }
    setNudge((n) => n + 1);
  };

  /*
   * Auto-fill: picking a customer writes their linked products straight onto the lines — product,
   * description, the rate they pay and the product's discount, one line each, all still editable.
   * That is the whole point of linking them; making someone re-pick the same list by hand would
   * be busywork.
   *
   * Only fires on a form whose lines are all still blank, so it can never overwrite work in
   * progress or refill a draft being edited. The ref keys on the product set, so switching to a
   * different customer refills, while clearing the lines by hand leaves them cleared.
   */
  const autoFilledRef = useRef<string>('');
  useEffect(() => {
    const linked = products.filter((p) => p.linked);
    if (linked.length === 0) return;
    // Keyed by the set itself, so switching customer refills and re-rendering does not.
    const key = linked.map((p) => p._id).join(',');
    if (autoFilledRef.current === key) return;

    setForm((f) => {
      const untouched = f.items.every((l) => !l.productId && !l.description.trim());
      if (!untouched) return f;
      autoFilledRef.current = key;
      const filled = linked.map((p) => ({
        productId: p._id,
        productName: p.name,
        description: p.description || p.name,
        quantity: 1,
        unitPrice: p.rate,
        discountPercent: p.discount ?? 0,
      }));
      return { ...f, items: filled };
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

  /*
   * The DUE date opens the app's own calendar rather than the browser's. showPicker() gave every
   * OS a different-looking popup that could not be themed and did not match anything else here.
   */
  const [dueAnchor, setDueAnchor] = useState<null | HTMLElement>(null);
  const [deadlineAnchor, setDeadlineAnchor] = useState<null | HTMLElement>(null);

  const rows = form.items;
  // The flash clears itself; it is a hint, not a state anyone has to dismiss.
  useEffect(() => {
    if (nudge === 0) return;
    const t = setTimeout(() => setNudge(0), 1800);
    return () => clearTimeout(t);
  }, [nudge]);

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
        /* The masthead is a block of contact details, not a set of links. */
        .tpl-co a { color: inherit; text-decoration: none; }
        .tpl-co .gap { height: 10px; }
        .tpl-meta { text-align: right; flex-shrink: 0; min-width: 170px; }
        /* The title doubles as the type picker: it is already the biggest statement of what this
           document is, so changing it there beats adding a labelled control the print never uses.
           The trigger is a real <button> for the click, Enter/Space, focus ring and aria-expanded.
           Its reset comes BEFORE .big deliberately: font:inherit carries the same specificity as
           the .tpl-meta .big rule, so declared after it the button's own font would win and the
           heading would render at body size in body colour. */
        .tpl-meta .type-pick { position: relative; display: inline-block; cursor: pointer;
          appearance: none; background: none; border: 0; padding: 0; margin: 0; font: inherit;
          color: inherit; letter-spacing: inherit; }
        .tpl-meta .big { font-size: 26px; color: ${FAINT}; font-weight: 500; line-height: 1.05; }
        .tpl-meta .row { font-size: 11px; font-weight: 700; color: ${META}; padding: 3px 0;
          text-align: right; }
        .tpl-meta .type-pick:disabled { cursor: default; opacity: .6; }
        .tpl-meta .type-pick:focus-visible { outline: 2px solid ${RED}; outline-offset: 4px;
          border-radius: 4px; }
        /* The caret hangs outside the title's box rather than sitting in the text flow: in flow it
           ate into the right edge and pushed the heading left of the DATE / DUE / INVOICE NO rows
           it is supposed to line up with. Absolute means it costs no width, so the alignment of
           the four lines is the same as it was before the picker existed. */
        .tpl-meta .type-pick .caret { position: absolute; left: 100%; top: 50%; margin-left: 2px;
          width: 22px; height: 22px; display: block; color: ${RED}; opacity: .5;
          transform: translateY(-50%) rotate(0deg); transform-origin: 50% 50%;
          transition: transform .22s cubic-bezier(.4, 0, .2, 1), opacity .22s ease; }
        .tpl-meta .type-pick:hover .caret,
        .tpl-meta .type-pick:focus-visible .caret { opacity: 1; }
        /* Pointing up only while the menu is actually open, so the caret reports state rather
           than just reacting to the cursor being nearby. */
        .tpl-meta .type-pick.open .caret { opacity: 1;
          transform: translateY(-50%) rotate(180deg); }
        .tpl-meta .due-row { position: relative; cursor: pointer; }
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
          /* The floor is dropped on a phone: 300px anchored near the right edge is wider than the
             room left for it, and the popper would rather overflow than shrink. */
          min-width: min(300px, calc(100vw - 24px)); max-width: min(480px, calc(100vw - 24px)); }
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
        /* Flashed when a click lands on an empty row while the line above is still blank: the
           answer is on that line, so that is where the eye is sent. */
        table.tpl-items tr.nudge td { animation: tpl-nudge 1.8s ease-out; }
        @keyframes tpl-nudge {
          0%, 55% { background: ${redA(0.14)}; }
          100% { background: transparent; }
        }
        @media (prefers-reduced-motion: reduce) {
          table.tpl-items tr.nudge td { animation: none; background: ${redA(0.1)}; }
        }
        table.tpl-items td.rm { border: none; width: 30px; text-align: center; }
        .tpl-items .rm button { border: none; background: none; cursor: pointer; color: ${RED};
          font-size: 16px; line-height: 1; }
        .tpl-items .rm button:disabled { color: ${HAIR}; cursor: default; }
        .tpl-addline { margin: 8px 0 0; }
        .tpl-addline button { border: none; background: none; color: ${RED}; font-weight: 700;
          cursor: pointer; font-size: 13px; padding: 4px 0; }
        .tpl-addline button:disabled { color: ${HAIR}; cursor: default; }
        .tpl-hint { color: ${MUTED}; font-size: 12px; transition: color .2s ease; }
        .tpl-hint.loud { color: ${RED}; font-weight: 700; }
        /* The dash is punctuation between the button and the hint, not part of either. It keeps
           the muted colour even while the hint flashes, so the emphasis lands on the words. */
        .tpl-dash { color: ${MUTED}; font-size: 12px; }
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
        /* The tax rate, editable inside its own brackets. Sized to its content so "(8.75%)" reads
           as one printed phrase rather than a field parked in the middle of a label. */
        .tpl-totals .tr .k .rate-in { width: 42px; border: 0; border-bottom: 1px dashed ${FIELD};
          background: none; font: inherit; font-weight: 700; color: inherit; text-align: center;
          padding: 0 1px; outline: none; }
        .tpl-totals .tr .k .rate-in:focus { border-bottom-color: ${RED}; }
        .tpl-totals .tr .k .rate-in:disabled { border-bottom-color: transparent; color: ${MUTED}; }
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
        /* Untaxed, the two boxed rows sit flush and their touching edges read as one 3px rule
           against 1.5px everywhere else. Pull the second up so the shared edge is drawn once. */
        .tpl-totals .boxed + .boxed { margin-top: -1.5px; }
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
        /* Sits under the terms as a statement of fact about the customer, not a total. Muted by
           default; only the exempt case is coloured, since that is the one that changes the bill. */
        .tpl-taxstatus { margin-top: 10px; font-size: 11px; font-weight: 700; color: ${MUTED}; }
        .tpl-taxstatus.exempt { color: ${RED}; }
        .tpl-notes { padding: 4px 26px 20px; }
        .tpl-notes .lbl { font-size: 10px; font-weight: 700; letter-spacing: .1em; color: ${MUTED};
          margin-bottom: 4px; }
        /* Higher specificity than the bare-input reset above, so the box border survives. */
        .tpl .tpl-notes textarea { border: 1px solid ${HAIR}; border-radius: 6px; min-height: 54px;
          padding: 8px; resize: vertical; overflow-x: hidden; background: ${PAPER}; }
        .tpl .tpl-notes textarea:focus { border-color: ${RED}; background: ${PAPER}; }
        .tpl-meta .deadline-row { position: relative; cursor: pointer; }
        .tpl-meta .deadline-row:hover { color: ${RED}; }
        /* Same gutter and the same vertical centring as .type-pick .caret above. */
        .tpl-meta .deadline-clear { position: absolute; left: 100%; top: 50%; margin-left: 2px;
          width: 22px; height: 22px; padding: 3px; display: block; color: ${RED}; opacity: .5;
          transform: translateY(-50%); background: none; border: none; cursor: pointer;
          transition: opacity .22s ease; }
        .tpl-meta .deadline-clear svg { width: 100%; height: 100%; display: block; }
        .tpl-meta .deadline-clear:hover { opacity: 1; }
        .tpl-meta .deadline-clear:disabled { cursor: default; opacity: .3; }
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
          <p>
            <a href={telHref(COMPANY_CONTACT.phone)}>{formatPhone(COMPANY_CONTACT.phone)}</a>
          </p>
          <p>{COMPANY_CONTACT.email}</p>
        </div>
        <div className="tpl-meta">
          <button
            type="button"
            className={typeAnchor ? 'big type-pick open' : 'big type-pick'}
            aria-haspopup="listbox"
            aria-expanded={Boolean(typeAnchor)}
            aria-label={`Invoice type: ${TYPE_LABEL[form.type]}`}
            disabled={saving}
            onClick={(e) => setTypeAnchor(e.currentTarget)}
          >
            {TYPE_LABEL[form.type]}
            {/* A drawn chevron, not the ▾ glyph: the glyph is a solid triangle whose weight and
                baseline come from the font, so it sat heavy against a 26px light heading and
                could not be aligned reliably across platforms. */}
            <svg
              className="caret"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {/* An MUI Menu, not a bare <select> painted invisible: an opacity-0 select is at the
              mercy of how each browser decides to render a control it cannot see, and this one
              quietly refused to drop its list. A menu also styles like the rest of the app and
              can mark which type is current. */}
          <Menu
            anchorEl={typeAnchor}
            open={Boolean(typeAnchor)}
            onClose={() => setTypeAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            {TYPE_OPTIONS.map((o) => (
              <MenuItem
                key={o.value}
                selected={o.value === form.type}
                onClick={() => {
                  setField('type', o.value);
                  setTypeAnchor(null);
                }}
              >
                {o.label}
              </MenuItem>
            ))}
          </Menu>
          <div className="row">DATE: {fmtDate(form.issueDate)}</div>
          <div
            className="row due-row"
            onClick={(e) => !saving && setDueAnchor(e.currentTarget)}
            title="Change the due date"
          >
            DUE: {fmtDate(form.dueDate)}
          </div>
          <Popover
            open={Boolean(dueAnchor)}
            anchorEl={dueAnchor}
            onClose={() => setDueAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <DateCalendarField
              value={form.dueDate}
              // An invoice cannot fall due before it was raised, so the calendar refuses it
              // rather than leaving the form to complain afterwards.
              minDate={form.issueDate || undefined}
              onChange={(v) => {
                setField('dueDate', v);
                setDueAnchor(null);
              }}
            />
          </Popover>
          {/*
           * Internal. This form doubles as the printed sheet, but the row exists only here —
           * InvoiceDocument, which is what the customer sees and what the PDF renders, has no
           * deadline at all. It is marked so nobody reading the form mistakes it for a term the
           * customer was given.
           */}
          <div
            className="row deadline-row"
            onClick={(e) => !saving && setDeadlineAnchor(e.currentTarget)}
            title="Order deadline (never printed on the invoice)"
          >
            DEADLINE: {form.orderDeadline ? fmtDate(form.orderDeadline) : 'NOT SET'}
            {/* Sits in the same gutter as the type picker's chevron, so the two controls share a
                column instead of each nudging the meta lines a different way. Absolute, so it
                costs no width and the four rows stay aligned. */}
            {form.orderDeadline && (
              <button
                type="button"
                className="deadline-clear"
                aria-label="Clear the order deadline"
                title="Clear the order deadline"
                disabled={saving}
                onClick={(e) => {
                  e.stopPropagation();
                  setField('orderDeadline', '');
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <Popover
            open={Boolean(deadlineAnchor)}
            anchorEl={deadlineAnchor}
            onClose={() => setDeadlineAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <DateCalendarField
              value={form.orderDeadline}
              minDate={form.issueDate || undefined}
              onChange={(v) => {
                setField('orderDeadline', v);
                setDeadlineAnchor(null);
              }}
            />
          </Popover>
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
              <th style={{ width: 70 }}>DISC %</th>
              <th style={{ width: 110 }}>TOTAL</th>
              <th className="rm" />
            </tr>
          </thead>
          <tbody>
            {rows.map((line, i) => (
              <tr key={i} className={nudge > 0 && i === rows.length - 1 ? 'nudge' : undefined}>
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
                          description: picked.description || picked.name,
                          unitPrice: picked.rate,
                          discountPercent: picked.discount ?? 0,
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
                  <NumberCell
                    className="num-in"
                    aria-label="Quantity"
                    value={line.quantity}
                    min={0}
                    disabled={saving}
                    onChange={(quantity) => setLine(i, { quantity })}
                  />
                </td>
                <td>
                  <NumberCell
                    className="num-in"
                    aria-label="Unit price"
                    value={line.unitPrice}
                    min={0}
                    disabled={saving}
                    onChange={(unitPrice) => setLine(i, { unitPrice })}
                  />
                </td>
                <td>
                  {/* Clamped by the control as well as server-side, so the live total on screen
                      can never disagree with what the invoice will be saved as. */}
                  <NumberCell
                    className="num-in"
                    aria-label="Discount percent"
                    min={0}
                    max={100}
                    value={line.discountPercent ?? 0}
                    disabled={saving}
                    onChange={(discountPercent) => setLine(i, { discountPercent })}
                  />
                </td>
                <td className="tot">{usd(preview.lineTotals[i] ?? 0)}</td>
                <td className="rm">
                  <button
                    type="button"
                    aria-label="Remove product"
                    disabled={saving}
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
                onClick={saving ? undefined : requestNewLine}
                title={lastFilled ? 'Click to add a product' : 'Fill the product above first'}
              >
                <td>&nbsp;</td>
                <td />
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
          <button type="button" disabled={saving} onClick={requestNewLine}>
            + Add new record
          </button>
          {!lastFilled && (
            <>
              <span className="tpl-dash"> — </span>
              <span className={nudge > 0 ? 'tpl-hint loud' : 'tpl-hint'}>
                Fill the last product first
              </span>
            </>
          )}
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
            {/* Tax status of the party being billed, once there is a party to state it about.
                Names the rate, and says whether it was actually charged: a cash invoice is never
                taxed whoever the customer is, so "not a reseller" alone would explain a $0.00
                tax row incorrectly. */}
            {form.billName.trim() !== '' && (
              <div className={form.reseller ? 'tpl-taxstatus exempt' : 'tpl-taxstatus'}>
                {form.reseller
                  ? 'Reseller: tax-exempt, no sales tax.'
                  : taxable
                    ? `Not a reseller: sales tax ${form.taxPercent}% applied.`
                    : 'Not a reseller, but this invoice type is not taxed.'}
              </div>
            )}
          </div>

          <div className="tpl-totals">
            {/* Reseller tax-exemption comes from the chosen customer, not a per-invoice toggle. */}
            {form.type === InvoiceType.Tax && form.reseller && (
              <div className="tpl-reseller">Reseller, tax-exempt (no sales tax)</div>
            )}
            <Total k="SUBTOTAL" v={usd(preview.subtotal)} vClass="line-bottom" />
            <div className="tr">
              <span className="k">SHIPPING/HANDLING/TARIFF</span>
              <span className="v-in line-bottom">
                <NumberCell
                  aria-label="Shipping, handling and tariff"
                  value={form.shippingHandling}
                  min={0}
                  disabled={saving}
                  onChange={(v) => setField('shippingHandling', v)}
                />
              </span>
            </div>
            <div className="tr">
              <span className="k">Discount</span>
              <span className="v-in line-bottom">
                <NumberCell
                  aria-label="Invoice discount"
                  value={form.discount}
                  min={0}
                  disabled={saving}
                  onChange={(v) => setField('discount', v)}
                />
              </span>
            </div>
            <Total k="NET TOTAL" v={usd(preview.totalBeforeTax)} className="boxed" />
            {/* One row, not two: the rate belongs to the label and the money column stays money
                all the way down. The rate is still editable, in the brackets where it is read.
                Hidden outright when this invoice type is never taxed — printing a rate that
                cannot be charged only invites the customer to ask about it. */}
            {taxable && (
              <div className="tr">
                <span className="k">
                  SALES <span className="red">TAX</span> (
                  <NumberCell
                    className="rate-in"
                    aria-label="Sales tax rate percent"
                    value={form.taxPercent}
                    min={0}
                    max={100}
                    disabled={saving}
                    onChange={(v) => setField('taxPercent', v)}
                  />
                  %)
                </span>
                <span className="v line-bottom">{usd(preview.taxAmount)}</span>
              </div>
            )}
            {/* "+ Tax" only when there is tax. Untaxed, the row would otherwise repeat the boxed
                NET TOTAL above it, word for word and figure for figure. */}
            <Total
              k={taxable ? 'NET TOTAL + Tax' : 'TOTAL'}
              v={usd(preview.grandTotal)}
              className="boxed"
            />
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
          placeholder="Notes (not printed on the invoice)"
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
