'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import AddRounded from '@mui/icons-material/AddRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { FormSection, TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { InvoiceType, TAX_POLICY, DEFAULT_CURRENCY } from '@/modules/invoicing/enums';
import { invoiceFormSchema } from '@/modules/invoicing/schemas';
import { REMINDER_PRESETS } from '@/modules/invoicing/reminders';
import { apiPost } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * New invoice, as a dialog.
 *
 * This used to be a full page at /invoices/new, which meant leaving the list, losing the
 * filters and coming back through a router push. Every other create/edit flow in the app is a
 * Modal, so this one is too.
 *
 * It follows the same performance shape as the user form: values that only matter at submit
 * time live in a ref and are owned by the inputs themselves, so typing does not re-render the
 * dialog. Line items are the exception. Their numbers drive the running total, so they need
 * state, and they get their own component to keep those renders away from the Modal.
 */

const TYPE_OPTIONS: SelectOption[] = [
  { value: InvoiceType.Tax, label: 'Tax (US, taxed)' },
  { value: InvoiceType.Cash, label: 'Cash (US, no tax)' },
  { value: InvoiceType.PK, label: 'PK (Pakistan)' },
];

/** Built from the shared presets so the picker and the detail view never disagree. */
const REMINDER_OPTIONS: SelectOption[] = [
  { value: '', label: 'No reminder' },
  ...REMINDER_PRESETS.map((p) => ({ value: String(p.minutes), label: p.label })),
];

const APPLY_TAX_OPTIONS: SelectOption[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
];

interface Line {
  /** Stable across edits so a memoized row keeps its identity when siblings change. */
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

let lineSeq = 0;
const blankLine = (): Line => ({
  id: `line-${(lineSeq += 1)}`,
  description: '',
  quantity: '1',
  unitPrice: '0',
});

/** Text fields whose value is only needed when the form is submitted. */
interface TextValues {
  billToName: string;
  billToEmail: string;
  notes: string;
}

const EMPTY_TEXT: TextValues = { billToName: '', billToEmail: '', notes: '' };

/** What the line items section reports upward on every change. */
interface Numbers {
  lines: Line[];
  applyTax: boolean;
  taxRate: string;
}

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** One editable line. Memoized, so editing a line leaves its siblings alone. */
const LineRow = memo(function LineRow({
  line,
  index,
  disabled,
  canRemove,
  errors,
  onChange,
  onRemove,
}: {
  line: Line;
  index: number;
  disabled?: boolean;
  canRemove: boolean;
  errors: FieldErrors;
  onChange: (index: number, patch: Partial<Line>) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <Grid container spacing={1.5} alignItems="flex-start">
      <Grid size={{ xs: 12, sm: 6 }}>
        <TextInput
          name="description"
          label="Description"
          defaultValue={line.description}
          error={Boolean(errors[`items.${index}.description`])}
          helperText={errors[`items.${index}.description`]}
          disabled={disabled}
          required
          onChange={(_n, v) => onChange(index, { description: v })}
        />
      </Grid>
      <Grid size={{ xs: 4, sm: 2 }}>
        <TextInput
          name="quantity"
          label="Qty"
          type="number"
          defaultValue={line.quantity}
          error={Boolean(errors[`items.${index}.quantity`])}
          helperText={errors[`items.${index}.quantity`]}
          disabled={disabled}
          required
          onChange={(_n, v) => onChange(index, { quantity: v })}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 3 }}>
        <TextInput
          name="unitPrice"
          label="Unit price"
          type="number"
          defaultValue={line.unitPrice}
          error={Boolean(errors[`items.${index}.unitPrice`])}
          helperText={errors[`items.${index}.unitPrice`]}
          disabled={disabled}
          required
          onChange={(_n, v) => onChange(index, { unitPrice: v })}
        />
      </Grid>
      <Grid size={{ xs: 2, sm: 1 }}>
        <IconButton
          aria-label={`Remove line ${index + 1}`}
          onClick={() => onRemove(index)}
          disabled={disabled || !canRemove}
          sx={{ mt: 1 }}
        >
          <CloseRounded fontSize="small" />
        </IconButton>
      </Grid>
    </Grid>
  );
});

/**
 * Lines, tax controls and the running total.
 *
 * These live together because they all feed the same sum. Keeping them in here means a
 * keystroke in a quantity re-renders this section and recomputes the total, while the Modal,
 * its backdrop and its transition stay untouched.
 */
