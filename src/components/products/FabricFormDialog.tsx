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
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput } from '@/components/form/fields';
import { useFormGuard } from '@/components/form/useFormGuard';
import type { FormMode } from '@/components/ui/Modal';
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
    // Sent even when blank: an omitted key means "leave it alone" to the update service, so
    // clearing the field would otherwise never take.
    notes: f.notes.trim(),
  };
}

export function FabricFormDialog({
  open,
  fabric,
  initialMode = 'edit',
  canEdit = true,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** null → create mode; a row → edit mode. */
  fabric: EditableFabric | null;
  /** Rows open read-only; the pencil in the footer switches to editing. Ignored when creating. */
  initialMode?: FormMode;
  /** Whether the viewer may switch to editing — drives the pencil, not the fields. */
  canEdit?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const isEdit = Boolean(fabric);
  const [mode, setMode] = useState<FormMode>('edit');
  const readOnly = mode === 'view';

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  const [saving, setSaving] = useState(false);
  /** Every input is inert while saving or while the dialog is being read rather than edited. */
  const locked = saving || readOnly;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);

  // Drives the Save button: same parse the field errors use, reduced to a boolean.
  const isValid = useCallback(
    (f: FormValues) =>
      fabricFormSchema.safeParse({ ...f, gsm: f.gsm.trim() ? Number(f.gsm) : undefined }).success,
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
    const next = fabric ? valuesFromFabric(fabric) : { ...EMPTY };
    valuesRef.current = next;
    setInitial(next);
    // Creating has nothing to view, so it always opens editable.
    setMode(fabric ? initialModeRef.current : 'edit');
    resetGuard(next);
    setErrors({});
    setTouched({});
    setSubmitted(false);
    setFormKey((k) => k + 1);
  }, [open, fabric, resetGuard]);

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = fabricFormSchema.safeParse({
      ...f,
      gsm: f.gsm.trim() ? Number(f.gsm) : undefined,
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
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
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
      title={
        !isEdit
          ? 'New fabric'
          : readOnly
            ? (fabric?.name ?? 'Fabric')
            : `Edit ${fabric?.name ?? 'fabric'}`
      }
      description={
        !isEdit
          ? 'Add a material products can be made of.'
          : readOnly
            ? 'Read-only. Use Edit to make changes.'
            : 'Update this material — every product linked to it picks up the change.'
      }
      icon={isEdit ? <EditRounded /> : <AddRounded />}
      maxWidth="sm"
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
        <FormSection title="Fabric details">
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextInput
                name="name"
                label="Name"
                placeholder="e.g. Cotton Jersey"
                defaultValue={initial.name}
                helperText={shown('name') ?? 'Unique across live fabrics'}
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
                name="gsm"
                label="GSM"
                placeholder="e.g. 180"
                defaultValue={initial.gsm}
                helperText={shown('gsm') ?? 'Grams per square metre — optional'}
                error={Boolean(shown('gsm'))}
                inputMode="numeric"
                disabled={locked}
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
                disabled={locked}
                placeholder="e.g. Knit, Woven, Fleece"
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Notes">
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
        </FormSection>
      </Stack>
    </Modal>
  );
}
