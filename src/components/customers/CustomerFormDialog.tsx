'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
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
import { splitPhone } from '@/lib/format/countries';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { CustomerProductsField } from '@/components/customers/CustomerProductsField';
import { useFormGuard } from '@/components/form/useFormGuard';
import type { FormMode } from '@/components/ui/Modal';
import { customerFormSchemaChecked } from '@/modules/customers/schemas';
import { statesFor, type AddressParts } from '@/modules/customers/address';
import { InvoiceType } from '@/modules/invoicing/enums';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

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
  invoiceType?: string;
  /** Product ids this customer buys. */
  products?: string[];
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
  invoiceType: string;
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

const TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'No default' },
  { value: InvoiceType.Tax, label: 'US Tax' },
  { value: InvoiceType.Cash, label: 'US Cash' },
  { value: InvoiceType.PK, label: 'Pakistan' },
];

/** Reseller drives tax exemption; a dropdown reads better than a lone checkbox in this row. */
const RESELLER_OPTIONS: SelectOption[] = [
  { value: 'no', label: 'No — charges sales tax' },
  { value: 'yes', label: 'Yes — tax-exempt' },
];

const COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' },
];

/** US states or PK provinces, same shape either way. */
const STATE_OPTIONS: Record<'US' | 'PK', SelectOption[]> = {
  US: statesFor('US').map((s) => ({ value: s.code, label: `${s.code} — ${s.name}` })),
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
  invoiceType: '',
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
    invoiceType: c.invoiceType ?? '',
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
    phone: f.phone.trim() || undefined,
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
    notes: f.notes.trim() || undefined,
    reseller: f.reseller,
    invoiceType: (f.invoiceType || undefined) as InvoiceType | undefined,
  };
}

/*
 * Which tab each field lives on. A tabbed form can hide the very error that is blocking Save, so
 * every tab carries a dot when one of its fields is complaining — the point of splitting the form
 * is less scrolling, not fewer things to find.
 */
const TAB_FIELDS: readonly (readonly string[])[] = [
  ['firstName', 'lastName', 'email', 'phone', 'line1', 'line2', 'city', 'state', 'zip', 'zipPlus4'],
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
    'notes',
  ],
];
const TAB_LABELS = ['Customer', 'Shipping & products'] as const;

/*
 * Both panels sit in the same 1×1 grid cell, so the container is always as tall as the taller
 * one and the modal never resizes when tabs are switched. A guessed minHeight cannot do this —
 * the taller panel's height changes with the country (the +4 box) and with error text.
 */
const PANEL_CELL = { gridArea: '1 / 1' } as const;

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
  const [invoiceType, setInvoiceType] = useState('');
  const [reseller, setReseller] = useState(false);
  const [state, setState] = useState('');
  const [country, setCountry] = useState<'US' | 'PK'>('US');
  // The phone picker is controlled (country + national half); the joined E.164 string is what
  // valuesRef carries and the API stores, same as UserFormDialog.
  const [phone, setPhone] = useState({ iso2: 'us', national: '' });
  // Product ids the customer buys — controlled, since a pick has to re-render the chips.
  const [products, setProducts] = useState<string[]>([]);
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

  useLayoutEffect(() => {
    if (!open) return;
    const next = customer ? valuesFromCustomer(customer) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setInvoiceType(next.invoiceType);
    setReseller(next.reseller);
    setState(next.state);
    setCountry(next.country);
    setPhone(splitPhone(next.phone));
    setProducts(next.products);
    setShipSame(next.shipSameAsBilling);
    setShipCountry(next.shipCountry);
    setShipState(next.shipState);
    // Creating has nothing to view, so it always opens editable.
    setMode(customer ? initialMode : 'edit');
    setTab(0);
    guard.reset(next);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, customer]);

  const pickType = useCallback(
    (_name: string, v: string) => {
      valuesRef.current.invoiceType = v;
      setInvoiceType(v);
      guard.refresh();
    },
    [guard],
  );
  const pickReseller = useCallback(
    (_name: string, v: string) => {
      valuesRef.current.reseller = v === 'yes';
      setReseller(v === 'yes');
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
      if (next === 'PK') valuesRef.current.zipPlus4 = '';
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
      // Only the string fields flow through here; reseller/invoiceType have their own handlers.
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

  const shown = useCallback(
    (key: string) => (submitted || touched[key] ? errors[key] : undefined),
    [submitted, touched, errors],
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
    const payload = buildPayload(values);
    // Both typed the same so `res` is one shape; only the create path reads `_id` back.
    const res = isEdit
      ? await apiPatch(`/api/customers/${customer!._id}`, payload)
      : await apiPost('/api/customers', payload);
    setSaving(false);

    if (!res.ok) {
      const fieldErrors = serverFieldErrors(res.details);
      // A duplicate email comes back as a plain message, not a field path; pin it to the field
      // so the form marks it rather than only flashing a toast.
      if (res.error && /email/i.test(res.error)) fieldErrors.email = res.error;
      setErrors(fieldErrors);
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
                  helperText={shown('phone')}
                  error={Boolean(shown('phone'))}
                  disabled={locked}
                />
              </Grid>
              {/* The account row: tax status and how they're billed. */}
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
              <Grid size={{ xs: 12, sm: 6 }}>
                <SelectInput
                  name="invoiceType"
                  label="Default invoice type"
                  value={invoiceType}
                  options={TYPE_OPTIONS}
                  disabled={locked}
                  onChange={pickType}
                />
              </Grid>
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
              delivery address that was set up before. */}
            <Grid container spacing={2}>
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
            <CustomerProductsField value={products} onChange={pickProducts} disabled={locked} />
          </FormSection>

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
      </Box>
    </Modal>
  );
}
