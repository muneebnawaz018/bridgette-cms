'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useSnackbar } from 'notistack';
import { Modal, type FormMode } from '@/components/ui/Modal';
import { FormSection, TextInput } from '@/components/form/fields';
import { DateField } from '@/components/form/DateField';
import { useFormGuard } from '@/components/form/useFormGuard';
import { shipmentInputSchema } from '@/modules/shipments/schemas';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiPatch } from '@/lib/api/client';
import { formatDateTime, today } from '@/lib/format/date';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * Shipping details for one invoice — add, edit and read, in one dialog.
 *
 * An invoice has at most one shipment, so this is not a ledger like payments: the dialog opens
 * on the add form when nothing has shipped yet, and read-only on the stored record when
 * something has. The pencil in the footer is the deliberate step across to editing, same as the
 * other record dialogs.
 *
 * Typed values live in a ref so a keystroke re-renders only the input being typed in (see
 * components/form/fields). The two dates are the exception — the picker is controlled — but a
 * date is picked once, not typed character by character.
 */

export interface ShippableInvoice {
  _id: string;
  number: string;
  /** A draft is not an order yet, so nothing ships against one. */
  state?: string;
  isArchived?: boolean;
  isDeleted?: boolean;
}

interface Shipment {
  _id: string;
  trackingId: string;
  agent: string;
  shippedAt: string;
  eta?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface FormValues {
  trackingId: string;
  agent: string;
  shippedAt: string;
  eta: string;
}

type FieldKey = keyof FormValues;

const EMPTY: FormValues = { trackingId: '', agent: '', shippedAt: '', eta: '' };

/**
 * Both dates are stored at UTC midnight, so the calendar day is the first ten characters of the
 * ISO string. Reading them back that way — rather than through a local Date — keeps the day the
 * one that was picked, whatever timezone the reader sits in.
 */
const day = (value?: string | null) => (value ? value.slice(0, 10) : '');

function valuesFrom(s: Shipment): FormValues {
  return {
    trackingId: s.trackingId ?? '',
    agent: s.agent ?? '',
    shippedAt: day(s.shippedAt),
    eta: day(s.eta),
  };
}

export function ShipmentDialog({
  invoice,
  canManage = false,
  onClose,
}: {
  /** The invoice whose shipping is being viewed, or null when the dialog is closed. */
  invoice: ShippableInvoice | null;
  /** Whether this viewer may add or change shipping details. */
  canManage?: boolean;
  onClose: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const open = Boolean(invoice);
  const invoiceId = invoice?._id;
  /*
   * Archived, deleted and draft invoices cannot take shipping: the first two are history, and a
   * draft is not yet a document to ship against. The API refuses all three, so the dialog offers
   * reading only rather than a form that cannot be saved.
   */
  const isDraft = invoice?.state === 'draft';
  const editable = canManage && !invoice?.isArchived && !invoice?.isDeleted && !isDraft;

  const { data, mutate: reload } = useApi<Shipment | null>(
    invoiceId ? `/api/invoices/${invoiceId}/shipment` : null,
    {
      // A different invoice must never briefly show the last one's tracking number.
      keepPreviousData: false,
      /*
       * The app's own overlay covers this wait, the same as opening a page does. A spinner
       * inside a dialog that is otherwise empty reads as a broken dialog; the overlay reads as
       * the app fetching, and the dialog then opens with its answer already in it.
       */
      globalLoading: true,
    },
  );
  // `null` is a real answer here ("nothing shipped yet"), so undefined is the only "still loading".
  const loaded = data !== undefined;
  const shipment = data ?? null;
  const shipmentId = shipment?._id ?? null;

  const [mode, setMode] = useState<FormMode>('view');
  const readOnly = mode === 'view';

  const valuesRef = useRef<FormValues>(EMPTY);
  const [initial, setInitial] = useState<FormValues>(EMPTY);
  // The date picker is controlled, unlike the text inputs, so its value is mirrored in state.
  const [dates, setDates] = useState({ shippedAt: '', eta: '' });
  const [saving, setSaving] = useState(false);
  const locked = saving || readOnly;
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const isValid = useCallback((f: FormValues) => shipmentInputSchema.safeParse(f).success, []);
  const guard = useFormGuard<FormValues>({ valuesRef, isValid });
  // Named as a plain identifier so the effect below can depend on it without re-running on
  // every keystroke (see FabricFormDialog for the same reasoning).
  const resetGuard = guard.reset;

  const reset = useCallback(
    (next: FormValues, nextMode: FormMode) => {
      valuesRef.current = next;
      setInitial(next);
      setDates({ shippedAt: next.shippedAt, eta: next.eta });
      setMode(nextMode);
      resetGuard(next);
      setErrors({});
      setTouched({});
      setSubmitted(false);
      setFormKey((k) => k + 1);
    },
    [resetGuard],
  );

  /*
   * Fill the form once the fetch lands. Keyed on the shipment's id rather than the object, so a
   * background revalidation (focus, reconnect) cannot wipe a half-typed correction.
   */
  useLayoutEffect(() => {
    if (!open || !loaded) return;
    const stored = shipmentId ? valuesFrom(shipment!) : null;
    // Nothing shipped yet: open straight on the add form, dated today — unless this viewer
    // cannot record one, in which case there is nothing to open a form for.
    const opensEditable = !stored && editable;
    reset(stored ?? { ...EMPTY, shippedAt: today() }, opensEditable ? 'edit' : 'view');
    // `shipment` is deliberately absent from the deps — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId, loaded, shipmentId, editable, reset]);

  const validate = useCallback((f: FormValues): FieldErrors => {
    const result = shipmentInputSchema.safeParse(f);
    return result.success ? {} : toFieldErrors(result.error);
  }, []);

  const setText = useCallback(
    (key: string, value: string) => {
      valuesRef.current[key as FieldKey] = value;
      guard.refresh();
    },
    [guard],
  );

  const setDate = useCallback(
    (key: 'shippedAt' | 'eta', value: string) => {
      valuesRef.current[key] = value;
      setDates((d) => ({ ...d, [key]: value }));
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current));
      guard.refresh();
    },
    [guard, validate],
  );

  const blurField = useCallback(
    (key: string) => {
      setTouched((t) => (t[key] ? t : { ...t, [key]: true }));
      setErrors(validate(valuesRef.current));
    },
    [validate],
  );

  /*
   * Errors normally wait for a blur or a submit so a pristine form never opens in red. Once the
   * form is dirty and still will not parse, they are computed live instead — otherwise Save is
   * dead, its caption says to fix the highlighted fields, and nothing is highlighted.
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

  /** Editing an existing record backs out to reading it; adding one backs out of the dialog. */
  const cancel = useCallback(() => {
    if (shipment) reset(valuesFrom(shipment), 'view');
    else close();
  }, [shipment, reset, close]);

  async function submit() {
    if (!invoice) return;
    setSubmitted(true);
    const values = valuesRef.current;
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const isEdit = Boolean(shipmentId);
    const payload = {
      trackingId: values.trackingId.trim(),
      agent: values.agent.trim(),
      shippedAt: values.shippedAt,
      // Sent even when blank: the update applies all four fields, which is what lets a cleared
      // ETA actually clear rather than being read as "leave it alone".
      eta: values.eta,
    };
    const url = `/api/invoices/${invoice._id}/shipment`;

    setSaving(true);
    const res = isEdit ? await apiPatch(url, payload) : await apiPost(url, payload);
    setSaving(false);

    if (!res.ok) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(
        res.error ??
          (isEdit ? 'Could not update shipping details' : 'Could not add shipping details'),
        { variant: 'error' },
      );
      return;
    }
    enqueueSnackbar(isEdit ? 'Shipping details updated' : 'Shipping details added', {
      variant: 'success',
    });
    void reload();
    close();
  }

  const stamp = shipment?.updatedAt ?? shipment?.createdAt;

  /*
   * Held shut until the answer is in. The overlay is already up while the request runs, so
   * opening first would put an empty dialog under it and then fill it in — two states for one
   * click. This way the dialog appears once, with its content.
   */
  return (
    <Modal
      open={open && loaded}
      onClose={close}
      title={`Shipping for ${invoice?.number ?? ''}`}
      description={
        !shipment
          ? editable
            ? 'Record where this order went and when it should arrive.'
            : isDraft
              ? 'This invoice is still a draft. Finalize it before recording shipping.'
              : 'Nothing has shipped against this invoice yet.'
          : readOnly
            ? 'Read-only. Use Edit to make changes.'
            : 'Update the tracking number, agent or dates.'
      }
      icon={<LocalShippingRounded />}
      maxWidth="sm"
      fullScreenOnMobile
      busy={saving}
      actions={
        readOnly ? (
          <>
            {/* Sits with the buttons, not in the form: it describes the record rather than any
                field, and under the last input it read as a caption belonging to the ETA. The
                same slot the edit view puts its "why Save is off" line in. */}
            {stamp && (
              <Typography
                variant="caption"
                color="text.secondary"
                // Stacked below sm, where it lands under the buttons and reads as a footnote.
                sx={{
                  mr: { sm: 'auto' },
                  alignSelf: 'center',
                  textAlign: { xs: 'center', sm: 'left' },
                }}
              >
                Last updated {formatDateTime(stamp)}
              </Typography>
            )}
            <Button onClick={close} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
              Close
            </Button>
            {editable && shipment && (
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
                sx={{
                  mr: { sm: 'auto' },
                  alignSelf: 'center',
                  textAlign: { xs: 'center', sm: 'left' },
                }}
              >
                {guard.reason}
              </Typography>
            )}
            <Button
              onClick={cancel}
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
              startIcon={shipmentId ? <SaveRounded /> : <AddRounded />}
            >
              {shipmentId ? 'Save' : 'Add'}
            </Button>
          </>
        )
      }
    >
      {!shipment && !editable ? (
        <Typography variant="body2" color="text.secondary">
          {isDraft
            ? 'Goods ship against a finalized invoice, not a draft. Finalize this one and its shipping details can be recorded here.'
            : 'No shipping details have been recorded for this invoice.'}
        </Typography>
      ) : (
        /* Same rhythm as every other record dialog: sections 24px apart, fields 16px, and
           helper text only when a field is complaining. Standing hints under all four boxes
           left this one with taller rows and wider gaps than the rest of the app. */
        <Stack key={formKey} spacing={3}>
          {/* One section, not two. Split into Consignment and Dates, the four fields sat two
              rows apart with a heading between them, which is a wider gap than any other record
              dialog puts between its fields. Four boxes do not need two headings. */}
          <FormSection title="Consignment">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="trackingId"
                  label="Tracking ID"
                  placeholder="e.g. 1Z999AA10123456784"
                  defaultValue={initial.trackingId}
                  helperText={shown('trackingId')}
                  error={Boolean(shown('trackingId'))}
                  required
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="agent"
                  label="Shipping agent"
                  placeholder="e.g. FedEx, DHL, Leopards"
                  defaultValue={initial.agent}
                  helperText={shown('agent')}
                  error={Boolean(shown('agent'))}
                  required
                  disabled={locked}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <DateField
                  label="Shipping date"
                  size="medium"
                  value={dates.shippedAt}
                  onChange={(v) => setDate('shippedAt', v)}
                  disabled={locked}
                  clearable={false}
                  error={Boolean(shown('shippedAt'))}
                  helperText={shown('shippedAt')}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <DateField
                  label="ETA (optional)"
                  size="medium"
                  value={dates.eta}
                  onChange={(v) => setDate('eta', v)}
                  disabled={locked}
                  // Cross-bound so an arrival before the departure cannot be picked at all.
                  minDate={dates.shippedAt || undefined}
                  error={Boolean(shown('eta'))}
                  helperText={shown('eta')}
                />
              </Grid>
            </Grid>
          </FormSection>
        </Stack>
      )}
    </Modal>
  );
}