const LineItemsSection = memo(function LineItemsSection({
  type,
  disabled,
  errors,
  onChange,
}: {
  type: InvoiceType;
  disabled?: boolean;
  errors: FieldErrors;
  onChange: (next: Numbers) => void;
}) {
  const [lines, setLines] = useState<Line[]>(() => [blankLine()]);
  const [applyTax, setApplyTax] = useState(false);
  const [taxRate, setTaxRate] = useState('8.75');

  const taxPolicy = TAX_POLICY[type];
  const taxable = taxPolicy === 'always' || (taxPolicy === 'optional' && applyTax);
  const currency = DEFAULT_CURRENCY[type];

  // Mirror everything upward so the dialog can read it at submit time without holding it.
  useEffect(() => {
    onChange({ lines, applyTax, taxRate });
  }, [lines, applyTax, taxRate, onChange]);

  const setLine = useCallback((index: number, patch: Partial<Line>) => {
    // Untouched lines keep their object identity, which is what lets their rows skip render.
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }, []);

  const removeLine = useCallback((index: number) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const addLine = useCallback(() => setLines((prev) => [...prev, blankLine()]), []);

  const handleTax = useCallback((_name: string, v: string) => setApplyTax(v === 'yes'), []);
  const handleRate = useCallback((_name: string, v: string) => setTaxRate(v), []);

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (num(l.quantity) || 0) * (num(l.unitPrice) || 0), 0),
    [lines],
  );
  const tax = taxable ? subtotal * ((num(taxRate) || 0) / 100) : 0;

  return (
    <>
      <FormSection title="Line items">
        <Stack spacing={1.5}>
          {lines.map((line, i) => (
            <LineRow
              key={line.id}
              line={line}
              index={i}
              disabled={disabled}
              canRemove={lines.length > 1}
              errors={errors}
              onChange={setLine}
              onRemove={removeLine}
            />
          ))}

          {errors.items && (
            <Typography variant="caption" color="error">
              {errors.items}
            </Typography>
          )}

          <Box>
            <Button onClick={addLine} disabled={disabled} size="small" startIcon={<AddRounded />}>
              Add line
            </Button>
          </Box>
        </Stack>
      </FormSection>

      <FormSection title="Tax & total">
        <Grid container spacing={2} alignItems="flex-start">
          {taxPolicy === 'optional' && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <SelectInput
                name="applyTax"
                label="Apply tax"
                value={applyTax ? 'yes' : 'no'}
                options={APPLY_TAX_OPTIONS}
                disabled={disabled}
                onChange={handleTax}
              />
            </Grid>
          )}
          {taxable && (
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextInput
                name="taxRate"
                label="Tax rate %"
                type="number"
                defaultValue={taxRate}
                error={Boolean(errors.taxRate)}
                helperText={errors.taxRate}
                disabled={disabled}
                onChange={handleRate}
              />
            </Grid>
          )}
          <Grid size={12}>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={0.5} sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
              <Typography variant="body2" color="text.secondary">
                Subtotal {formatMoney(currency, subtotal)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Tax {formatMoney(currency, tax)}
              </Typography>
              <Typography sx={{ fontWeight: 700 }}>
                Total {formatMoney(currency, subtotal + tax)}
              </Typography>
            </Stack>
          </Grid>
        </Grid>
      </FormSection>
    </>
  );
});

