'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput, type SelectOption } from '@/components/form/fields';
import { useFormGuard } from '@/components/form/useFormGuard';
import type { FormMode } from '@/components/ui/Modal';
import { productFormSchema } from '@/modules/products/schemas';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * One dialog for creating and editing a product (admin only). Typed values live in a ref so a
 * keystroke re-renders only the input being typed in. `product` null = create mode.
 *
 * No customer pricing here: the relationship is owned from the customer's side — a customer
 * lists the products it buys, and its Pricing action sets what it pays for them. Editing the
 * same link from both ends was two places to look and two places to disagree.
 */

export interface EditableProduct {
  _id: string;
  name: string;
  sku: string;
  defaultRate: number;
  /** Standing discount, percent. */
  discount?: number;
  unit?: string;
  /** Fabric id, when the product is linked to one. */
  fabric?: string | null;
  description?: string;
}

interface FabricOption {
  _id: string;
  name: string;
  gsm: number | null;
  type: string;
}

interface FormValues {
  name: string;
  sku: string;
  defaultRate: string;
  discount: string;
  unit: string;
  fabric: string;
  description: string;
}

type FieldKey = keyof FormValues;

const EMPTY: FormValues = {
  name: '',
  sku: '',
  defaultRate: '',
  discount: '',
  unit: '',
  fabric: '',
  description: '',
};

function valuesFromProduct(p: EditableProduct): FormValues {
  return {
    name: p.name ?? '',
    sku: p.sku ?? '',
    defaultRate: p.defaultRate != null ? String(p.defaultRate) : '',
    // 0 shows as blank: "no discount" reads better as an empty field than as a typed zero.
    discount: p.discount ? String(p.discount) : '',
    unit: p.unit ?? '',
    fabric: p.fabric ? String(p.fabric) : '',
    description: p.description ?? '',
  };
}

/** Blank optional fields go as undefined; rate is coerced to a number. */
function buildPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    sku: f.sku.trim(),
    defaultRate: Number(f.defaultRate),
    discount: f.discount.trim() === '' ? 0 : Number(f.discount),
    unit: f.unit.trim() || undefined,
    // Sent as '' rather than omitted so clearing the picker actually unlinks the fabric.
    fabric: f.fabric,
    description: f.description.trim(),
  };
}

/** "Cotton Jersey · 180 GSM · Knit" — the spec that matters, on one line. */
function fabricLabel(f: FabricOption): string {
  return [f.name, f.gsm != null ? `${f.gsm} GSM` : null, f.type || null]
    .filter(Boolean)
    .join(' · ');
}

