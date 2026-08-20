'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { PhoneField } from '@/components/ui/PhoneField';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_ISO2 } from '@/lib/format/countries';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { CustomerProductsField } from '@/components/customers/CustomerProductsField';
import { CustomerTeamsField } from '@/components/customers/CustomerTeamsField';
import { useFormGuard } from '@/components/form/useFormGuard';
import type { FormMode } from '@/components/ui/Modal';
import { customerFormSchemaChecked, TEAMS_MAX } from '@/modules/customers/schemas';
import { statesFor, type AddressParts } from '@/modules/customers/address';
import { canBeReseller } from '@/modules/customers/invoiceType';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';
import { CertificateDropzone, type CertificateFile } from './CertificateDropzone';

/*
 * One dialog for creating and editing a customer (admin only). Mirrors UserFormDialog's shape:
 * typed values live in a ref so a keystroke re-renders only the input being typed in, not the
 * whole Modal. `customer` null = create mode.
 */

export interface EditableCustomer {
  _id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  addressParts?: AddressParts | null;
  notes?: string;
  reseller?: boolean;
  teams?: string[];
  /** Product ids this customer buys. */
  products?: string[];
  /** Per-product discounts negotiated with this customer. */
  productDiscounts?: { product: string; discountPercent: number }[];
  /** Metadata only — the list never carries the file's bytes. */
  resellerCertificate?: { name?: string; contentType?: string; size?: number } | null;
  shipping?: {
    sameAsBilling?: boolean;
    name?: string;
    phone?: string;
    address?: string;
    addressParts?: AddressParts | null;
  } | null;
}

interface FormValues {
  /** Product ids this customer buys. */
  products: string[];
  /** Free-text team names, as typed on this record. */
  teams: string[];
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: 'US' | 'PK';
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  zipPlus4: string;
  notes: string;
  reseller: boolean;
  /** Shipping. While sameAsBilling holds, the rest is ignored and nothing is stored. */
  shipSameAsBilling: boolean;
  shipName: string;
  shipPhone: string;
  shipCountry: 'US' | 'PK';
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipZipPlus4: string;
}

/** Reseller drives tax exemption; a dropdown reads better than a lone checkbox in this row. */
const RESELLER_OPTIONS: SelectOption[] = [
  { value: 'no', label: 'No, charges sales tax' },
  { value: 'yes', label: 'Yes, tax-exempt' },
];

const COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' },
];

/** US states or PK provinces, same shape either way. */
const STATE_OPTIONS: Record<'US' | 'PK', SelectOption[]> = {
  US: statesFor('US').map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  PK: statesFor('PK').map((s) => ({ value: s.code, label: s.name })),
};

type TextKey =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'line1'
  | 'line2'
  | 'city'
  | 'zip'
  | 'zipPlus4'
  | 'notes'
  | 'shipName'
  | 'shipPhone'
  | 'shipLine1'
  | 'shipLine2'
  | 'shipCity'
  | 'shipZip'
  | 'shipZipPlus4';

const EMPTY: FormValues = {
  products: [],
  teams: [],
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  country: 'US',
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  zipPlus4: '',
  notes: '',
  reseller: false,
  shipSameAsBilling: true,
  shipName: '',
  shipPhone: '',
  shipCountry: 'US',
  shipLine1: '',
  shipLine2: '',
  shipCity: '',
  shipState: '',
  shipZip: '',
  shipZipPlus4: '',
};

function valuesFromCustomer(c: EditableCustomer): FormValues {
  // Records created before first/last existed only have the full name — split it so the form
  // shows something sensible rather than two empty boxes.
  const [fallbackFirst = '', ...restName] = (c.name ?? '').trim().split(/\s+/);
  const a = c.addressParts ?? {};
  const sa = c.shipping?.addressParts ?? {};
  return {
    products: (c.products ?? []).map(String),
    teams: c.teams ?? [],
    firstName: c.firstName ?? fallbackFirst,
    lastName: c.lastName ?? restName.join(' '),
    email: c.email ?? '',
    phone: c.phone ?? '',
    country: a.country === 'PK' ? 'PK' : 'US',
    line1: a.line1 ?? '',
    line2: a.line2 ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    zip: a.zip ?? '',
    zipPlus4: a.zipPlus4 ?? '',
    notes: c.notes ?? '',
    reseller: c.reseller ?? false,
    shipSameAsBilling: c.shipping?.sameAsBilling !== false,
    shipName: c.shipping?.name ?? '',
    shipPhone: c.shipping?.phone ?? '',
    shipCountry: sa.country === 'PK' ? 'PK' : 'US',
    shipLine1: sa.line1 ?? '',
    shipLine2: sa.line2 ?? '',
    shipCity: sa.city ?? '',
    shipState: sa.state ?? '',
    shipZip: sa.zip ?? '',
    shipZipPlus4: sa.zipPlus4 ?? '',
  };
}