export function InvoiceFormDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();

  const textRef = useRef<TextValues>({ ...EMPTY_TEXT });
  const numbersRef = useRef<Numbers>({ lines: [], applyTax: false, taxRate: '0' });

  const [type, setType] = useState<InvoiceType>(InvoiceType.Tax);
  const [reminder, setReminder] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formKey, setFormKey] = useState(0);

  // Fresh form on every open. useLayoutEffect so the remount lands before paint.
  useLayoutEffect(() => {
    if (!open) return;
    textRef.current = { ...EMPTY_TEXT };
    setType(InvoiceType.Tax);
    setReminder('');
    setErrors({});
    setFormKey((k) => k + 1);
  }, [open]);

  const setText = useCallback((name: string, value: string) => {
    textRef.current[name as keyof TextValues] = value;
  }, []);

  const setNumbers = useCallback((next: Numbers) => {
    numbersRef.current = next;
  }, []);

  const handleType = useCallback((_name: string, value: string) => {
    setType(value as InvoiceType);
  }, []);

  const close = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  /** The form's own view of itself, in the shape the shared schema validates. */
  const readForm = useCallback(() => {
    const { lines, applyTax, taxRate } = numbersRef.current;
    const taxPolicy = TAX_POLICY[type];
    const taxable = taxPolicy === 'always' || (taxPolicy === 'optional' && applyTax);
    return {
      type,
      billToName: textRef.current.billToName.trim(),
      billToEmail: textRef.current.billToEmail.trim(),
      items: lines.map((l) => ({
        description: l.description.trim(),
        quantity: num(l.quantity),
        unitPrice: num(l.unitPrice),
      })),
      taxRate: taxable ? num(taxRate) : undefined,
      notes: textRef.current.notes.trim() || undefined,
      taxable,
      applyTax,
    };
  }, [type]);

  async function submit(asDraft: boolean) {
    const form = readForm();
    const result = invoiceFormSchema.safeParse(form);
    if (!result.success) {
      setErrors(toFieldErrors(result.error));
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }
    setErrors({});
    setSaving(true);

    const res = await apiPost('/api/invoices', {
      type: form.type,
      billTo: { name: form.billToName, email: form.billToEmail || undefined },
      items: form.items,
      // The API takes a fraction; the form asks for a percentage.
      taxRate: form.taxable ? (form.taxRate ?? 0) / 100 : undefined,
      applyTax: TAX_POLICY[form.type] === 'optional' ? form.applyTax : undefined,
      notes: form.notes,
      // Omitted entirely when "No reminder" is chosen, so no reminder subdocument is stored.
      reminderThresholdMinutes: reminder ? Number(reminder) : undefined,
      asDraft,
    });

    setSaving(false);
    if (!res.ok) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(res.error ?? 'Failed to create invoice', { variant: 'error' });
      return;
    }
    enqueueSnackbar(asDraft ? 'Draft saved' : 'Invoice created', { variant: 'success' });
    close();
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="New invoice"
      description="Add the customer and its lines. Totals update as you type."
      icon={<ReceiptLongRounded />}
      maxWidth="md"
      busy={saving}
      actions={
        <>
          <Button onClick={close} disabled={saving} variant="outlined" color="inherit">
            Cancel
          </Button>
          <Button onClick={() => submit(true)} disabled={saving} color="inherit">
            Save as draft
          </Button>
          {/* No spinner here — the global overlay already covers the request. */}
          <Button variant="contained" onClick={() => submit(false)} disabled={saving}>
            Create invoice
          </Button>
        </>
      }
    >
      <Stack key={formKey} spacing={3}>
        <FormSection title="Invoice">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <SelectInput
                name="type"
                label="Type"
                value={type}
                options={TYPE_OPTIONS}
                error={Boolean(errors.type)}
                helperText={errors.type}
                required
                disabled={saving}
                onChange={handleType}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextInput
                name="billToName"
                label="Bill to"
                defaultValue=""
                error={Boolean(errors.billToName)}
                helperText={errors.billToName}
                required
                autoFocus
                disabled={saving}
                onChange={setText}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextInput
                name="billToEmail"
                label="Customer email"
                type="email"
                defaultValue=""
                error={Boolean(errors.billToEmail)}
                helperText={errors.billToEmail ?? 'Optional — used to send the invoice.'}
                disabled={saving}
                onChange={setText}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <SelectInput
                name="reminder"
                label="Remind me if unpaid"
                value={reminder}
                options={REMINDER_OPTIONS}
                helperText="Emails you if the invoice is still open after this long."
                disabled={saving}
                onChange={(_name, value) => setReminder(value)}
              />
            </Grid>
          </Grid>
        </FormSection>

        <LineItemsSection
          type={type}
          disabled={saving}
          errors={errors}
          onChange={setNumbers}
        />

        <FormSection title="Notes">
          <TextInput
            name="notes"
            label="Notes"
            defaultValue=""
            error={Boolean(errors.notes)}
            helperText={errors.notes ?? 'Shown on the invoice.'}
            disabled={saving}
            multiline
            minRows={2}
            placeholder="Payment terms, delivery details, anything the customer should see"
            onChange={setText}
          />
        </FormSection>
      </Stack>
    </Modal>
  );
}
