'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddBoxRounded from '@mui/icons-material/AddBoxRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput } from '@/components/form/fields';
import { fabricFormSchema } from '@/modules/products/schemas';
import { apiPost, apiPatch } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * Create / edit a fabric (admin only). Mirrors ProductFormDialog: typed values live in a ref so a
 * keystroke re-renders only the input being typed in, and `fabric` null means create mode.
 */

export interface EditableFabric {
  _id: string;
  name: string;
  gsm?: number | null;
  type?: string;
  notes?: string;
}

interface FormValues {
  name: string;
  gsm: string;
  type: string;
  notes: string;
}

type FieldKey = keyof FormValues;

const EMPTY: FormValues = { name: '', gsm: '', type: '', notes: '' };

function valuesFromFabric(f: EditableFabric): FormValues {
  return {
    name: f.name ?? '',
    gsm: f.gsm != null ? String(f.gsm) : '',
    type: f.type ?? '',
    notes: f.notes ?? '',
  };
}

/** Blank GSM is sent as undefined rather than 0 — "not spec'd" is not "weighs nothing". */
function buildPayload(f: FormValues) {
  return {
    name: f.name.trim(),
    gsm: f.gsm.trim() ? Number(f.gsm) : undefined,
    type: f.type.trim() || undefined,
    notes: f.notes.trim() || undefined,
  };
}

export function FabricFormDialog({
  open,
  fabric,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  fabric: EditableFabric | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(fabric);

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);

  useLayoutEffect(() => {
    if (!open) return;
    const next = fabric ? valuesFromFabric(fabric) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, fabric]);

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = fabricFormSchema.safeParse({
      ...f,
      gsm: f.gsm.trim() ? Number(f.gsm) : undefined,
    });
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback((key: string, value: string) => {
    valuesRef.current[key as FieldKey] = value;
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
      ? await apiPatch(`/api/fabrics/${fabric!._id}`, payload)
      : await apiPost('/api/fabrics', payload);
    setSaving(false);

    if (!res.ok) {
      const fieldErrors = serverFieldErrors(res.details);
      // A duplicate name comes back as a plain message; pin it to the name field.
      if (res.error && /already exists/i.test(res.error)) fieldErrors.name = res.error;
      setErrors(fieldErrors);
      enqueueSnackbar(
        res.error ?? (isEdit ? 'Could not update fabric' : 'Could not create fabric'),
        {
          variant: 'error',
        },
      );
      return;
    }
    enqueueSnackbar(isEdit ? 'Fabric updated' : 'Fabric created', { variant: 'success' });
    close();
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={isEdit ? `Edit ${fabric?.name ?? 'fabric'}` : 'New fabric'}
      description={
        isEdit
          ? 'Update this material — every product linked to it picks up the change.'
          : 'Add a material products can be made of.'
      }
      icon={isEdit ? <EditRounded /> : <AddBoxRounded />}
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
            startIcon={isEdit ? <SaveRounded /> : <AddBoxRounded />}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
        <FormSection title="Fabric details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                defaultValue={initial.name}
                helperText={shown('name') ?? 'Unique across live fabrics'}
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
                name="gsm"
                label="GSM"
                defaultValue={initial.gsm}
                helperText={shown('gsm') ?? 'Grams per square metre — optional'}
                error={Boolean(shown('gsm'))}
                inputMode="numeric"
                disabled={saving}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="type"
                label="Type"
                defaultValue={initial.type}
                helperText={shown('type')}
                error={Boolean(shown('type'))}
                disabled={saving}
                placeholder="e.g. Knit, Woven, Fleece"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
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
