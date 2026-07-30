'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
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
}

interface FormValues {
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
  | 'notes';

const EMPTY: FormValues = {
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
};

function valuesFromCustomer(c: EditableCustomer): FormValues {
  // Records created before first/last existed only have the full name — split it so the form
  // shows something sensible rather than two empty boxes.
  const [fallbackFirst = '', ...restName] = (c.name ?? '').trim().split(/\s+/);
  const a = c.addressParts ?? {};
  return {
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
    notes: f.notes.trim() || undefined,
    reseller: f.reseller,
    invoiceType: (f.invoiceType || undefined) as InvoiceType | undefined,
  };
}

export function CustomerFormDialog({
  open,
  customer,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  customer: EditableCustomer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(customer);

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
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, customer]);

  const pickType = useCallback((_name: string, v: string) => {
    valuesRef.current.invoiceType = v;
    setInvoiceType(v);
  }, []);
  const pickReseller = useCallback((_name: string, v: string) => {
    valuesRef.current.reseller = v === 'yes';
    setReseller(v === 'yes');
  }, []);
  const changePhone = useCallback((next: { iso2: string; national: string; e164: string }) => {
    setPhone({ iso2: next.iso2, national: next.national });
    valuesRef.current.phone = next.e164;
  }, []);
  const pickState = useCallback((_name: string, v: string) => {
    valuesRef.current.state = v;
    setState(v);
  }, []);
  // Switching country changes which state list applies, so a code from the old list is cleared;
  // the +4 add-on is US-only and goes with it.
  const pickCountry = useCallback((_name: string, v: string) => {
    const next = v === 'PK' ? 'PK' : 'US';
    valuesRef.current.country = next;
    valuesRef.current.state = '';
    setState('');
    if (next === 'PK') valuesRef.current.zipPlus4 = '';
    setCountry(next);
  }, []);

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = customerFormSchemaChecked.safeParse(f);
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback((key: string, value: string) => {
    // Only the string fields flow through here; reseller/invoiceType have their own handlers.
    valuesRef.current[key as TextKey] = value;
  }, []);

  const blurField = useCallback(
    (key: string) => {
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current));
    },
    [validate],
  );

  const shown = useCallback(
    (key: string) => (submitted || touched[key] ? errors[key] : undefined),
    [submitted, touched, errors],
  );

  const close = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmitted(false);
    onClose();
  }, [onClose]);

  async function submit() {
    setSubmitted(true);
    const values = valuesRef.current;
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }

    setSaving(true);
    const payload = buildPayload(values);
    const res = isEdit
      ? await apiPatch(`/api/customers/${customer!._id}`, payload)
      : await apiPost('/api/customers', payload);
    setSaving(false);

    if (!res.ok) {
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
      title={isEdit ? `Edit ${customer?.name ?? 'customer'}` : 'New customer'}
      description={
        isEdit
          ? 'Changes apply to future invoices that pick this customer.'
          : 'Add a reusable customer any role can pick on an invoice.'
      }
      icon={isEdit ? <EditRounded /> : <AddRounded />}
      maxWidth="md"
      busy={saving}
      actions={
        <>
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
            disabled={saving}
            startIcon={isEdit ? <SaveRounded /> : <AddRounded />}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
              />
            </Grid>
            {/* The account row: tax status and how they're billed. */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <SelectInput
                name="reseller"
                label="Reseller"
                value={reseller ? 'yes' : 'no'}
                options={RESELLER_OPTIONS}
                disabled={saving}
                onChange={pickReseller}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <SelectInput
                name="invoiceType"
                label="Default invoice type"
                value={invoiceType}
                options={TYPE_OPTIONS}
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                disabled={saving}
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
                  disabled={saving}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
            )}
          </Grid>
        </FormSection>

        <TextInput
          name="notes"
          label="Notes"
          defaultValue={initial.notes}
          helperText={shown('notes')}
          error={Boolean(shown('notes'))}
          disabled={saving}
          multiline
          minRows={2}
          placeholder="Only visible to admins"
          onChange={setText}
          onBlur={blurField}
        />
      </Stack>
    </Modal>
  );
}
