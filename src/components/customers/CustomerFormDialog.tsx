'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import PersonAddRounded from '@mui/icons-material/PersonAddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import Grid2 from '@mui/material/Grid2';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { customerFormSchema } from '@/modules/customers/schemas';
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
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  notes?: string;
  reseller?: boolean;
  invoiceType?: string;
}

interface FormValues {
  name: string;
  email: string;
  phone: string;
  company: string;
  address: string;
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

type TextKey = 'name' | 'email' | 'phone' | 'company' | 'address' | 'notes';

const EMPTY: FormValues = {
  name: '',
  email: '',
  phone: '',
  company: '',
  address: '',
  notes: '',
  reseller: false,
  invoiceType: '',
};

function valuesFromCustomer(c: EditableCustomer): FormValues {
  return {
    name: c.name ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company ?? '',
    address: c.address ?? '',
    notes: c.notes ?? '',
    reseller: c.reseller ?? false,
    invoiceType: c.invoiceType ?? '',
  };
}

/** Blank optional fields go as undefined so an empty box never stores "". */
function buildPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    email: f.email.trim() || undefined,
    phone: f.phone.trim() || undefined,
    company: f.company.trim() || undefined,
    address: f.address.trim() || undefined,
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
  // These two need a render to reflect a pick, so they live in state (mirrored into valuesRef).
  const [reseller, setReseller] = useState(false);
  const [invoiceType, setInvoiceType] = useState('');

  useLayoutEffect(() => {
    if (!open) return;
    const next = customer ? valuesFromCustomer(customer) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setReseller(next.reseller);
    setInvoiceType(next.invoiceType);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, customer]);

  const toggleReseller = useCallback((v: boolean) => {
    valuesRef.current.reseller = v;
    setReseller(v);
  }, []);
  const pickType = useCallback((_name: string, v: string) => {
    valuesRef.current.invoiceType = v;
    setInvoiceType(v);
  }, []);

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = customerFormSchema.safeParse(f);
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
      icon={isEdit ? <EditRounded /> : <PersonAddRounded />}
      maxWidth="sm"
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
            startIcon={isEdit ? <SaveRounded /> : <PersonAddRounded />}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
        <FormSection title="Basic details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                defaultValue={initial.name}
                helperText={shown('name')}
                error={Boolean(shown('name'))}
                required
                autoFocus={!isEdit}
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
                defaultValue={initial.email}
                helperText={shown('email')}
                error={Boolean(shown('email'))}
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="phone"
                label="Phone"
                defaultValue={initial.phone}
                helperText={shown('phone')}
                error={Boolean(shown('phone'))}
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <TextInput
                name="company"
                label="Company"
                defaultValue={initial.company}
                helperText={shown('company')}
                error={Boolean(shown('company'))}
                disabled={saving}
                placeholder="e.g. Acme Corp"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <TextInput
                name="address"
                label="Address"
                defaultValue={initial.address}
                helperText={shown('address')}
                error={Boolean(shown('address'))}
                disabled={saving}
                multiline
                minRows={2}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Billing profile">
          <Grid2 container spacing={2} alignItems="center">
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <SelectInput
                name="invoiceType"
                label="Default invoice type"
                value={invoiceType}
                options={TYPE_OPTIONS}
                disabled={saving}
                onChange={pickType}
              />
            </Grid2>
            <Grid2 size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={reseller}
                    disabled={saving}
                    onChange={(e) => toggleReseller(e.target.checked)}
                  />
                }
                label="Reseller (tax-exempt)"
              />
            </Grid2>
          </Grid2>
        </FormSection>

        <FormSection title="Internal notes">
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
        </FormSection>
      </Stack>
    </Modal>
  );
}
