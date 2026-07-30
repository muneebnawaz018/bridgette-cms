'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { ProductRatesEditor } from '@/components/products/ProductRatesEditor';
import { productFormSchema } from '@/modules/products/schemas';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * One dialog for creating and editing a product (admin only). Typed values live in a ref so a
 * keystroke re-renders only the input being typed in. `product` null = create mode. Per-customer
 * pricing is only offered in edit mode (it needs a saved product id) via ProductRatesEditor.
 */

export interface EditableProduct {
  _id: string;
  name: string;
  sku: string;
  defaultRate: number;
  unit?: string;
  /** Fabric id, when the product is linked to one. */
  fabric?: string | null;
  description?: string;
  notes?: string;
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
  unit: string;
  fabric: string;
  description: string;
  notes: string;
}

type FieldKey = keyof FormValues;

const EMPTY: FormValues = {
  name: '',
  sku: '',
  defaultRate: '',
  unit: '',
  fabric: '',
  description: '',
  notes: '',
};

function valuesFromProduct(p: EditableProduct): FormValues {
  return {
    name: p.name ?? '',
    sku: p.sku ?? '',
    defaultRate: p.defaultRate != null ? String(p.defaultRate) : '',
    unit: p.unit ?? '',
    fabric: p.fabric ? String(p.fabric) : '',
    description: p.description ?? '',
    notes: p.notes ?? '',
  };
}

/** Blank optional fields go as undefined; rate is coerced to a number. */
function buildPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    sku: f.sku.trim(),
    defaultRate: Number(f.defaultRate),
    unit: f.unit.trim() || undefined,
    // Sent as '' rather than omitted so clearing the picker actually unlinks the fabric.
    fabric: f.fabric,
    description: f.description.trim() || undefined,
    notes: f.notes.trim() || undefined,
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
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  product: EditableProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(product);

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // The picker is controlled (a pick has to re-render the select), unlike the text fields.
  const [fabric, setFabric] = useState('');

  // Only fetched while the dialog is open — the catalogue list itself has no use for it.
  const { data: fabricData } = useApi<{ items: FabricOption[] }>(
    open ? '/api/fabrics/options' : null,
    { globalLoading: false },
  );
  const fabricOptions: SelectOption[] = useMemo(
    () => [
      { value: '', label: 'No fabric' },
      ...(fabricData?.items ?? []).map((f) => ({ value: f._id, label: fabricLabel(f) })),
    ],
    [fabricData],
  );

  useLayoutEffect(() => {
    if (!open) return;
    const next = product ? valuesFromProduct(product) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setFabric(next.fabric);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, product]);

  const validate = useCallback((f: FormValues): FieldErrors => {
    // Rate is a string in the form; validate the coerced number the payload will send.
    const result = productFormSchema.safeParse({ ...f, defaultRate: Number(f.defaultRate) });
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback((key: string, value: string) => {
    valuesRef.current[key as FieldKey] = value;
  }, []);

  const pickFabric = useCallback((_key: string, value: string) => {
    valuesRef.current.fabric = value;
    setFabric(value);
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
      title={isEdit ? `Edit ${product?.name ?? 'product'}` : 'New product'}
      description={
        isEdit
          ? 'Update the catalogue entry and its per-customer pricing.'
          : 'Add a catalogue item. Set per-customer rates after saving.'
      }
      icon={isEdit ? <EditRounded /> : <AddRounded />}
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
            startIcon={isEdit ? <SaveRounded /> : <AddRounded />}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
        <FormSection title="Catalogue details">
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
                name="sku"
                label="SKU / code"
                defaultValue={initial.sku}
                helperText={shown('sku') ?? 'Optional — unique if set'}
                error={Boolean(shown('sku'))}
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="defaultRate"
                label="Default rate (USD)"
                defaultValue={initial.defaultRate}
                helperText={
                  shown('defaultRate') ?? 'The rate anyone without a negotiated price pays'
                }
                error={Boolean(shown('defaultRate'))}
                required
                inputMode="decimal"
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <SelectInput
                name="fabric"
                label="Fabric"
                value={fabric}
                options={fabricOptions}
                helperText={shown('fabric') ?? 'The material this product is made of'}
                error={Boolean(shown('fabric'))}
                disabled={saving}
                onChange={pickFabric}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="unit"
                label="Unit"
                defaultValue={initial.unit}
                helperText={shown('unit')}
                error={Boolean(shown('unit'))}
                disabled={saving}
                placeholder="e.g. hour, item, kg"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={12}>
              <TextInput
                name="description"
                label="Description"
                defaultValue={initial.description}
                helperText={shown('description')}
                error={Boolean(shown('description'))}
                disabled={saving}
                multiline
                minRows={2}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        {isEdit && product && (
          <FormSection title="Customer pricing">
            <ProductRatesEditor productId={product._id} defaultRate={product.defaultRate} />
          </FormSection>
        )}

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