/** Blank optional fields go as undefined so an empty box never stores "". */
function buildPayload(f: FormValues) {
  return {
    firstName: f.firstName.trim(),
    lastName: f.lastName.trim() || undefined,
    email: f.email.trim(),
    // Sent as typed, blank included: the schema has a message for an empty phone, and an omitted
    // one would come back as "Required" instead.
    phone: f.phone.trim(),
    // Always sent, so clearing every box actually clears the stored address.
    addressParts: {
      country: f.country,
      line1: f.line1.trim() || undefined,
      line2: f.line2.trim() || undefined,
      city: f.city.trim() || undefined,
      state: f.state || undefined,
      zip: f.zip.trim() || undefined,
      zipPlus4: f.zipPlus4.trim() || undefined,
    },
    // Always sent, so switching back to "same as billing" actually clears the stored block.
    shipping: f.shipSameAsBilling
      ? { sameAsBilling: true }
      : {
          sameAsBilling: false,
          name: f.shipName.trim() || undefined,
          phone: f.shipPhone.trim() || undefined,
          addressParts: {
            country: f.shipCountry,
            line1: f.shipLine1.trim() || undefined,
            line2: f.shipLine2.trim() || undefined,
            city: f.shipCity.trim() || undefined,
            state: f.shipState || undefined,
            zip: f.shipZip.trim() || undefined,
            zipPlus4: f.shipZipPlus4.trim() || undefined,
          },
        },
    products: f.products,
    teams: f.teams,
    notes: f.notes.trim() || undefined,
    reseller: f.reseller,
  };
}

/*
 * Which tab each field lives on. A tabbed form can hide the very error that is blocking Save, so
 * every tab carries a dot when one of its fields is complaining — the point of splitting the form
 * is less scrolling, not fewer things to find.
 */
const TAB_FIELDS: readonly (readonly string[])[] = [
  [
    'firstName',
    'lastName',
    'email',
    'phone',
    'line1',
    'line2',
    'city',
    'state',
    'zip',
    'zipPlus4',
    'notes',
  ],
  [
    'shipName',
    'shipPhone',
    'shipLine1',
    'shipLine2',
    'shipCity',
    'shipState',
    'shipZip',
    'shipZipPlus4',
    'products',
  ],
];
const TAB_LABELS = ['Customer', 'Shipping & products'] as const;

/*
 * Both panels sit in the same 1×1 grid cell, so the container is always as tall as the taller
 * one and the modal never resizes when tabs are switched. A guessed minHeight cannot do this —
 * the taller panel's height changes with the country (the +4 box) and with error text.
 */
const PANEL_CELL = {
  gridArea: '1 / 1',
  /*
   * One scroll region per panel, from sm up. The products list grows with every product picked,
   * and because both panels share this cell the taller one sets the dialog's height — left to
   * grow, the Save and Cancel buttons walk off the bottom of the screen. Capping the panel
   * rather than the list inside it keeps a single scrollbar: nesting one inside the other left
   * the user guessing which of the two would move.
   *
   * Unbounded below sm, where the modal already scrolls as a whole.
   */
  maxHeight: { sm: 'min(68vh, 580px)' },
  overflowY: { sm: 'auto' },
  // Room for the scrollbar so it never sits on top of a field's focus ring.
  pr: { sm: 1 },
  /*
   * A grid item's min-width defaults to `auto`, meaning it refuses to shrink below its widest
   * child's min-content. Both panels share this one cell, so a single unshrinkable row — a long
   * filename beside a Download button — widened the cell, and with it every field in both tabs,
   * until the content ran past the dialog's own padding.
   */
  minWidth: 0,
} as const;