export function ProductFormDialog({
  open,
  product,
  initialMode = 'edit',
  canEdit = true,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  product: EditableProduct | null;
  /** Rows open read-only; the pencil in the footer switches to editing. Ignored when creating. */
  initialMode?: FormMode;
  /** Whether the viewer may switch to editing — drives the pencil, not the fields. */
  canEdit?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(product);
  const [mode, setMode] = useState<FormMode>('edit');
  const readOnly = mode === 'view';

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // The picker is controlled (a pick has to re-render the select), unlike the text fields.
  const [fabric, setFabric] = useState('');
  /** Every input is inert while saving or while the dialog is being read rather than edited. */
  const locked = saving || readOnly;

  // Drives the Save button: same parse the field errors use, reduced to a boolean.
  const isValid = useCallback(
    (f: FormValues) =>
      productFormSchema.safeParse({
        ...f,
        defaultRate: Number(f.defaultRate),
        discount: f.discount.trim() === '' ? 0 : Number(f.discount),
      }).success,
    [],
  );
  const guard = useFormGuard<FormValues>({ valuesRef, isValid });

  // Only fetched while the dialog is open — the catalogue list itself has no use for it.
  // globalLoading off: the fetch shows as the picker's own loading state, not an app overlay
  // dropped over the dialog.
  const { data: fabricData, isLoading: fabricsLoading } = useApi<{ items: FabricOption[] }>(
    open ? '/api/fabrics/options' : null,
    { globalLoading: false },
  );
  const fabricOptions: SelectOption[] = useMemo(
    () => (fabricData?.items ?? []).map((f) => ({ value: f._id, label: fabricLabel(f) })),
    [fabricData],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const next = product ? valuesFromProduct(product) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setFabric(next.fabric);
    // Creating has nothing to view, so it always opens editable.
    setMode(product ? initialMode : 'edit');
    guard.reset(next);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, product]);

  const validate = useCallback((f: FormValues): FieldErrors => {
    // Rate is a string in the form; validate the coerced number the payload will send.
    const result = productFormSchema.safeParse({
      ...f,
      defaultRate: Number(f.defaultRate),
      discount: f.discount.trim() === '' ? 0 : Number(f.discount),
    });
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback(
    (key: string, value: string) => {
      valuesRef.current[key as FieldKey] = value;
      guard.refresh();
    },
    [guard],
  );

  const pickFabric = useCallback(
    (_key: string, value: string) => {
      valuesRef.current.fabric = value;
      setFabric(value);
      guard.refresh();
    },
    [guard],
  );

  const blurField = useCallback(
    (key: string) => {
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current));
    },
    [validate],
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

  const close = useCallback(() => {
    setErrors({});
    setTouched({});
    setSubmitted(false);
    onClose();
  }, [onClose]);

  async function submit() {
    setSubmitted(true);
    const values = valuesRef.current;
    // Save is disabled while the form does not parse; re-checked because Enter also submits.
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    const payload = buildPayload(values);
    const res = isEdit
      ? await apiPatch(`/api/products/${product!._id}`, payload)
      : await apiPost('/api/products', payload);
    setSaving(false);

    if (!res.ok) {
      const fieldErrors = serverFieldErrors(res.details);
      // A duplicate SKU is reported as a plain message; pin it to the SKU field.
      if (res.error && /sku/i.test(res.error)) fieldErrors.sku = res.error;
      setErrors(fieldErrors);
      enqueueSnackbar(
        res.error ?? (isEdit ? 'Could not update product' : 'Could not create product'),
        { variant: 'error' },
      );
      return;
    }
    enqueueSnackbar(isEdit ? 'Product updated' : 'Product created', { variant: 'success' });
    close();
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        !isEdit
          ? 'New product'
          : readOnly
            ? (product?.name ?? 'Product')
            : `Edit ${product?.name ?? 'product'}`
      }
      description={
        !isEdit
          ? 'Add a catalogue item. Set per-customer rates after saving.'
          : readOnly
            ? 'Read-only. Use Edit to make changes.'
            : 'Update the catalogue entry and its per-customer pricing.'
      }
      icon={isEdit ? <EditRounded /> : <AddRounded />}
      // md (900px), same as the customer form: at sm the two-up fields are ~250px wide and every
      // helper text wraps to two lines, which drags the dialog into scrolling. 900 + the 64px
      // margins still clears a 1024 screen.
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
            {/* Says which of the two reasons Save is disabled for, rather than leaving a dead
              button and no explanation. */}
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
      <Stack key={formKey} spacing={3}>
        <FormSection title="Catalogue details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                placeholder="e.g. Classic Polo Shirt"
                defaultValue={initial.name}
                helperText={shown('name')}
                error={Boolean(shown('name'))}
                required
                autoFocus={!isEdit}
                disabled={locked}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="sku"
                label="SKU / code"
                placeholder="e.g. BR-1001"
                defaultValue={initial.sku}
                helperText={shown('sku') ?? 'Unique product code'}
                error={Boolean(shown('sku'))}
                required
                disabled={locked}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="defaultRate"
                label="Default rate (USD)"
                placeholder="e.g. 12.50"
                defaultValue={initial.defaultRate}
                helperText={
                  shown('defaultRate') ?? 'The rate anyone without a negotiated price pays'
                }
                error={Boolean(shown('defaultRate'))}
                required
                inputMode="decimal"
                disabled={locked}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {/* Type-to-search, like the invoice line and customer pickers — a plain dropdown
                  stops working once the fabric list grows past a few dozen. */}
              <Autocomplete
                options={fabricOptions}
                getOptionLabel={(o) => o.label}
                isOptionEqualToValue={(o, v) => o.value === v.value}
                value={fabricOptions.find((o) => o.value === fabric) ?? null}
                onChange={(_e, picked) => pickFabric('fabric', picked?.value ?? '')}
                loading={fabricsLoading}
                disabled={locked}
                noOptionsText={fabricOptions.length === 0 ? 'No fabrics yet' : 'No match'}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Fabric"
                    required
                    placeholder={fabricsLoading ? 'Loading fabrics…' : 'Search fabrics'}
                    helperText={shown('fabric') ?? 'The material this product is made of'}
                    error={Boolean(shown('fabric'))}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="discount"
                label="Discount (%)"
                placeholder="e.g. 10"
                defaultValue={initial.discount}
                helperText={
                  shown('discount') ?? 'Prefilled onto an invoice line; leave blank for none'
                }
                error={Boolean(shown('discount'))}
                inputMode="decimal"
                disabled={locked}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="unit"
                label="Unit"
                defaultValue={initial.unit}
                helperText={shown('unit')}
                error={Boolean(shown('unit'))}
                disabled={locked}
                placeholder="e.g. hour, item, kg"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <TextInput
                name="description"
                label="Description"
                required
                placeholder="What this product is, as it should read on records"
                defaultValue={initial.description}
                helperText={shown('description')}
                error={Boolean(shown('description'))}
                disabled={locked}
                multiline
                minRows={2}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>
      </Stack>
    </Modal>
  );
}