export function CustomerFormDialog({
  open,
  customer,
  initialMode = 'edit',
  canEdit = true,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  customer: EditableCustomer | null;
  /** Rows open read-only; the pencil in the footer switches to editing. Ignored when creating. */
  initialMode?: FormMode;
  /** Whether the viewer may switch to editing — drives the pencil, not the fields. */
  canEdit?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(customer);
  const [mode, setMode] = useState<FormMode>('edit');
  const readOnly = mode === 'view';

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // These need a render to reflect a pick, so they live in state (mirrored into valuesRef).
  const [reseller, setReseller] = useState(false);
  const [state, setState] = useState('');
  const [country, setCountry] = useState<'US' | 'PK'>('US');
  // The phone picker is controlled (country + national half); the joined E.164 string is what
  // valuesRef carries and the API stores, same as UserFormDialog.
  // Codes are upper-case ('US'); a lower-case literal here matched no country and silently fell
  // back to whichever sits first in the list.
  const [phone, setPhone] = useState({ iso2: DEFAULT_COUNTRY_ISO2, national: '' });
  // Product ids the customer buys — controlled, since a pick has to re-render the chips.
  const [products, setProducts] = useState<string[]>([]);
  // Controlled like the products picker: adding a team has to re-render its chips.
  const [teams, setTeams] = useState<string[]>([]);
  // Per-product discount overrides, held as strings so a half-typed value is not coerced. Blank
  // means "no override" and the product's own discount applies.
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  /*
   * The reseller certificate. `undefined` means untouched (the stored file stays as it is),
   * `null` means the user removed it, and an object is a newly picked file. That three-way is
   * what lets a PATCH tell "leave it alone" apart from "delete it".
   */
  const [certificate, setCertificate] = useState<CertificateFile | null | undefined>(undefined);
  const [certError, setCertError] = useState<string>('');
  // Shipping bits that drive layout, so they need a render: the toggle and the two selects.
  const [shipSame, setShipSame] = useState(true);
  const [shipCountry, setShipCountry] = useState<'US' | 'PK'>('US');
  const [shipState, setShipState] = useState('');
  const [tab, setTab] = useState(0);

  // Drives the Save button. isValid is the same parse as `validate`, reduced to a boolean.
  const isValid = useCallback(
    (f: FormValues) => customerFormSchemaChecked.safeParse(f).success,
    [],
  );
  const guard = useFormGuard<FormValues>({ valuesRef, isValid });

  /*
   * Pulled out as its own binding so the dependency list below can name it. `guard` is a fresh
   * object every render, so depending on that would re-run the reset on every keystroke; the
   * lint rule cannot prove `guard.reset` is stable, but it can track a plain identifier. The
   * callback itself is memoized in useFormGuard.
   */
  const resetGuard = guard.reset;

  /*
   * Read through a ref inside the reset effect below. `initialMode` is a prop, and depending on
   * it directly would re-run the reset — discarding whatever the user had typed — if the parent
   * happened to re-render with a different value while the dialog was open. The mode only ever
   * needs to be read at the moment the dialog opens.
   */
  const initialModeRef = useRef(initialMode);
  initialModeRef.current = initialMode;

  useLayoutEffect(() => {
    if (!open) return;
    const next = customer ? valuesFromCustomer(customer) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setReseller(next.reseller);
    setState(next.state);
    setCountry(next.country);
    setPhone(splitPhone(next.phone));
    setProducts(next.products);
    setTeams(next.teams);
    setDiscounts(
      Object.fromEntries(
        (customer?.productDiscounts ?? []).map((d) => [d.product, String(d.discountPercent)]),
      ),
    );
    setCertificate(undefined);
    setCertError('');
    setShipSame(next.shipSameAsBilling);
    setShipCountry(next.shipCountry);
    setShipState(next.shipState);
    // Creating has nothing to view, so it always opens editable.
    setMode(customer ? initialModeRef.current : 'edit');
    setTab(0);
    resetGuard(next);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, customer, resetGuard]);

  const pickReseller = useCallback(
    (_name: string, v: string) => {
      const isReseller = v === 'yes';
      valuesRef.current.reseller = isReseller;
      setReseller(isReseller);
      guard.refresh();
    },
    [guard],
  );
  const changePhone = useCallback(
    (next: { iso2: string; national: string; e164: string }) => {
      setPhone({ iso2: next.iso2, national: next.national });
      valuesRef.current.phone = next.e164;
      guard.refresh();
    },
    [guard],
  );
  const pickProducts = useCallback(
    (ids: string[]) => {
      valuesRef.current.products = ids;
      setProducts(ids);
      guard.refresh();
    },
    [guard],
  );
  const pickTeams = useCallback(
    (next: string[]) => {
      valuesRef.current.teams = next;
      setTeams(next);
      guard.refresh();
    },
    [guard],
  );
  const changeDiscount = useCallback(
    (productId: string, percent: string) => {
      setDiscounts((d) => ({ ...d, [productId]: percent }));
      guard.refresh();
    },
    [guard],
  );

  const toggleShipSame = useCallback(
    (same: boolean) => {
      valuesRef.current.shipSameAsBilling = same;
      setShipSame(same);
      guard.refresh();
    },
    [guard],
  );

  const pickShipCountry = useCallback(
    (_name: string, v: string) => {
      const next = v === 'PK' ? 'PK' : 'US';
      valuesRef.current.shipCountry = next;
      // The old list's code is meaningless under the new one, and +4 is US-only.
      valuesRef.current.shipState = '';
      setShipState('');
      if (next === 'PK') valuesRef.current.shipZipPlus4 = '';
      setShipCountry(next);
      guard.refresh();
    },
    [guard],
  );

  const pickShipState = useCallback(
    (_name: string, v: string) => {
      valuesRef.current.shipState = v;
      setShipState(v);
      guard.refresh();
    },
    [guard],
  );

  const pickState = useCallback(
    (_name: string, v: string) => {
      valuesRef.current.state = v;
      setState(v);
      guard.refresh();
    },
    [guard],
  );
  // Switching country changes which state list applies, so a code from the old list is cleared;
  // the +4 add-on is US-only and goes with it.
  const pickCountry = useCallback(
    (_name: string, v: string) => {
      const next = v === 'PK' ? 'PK' : 'US';
      valuesRef.current.country = next;
      valuesRef.current.state = '';
      setState('');
      // The +4 add-on is US-only routing.
      if (next === 'PK') valuesRef.current.zipPlus4 = '';
      /*
       * A resale certificate exempts a customer from US sales tax, and Pakistani invoices carry
       * none to be exempt from — so a customer moved to Pakistan stops being a reseller rather
       * than keeping a flag nobody can now see or clear.
       */
      if (!canBeReseller(next)) {
        valuesRef.current.reseller = false;
        setReseller(false);
      }
      /*
       * The phone's dial code follows the address country: a customer billed in Pakistan is
       * reached on a +92 number far more often than not, and having to fix the prefix by hand
       * after every country pick is the sort of step people forget. Digits already typed are
       * kept — only the code in front of them changes — and the picker still overrides it.
       */
      const { national } = splitPhone(valuesRef.current.phone);
      valuesRef.current.phone = joinPhone(next, national);
      setPhone({ iso2: next, national });
      setCountry(next);
      guard.refresh();
    },
    [guard],
  );

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = customerFormSchemaChecked.safeParse(f);
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback(
    (key: string, value: string) => {
      // Only the string fields flow through here; reseller has its own handler.
      valuesRef.current[key as TextKey] = value;
      guard.refresh();
    },
    [guard],
  );

  const blurField = useCallback(
    (key: string) => {
      // Leaving a box you never typed in is not a mistake. First name is autofocused on open, so
      // clicking anything at all used to blur it and open a brand-new form in red.
      const value = valuesRef.current[key as TextKey];
      if (!guard.dirty && typeof value === 'string' && value.trim() === '') return;
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current));
    },
    [validate, guard],
  );

  /*
   * Errors normally wait for a blur or a submit, so a pristine form never opens in red. That
   * breaks down when the form is dirty and still will not parse: Save is disabled, its caption
   * says to fix the highlighted fields, and nothing is highlighted because the offending field
   * was never touched — a stored address whose country and state disagree, say. In that state
   * the errors are computed live so the caption is always pointing at something real.
   */
  const liveErrors = useMemo<FieldErrors>(
    () => (guard.dirty && !guard.valid ? validate(valuesRef.current) : {}),
    [guard.dirty, guard.valid, validate],
  );

  const shown = useCallback(
    (key: string) => (submitted || touched[key] ? errors[key] : liveErrors[key]),
    [submitted, touched, errors, liveErrors],
  );

  /** True when a field on this tab is currently showing an error. */
  const tabHasError = useCallback(
    (index: number) => TAB_FIELDS[index].some((key) => Boolean(shown(key))),
    [shown],
  );

  /** Every input is inert while saving or while the dialog is being read rather than edited. */
  const locked = saving || readOnly;

  /* Same-as-billing means the shipping block is not stored, so its inputs are inert — greyed
     rather than gone, to keep the panel's height steady across the toggle. */
  /*
   * The certificate's display name, and whether the box should offer to attach one. `null` on
   * `certificate` means "remove on save", so a stored file must not count as present once the
   * user has cleared it.
   */
  const certName =
    certificate === null
      ? null
      : (certificate?.name ?? customer?.resellerCertificate?.name ?? null);
  /** The stored file's size when nothing new has been picked, so the box reads the same either way. */
  const certSize = certificate?.size ?? customer?.resellerCertificate?.size;

  const shipDisabled = locked || shipSame;

  const close = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmitted(false);
    onClose();
  }, [onClose]);

  async function submit() {
    setSubmitted(true);
    const values = valuesRef.current;
    // Save is disabled while the form does not parse, so reaching here means it does. Re-checked
    // anyway: submit is also reachable by Enter, and a stale guard must not let a bad payload out.
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const payload = {
      ...buildPayload(values),
      /*
       * Only products still selected carry a discount, and only where a number was actually
       * typed — a blank box means "use the product's own discount", which is the absence of an
       * entry rather than a zero.
       */
      productDiscounts: values.products
        .filter((id) => (discounts[id] ?? '').trim() !== '')
        .map((id) => ({ product: id, discountPercent: Number(discounts[id]) })),
      // Absent leaves the stored file alone; null removes it; an object replaces it.
      ...(certificate === undefined ? {} : { resellerCertificate: certificate }),
    };
    // Both typed the same so `res` is one shape; only the create path reads `_id` back.
    const res = isEdit
      ? await apiPatch(`/api/customers/${customer!._id}`, payload)
      : await apiPost('/api/customers', payload);
    setSaving(false);

    if (!res.ok) {
      // A duplicate email arrives as a field error (see lib/api/errors), so it lands on the
      // email box the same way a validation failure does.
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(
        res.error ?? (isEdit ? 'Could not update customer' : 'Could not create customer'),
        { variant: 'error' },
      );
      return;
    }

    enqueueSnackbar(isEdit ? 'Customer updated' : 'Customer created', { variant: 'success' });
    close();
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        !isEdit
          ? 'New customer'
          : readOnly
            ? (customer?.name ?? 'Customer')
            : `Edit ${customer?.name ?? 'customer'}`
      }
      description={
        !isEdit
          ? 'Add a reusable customer any role can pick on an invoice.'
          : readOnly
            ? 'Read-only. Use Edit to make changes.'
            : 'Changes apply to future invoices that pick this customer.'
      }
      icon={isEdit ? <EditRounded /> : <AddRounded />}
      maxWidth="md"
      fullScreenOnMobile
      busy={saving}
      actions={
        readOnly ? (
          <>
            <Button onClick={close} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
              Close
            </Button>
            {canEdit && (
              <Button
                variant="contained"
                onClick={() => setMode('edit')}
                startIcon={<EditRounded />}
              >
                Edit
              </Button>
            )}
          </>
        ) : (
          <>
            {/* A disabled button with no stated reason leaves people guessing, and in a form this
              tall the offending field is often off-screen. Say which of the two it is. */}
            {guard.reason && !saving && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mr: { sm: 'auto' }, alignSelf: 'center' }}
              >
                {guard.reason}
              </Typography>
            )}
            <Button
              onClick={close}
              disabled={saving}
              variant="outlined"
              color="inherit"
              startIcon={<CloseRounded />}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={submit}
              disabled={saving || !guard.dirty || !guard.valid}
              startIcon={isEdit ? <SaveRounded /> : <AddRounded />}
            >
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </>
        )
      }
    >
      <Tabs
        value={tab}
        onChange={(_e, v: number) => setTab(v)}
        sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none' } }}
      >
        {TAB_LABELS.map((label, i) => (
          <Tab
            key={label}
            label={
              <Stack direction="row" spacing={0.75} alignItems="center">
                <span>{label}</span>
                {/* A dot, not a count: which tab to look at is the useful part. */}
                {tabHasError(i) && (
                  <Box
                    sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'error.main' }}
                    aria-label="has errors"
                  />
                )}
              </Stack>
            }
          />
        ))}
      </Tabs>

      {/* Panels stay mounted and are hidden with CSS: the text inputs are uncontrolled and read
          their defaults once at mount, so unmounting a tab would throw away whatever was typed
          on it. */}
      <Box sx={{ display: 'grid' }}>
        <Stack
          key={formKey}
          spacing={3}
          sx={{ ...PANEL_CELL, visibility: tab === 0 ? 'visible' : 'hidden' }}
        >
          <FormSection title="Basic details">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="firstName"
                  label="First name"
                  placeholder="e.g. John"
                  defaultValue={initial.firstName}
                  helperText={shown('firstName')}
                  error={Boolean(shown('firstName'))}
                  required
                  autoFocus={!isEdit}
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="lastName"
                  label="Last name"
                  placeholder="e.g. Smith"
                  defaultValue={initial.lastName}
                  helperText={shown('lastName')}
                  error={Boolean(shown('lastName'))}
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="email"
                  label="Email"
                  type="email"
                  placeholder="e.g. john@company.com"
                  defaultValue={initial.email}
                  helperText={shown('email')}
                  error={Boolean(shown('email'))}
                  required
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <PhoneField
                  iso2={phone.iso2}
                  national={phone.national}
                  onChange={changePhone}
                  onBlur={() => blurField('phone')}
                  required
                  helperText={shown('phone')}
                  error={Boolean(shown('phone'))}
                  disabled={locked}
                />
              </Grid>
              {/* Half a row, sharing it with Reseller: both describe the account rather than the
                  address, and the box grows downward as chips wrap rather than pushing the
                  reseller field around. */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <CustomerTeamsField
                  value={teams}
                  onChange={pickTeams}
                  max={TEAMS_MAX}
                  disabled={locked}
                />
              </Grid>
              {/* Tax status, US only: a resale certificate exempts US sales tax, which Pakistani
                  invoices do not charge, so the question does not arise there. The invoice type
                  it implies is derived on the server — see `invoiceTypeFor` — so there is
                  nothing else to pick here. */}
              {canBeReseller(country) && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <SelectInput
                    name="reseller"
                    label="Reseller"
                    value={reseller ? 'yes' : 'no'}
                    options={RESELLER_OPTIONS}
                    disabled={locked}
                    onChange={pickReseller}
                  />
                </Grid>
              )}
              {/* Only for resellers — the certificate is the evidence for the exemption, so it
                  has nowhere to belong on a customer who is not claiming one. */}
              {reseller && (
                <Grid size={12}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mb: 1, display: 'block' }}
                  >
                    Reseller certificate
                  </Typography>
                  {/* The same dropzone the customer sees on their intake form, so a certificate
                      staff attach and one a customer uploads are the same control. */}
                  <CertificateDropzone
                    file={certName ? { name: certName, size: certSize } : null}
                    onPick={(f) => {
                      setCertificate(f);
                      setCertError('');
                    }}
                    onRemove={() => {
                      setCertificate(null);
                      setCertError('');
                    }}
                    onError={setCertError}
                    error={certError}
                    disabled={locked || saving}
                    downloadHref={
                      readOnly && customer?.resellerCertificate
                        ? `/api/customers/${customer._id}/certificate`
                        : undefined
                    }
                  />
                </Grid>
              )}
            </Grid>
          </FormSection>

          <FormSection title="Address">
            <Grid container spacing={2}>
              {/* Country decides the shape: US shows the client's structured fields, Pakistan is
                street + city only. */}
              <Grid size={{ xs: 12, sm: 3 }}>
                <SelectInput
                  name="country"
                  label="Country"
                  value={country}
                  options={COUNTRY_OPTIONS}
                  disabled={locked}
                  onChange={pickCountry}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextInput
                  name="line1"
                  label="Street address"
                  placeholder={country === 'US' ? 'e.g. 5775 Riverside Dr' : 'e.g. 12 Gulberg Blvd'}
                  defaultValue={initial.line1}
                  helperText={shown('line1')}
                  error={Boolean(shown('line1'))}
                  required
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextInput
                  name="line2"
                  label="Apt / suite / unit"
                  placeholder="e.g. Suite 210"
                  defaultValue={initial.line2}
                  helperText={shown('line2')}
                  error={Boolean(shown('line2'))}
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              {/* Same layout for both countries — only the state list changes, and the +4 add-on
                is US-only routing so Pakistan doesn't show it. */}
              <Grid size={{ xs: 12, sm: country === 'US' ? 5 : 4 }}>
                <TextInput
                  name="city"
                  label="City"
                  placeholder={country === 'US' ? 'e.g. Chino' : 'e.g. Lahore'}
                  defaultValue={initial.city}
                  helperText={shown('city')}
                  error={Boolean(shown('city'))}
                  required
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: country === 'US' ? 3 : 4 }}>
                <SelectInput
                  name="state"
                  label={country === 'US' ? 'State' : 'Province'}
                  value={state}
                  options={STATE_OPTIONS[country]}
                  placeholderLabel={country === 'US' ? 'Pick a state' : 'Pick a province'}
                  helperText={shown('state')}
                  error={Boolean(shown('state'))}
                  required
                  disabled={locked}
                  onChange={pickState}
                />
              </Grid>
              {/* Without the +4 beside it, the postal code takes that slot too — "Postal code"
                is a longer label than "ZIP" and was clipping its own border at 2 columns. */}
              <Grid size={{ xs: country === 'US' ? 7 : 12, sm: country === 'US' ? 2 : 4 }}>
                <TextInput
                  name="zip"
                  label={country === 'US' ? 'ZIP' : 'Postal code'}
                  placeholder={country === 'US' ? 'e.g. 91710' : 'e.g. 54000'}
                  defaultValue={initial.zip}
                  helperText={shown('zip')}
                  error={Boolean(shown('zip'))}
                  required
                  inputMode="numeric"
                  maxLength={5}
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              {country === 'US' && (
                <Grid size={{ xs: 5, sm: 2 }}>
                  <TextInput
                    name="zipPlus4"
                    label="+4"
                    placeholder="e.g. 6710"
                    defaultValue={initial.zipPlus4}
                    helperText={shown('zipPlus4')}
                    error={Boolean(shown('zipPlus4'))}
                    inputMode="numeric"
                    maxLength={4}
                    disabled={locked}
                    onChange={setText}
                    onBlur={blurField}
                  />
                </Grid>
              )}
            </Grid>
          </FormSection>

          {/* Notes live with the customer, not with shipping: they describe the account, and on
              the other tab they sat under a products picker they had nothing to do with. */}
          <TextInput
            name="notes"
            label="Notes"
            defaultValue={initial.notes}
            helperText={shown('notes')}
            error={Boolean(shown('notes'))}
            disabled={locked}
            multiline
            minRows={2}
            placeholder="Only visible to admins"
            onChange={setText}
            onBlur={blurField}
          />
        </Stack>

        <Stack
          key={`ship-${formKey}`}
          spacing={3}
          sx={{ ...PANEL_CELL, visibility: tab === 1 ? 'visible' : 'hidden' }}
        >
          <FormSection title="Shipping">
            <FormControlLabel
              sx={{ mb: 1 }}
              control={
                <Switch
                  checked={shipSame}
                  disabled={locked}
                  onChange={(e) => toggleShipSame(e.target.checked)}
                />
              }
              label="Ships to the billing address"
            />
            {shipSame && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Invoices for this customer will show the billing name and address under SHIP TO.
                Nothing is stored separately, so correcting the billing address corrects both.
              </Typography>
            )}
            {/* The fields stay on screen and grey out rather than disappearing: the layout keeps
              its height when the switch is flipped, and a returning editor can still read the
              delivery address that was set up before.

              MUI's own disabled styling is subtle enough that the block still reads as clickable,
              so the whole group is dimmed and made inert: `pointer-events: none` stops the hover
              and caret feedback that made it look live, and `aria-hidden` keeps a screen reader
              from walking fields nobody can reach. The individual inputs stay `disabled` too —
              this is the visual layer, not the guard. */}
            <Grid
              container
              spacing={2}
              aria-hidden={shipSame}
              sx={
                shipSame
                  ? { opacity: 0.45, pointerEvents: 'none', transition: 'opacity .18s ease' }
                  : { transition: 'opacity .18s ease' }
              }
            >
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="shipName"
                  label="Ship to name"
                  placeholder="e.g. Acme Warehouse"
                  defaultValue={initial.shipName}
                  helperText={shown('shipName')}
                  error={Boolean(shown('shipName'))}
                  required
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="shipPhone"
                  label="Contact phone"
                  placeholder="e.g. 415 555 0132"
                  defaultValue={initial.shipPhone}
                  helperText={shown('shipPhone')}
                  error={Boolean(shown('shipPhone'))}
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <SelectInput
                  name="shipCountry"
                  label="Country"
                  value={shipCountry}
                  options={COUNTRY_OPTIONS}
                  disabled={shipDisabled}
                  onChange={pickShipCountry}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <TextInput
                  name="shipLine1"
                  label="Street address"
                  placeholder={
                    shipCountry === 'US' ? 'e.g. 5775 Riverside Dr' : 'e.g. 12 Gulberg Blvd'
                  }
                  defaultValue={initial.shipLine1}
                  helperText={shown('shipLine1')}
                  error={Boolean(shown('shipLine1'))}
                  required
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextInput
                  name="shipLine2"
                  label="Apt / suite / unit"
                  placeholder="e.g. Suite 300"
                  defaultValue={initial.shipLine2}
                  helperText={shown('shipLine2')}
                  error={Boolean(shown('shipLine2'))}
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: shipCountry === 'PK' ? 4 : 5 }}>
                <TextInput
                  name="shipCity"
                  label="City"
                  placeholder={shipCountry === 'US' ? 'e.g. Atlanta' : 'e.g. Lahore'}
                  defaultValue={initial.shipCity}
                  helperText={shown('shipCity')}
                  error={Boolean(shown('shipCity'))}
                  required
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: shipCountry === 'PK' ? 4 : 3 }}>
                <SelectInput
                  name="shipState"
                  label={shipCountry === 'PK' ? 'Province' : 'State'}
                  value={shipState}
                  options={STATE_OPTIONS[shipCountry]}
                  placeholderLabel={shipCountry === 'PK' ? 'Pick a province' : 'Pick a state'}
                  helperText={shown('shipState')}
                  error={Boolean(shown('shipState'))}
                  required
                  disabled={shipDisabled}
                  onChange={pickShipState}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: shipCountry === 'PK' ? 4 : 2 }}>
                <TextInput
                  name="shipZip"
                  label={shipCountry === 'PK' ? 'Postal code' : 'ZIP'}
                  placeholder={shipCountry === 'PK' ? 'e.g. 54000' : 'e.g. 30328'}
                  defaultValue={initial.shipZip}
                  helperText={shown('shipZip')}
                  error={Boolean(shown('shipZip'))}
                  required
                  inputMode="numeric"
                  maxLength={5}
                  disabled={shipDisabled}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              {shipCountry === 'US' && (
                <Grid size={{ xs: 12, sm: 2 }}>
                  <TextInput
                    name="shipZipPlus4"
                    label="+4"
                    placeholder="e.g. 1234"
                    defaultValue={initial.shipZipPlus4}
                    helperText={shown('shipZipPlus4')}
                    error={Boolean(shown('shipZipPlus4'))}
                    inputMode="numeric"
                    maxLength={4}
                    disabled={shipDisabled}
                    onChange={setText}
                    onBlur={blurField}
                  />
                </Grid>
              )}
            </Grid>
          </FormSection>

          {/* Saved with the rest of the form — the ids live on the customer record, so there is
            nothing to write separately and nothing to stage while creating. */}
          <FormSection title="Products">
            <CustomerProductsField
              value={products}
              onChange={pickProducts}
              discounts={discounts}
              onDiscountChange={changeDiscount}
              disabled={locked}
            />
          </FormSection>
        </Stack>
      </Box>
    </Modal>
  );
}
