'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Typography from '@mui/material/Typography';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { PaymentMethod } from '@/modules/invoicing/enums';
import { recordPaymentSchema, type RecordPaymentInput } from '@/modules/payments/schemas';
import {
  PAYMENT_METHOD_FIELDS,
  proofRequired,
  PROOF_ACCEPT,
} from '@/modules/payments/methodFields';
import { fileToProofImage, type ProofImage } from '@/lib/image/proof';
import { apiPost } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { PAYMENT_METHOD_LABEL } from '@/lib/format/labels';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/**
 * Record a payment against an invoice.
 *
 * Beyond the amount and method it gathers the information that method implies (a transfer's
 * reference, a card's last four, and so on — see PAYMENT_METHOD_FIELDS) and, for every method
 * except cash, a proof image. The proof is compressed client-side and sent as a base64 data URL.
 */

export interface PayableInvoice {
  _id: string;
  number: string;
  currency: string;
  balanceDue: number;
}

const METHOD_OPTIONS: SelectOption[] = Object.values(PaymentMethod).map((m) => ({
  value: m,
  label: PAYMENT_METHOD_LABEL[m] ?? m,
}));

export function RecordPaymentModal({
  invoice,
  onClose,
  onRecorded,
}: {
  /** The invoice being paid, or null when the dialog is closed. */
  invoice: PayableInvoice | null;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const open = Boolean(invoice);
  const invoiceId = invoice?._id;

  const amountRef = useRef('');
  // Method-specific field values and the optional note, held in refs so typing does not
  // re-render the dialog (same reason as the amount — see components/form/fields).
  const detailsRef = useRef<Record<string, string>>({});
  const notesRef = useRef('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BankTransfer);
  const [proof, setProof] = useState<ProofImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formKey, setFormKey] = useState(0);
  // Set once a validated payment turns out to be less than the balance due: holds the payload to
  // record and how much would remain, so the confirm step can spell it out before committing.
  const [confirmPartial, setConfirmPartial] = useState<{
    data: RecordPaymentInput;
    remaining: number;
  } | null>(null);

  // Read through a ref so a background refresh of the invoice cannot reset a half-typed amount:
  // the reset below is keyed on opening, and on switching to a different invoice.
  const invoiceRef = useRef(invoice);
  invoiceRef.current = invoice;

  useLayoutEffect(() => {
    if (!open) return;
    const balance = invoiceRef.current?.balanceDue;
    amountRef.current = balance ? String(balance) : '';
    detailsRef.current = {};
    notesRef.current = '';
    setMethod(PaymentMethod.BankTransfer);
    setProof(null);
    setErrors({});
    setConfirmPartial(null);
    setFormKey((k) => k + 1);
  }, [open, invoiceId]);

  const setAmount = useCallback((_name: string, value: string) => {
    amountRef.current = value;
  }, []);

  const setDetail = useCallback((name: string, value: string) => {
    detailsRef.current[name] = value;
  }, []);

  const setNotes = useCallback((_name: string, value: string) => {
    notesRef.current = value;
  }, []);

  const handleMethod = useCallback((_name: string, value: string) => {
    setMethod(value as PaymentMethod);
    // A different method asks for different fields — clear the old values and remount the
    // inputs so their defaults refresh.
    detailsRef.current = {};
    setErrors({});
    setFormKey((k) => k + 1);
  }, []);

  const onPickProof = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    try {
      const img = await fileToProofImage(file);
      setProof(img);
      setErrors((x) => {
        const next = { ...x };
        delete next.proof;
        return next;
      });
    } catch (err) {
      setErrors((x) => ({
        ...x,
        proof: err instanceof Error ? err.message : 'Could not read that image',
      }));
    }
  }, []);

  const close = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  const balanceLabel = useMemo(
    () => (invoice ? formatMoney(invoice.currency, Number(invoice.balanceDue ?? 0)) : ''),
    [invoice],
  );

  const fields = PAYMENT_METHOD_FIELDS[method];
  const needsProof = proofRequired(method);

  async function submit() {
    if (!invoice) return;

    const nextErrors: FieldErrors = {};
    for (const f of fields) {
      if (f.required && !detailsRef.current[f.key]?.trim()) {
        nextErrors[f.key] = `${f.label} is required`;
      }
    }
    if (needsProof && !proof) {
      nextErrors.proof = 'Attach a proof of payment (screenshot or receipt)';
    }

    const details: Record<string, string> = {};
    for (const f of fields) {
      const v = detailsRef.current[f.key]?.trim();
      if (v) details[f.key] = v;
    }

    // The API's own schema, so the dialog and the server can never disagree about what counts
    // as a valid payment.
    const parsed = recordPaymentSchema.safeParse({
      amount: Number(amountRef.current),
      method,
      details: Object.keys(details).length ? details : undefined,
      notes: notesRef.current.trim() || undefined,
      proof: proof ?? undefined,
    });
    if (!parsed.success) Object.assign(nextErrors, toFieldErrors(parsed.error));

    if (!parsed.success || Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    const balanceDue = Number(invoice.balanceDue ?? 0);
    if (parsed.data.amount > balanceDue) {
      setErrors({ amount: `That is more than the ${balanceLabel} still owed.` });
      return;
    }

    setErrors({});

    // A payment short of the balance leaves the invoice open — confirm that is intended before
    // booking it, rather than silently recording a partial and moving on.
    const remaining = Math.max(0, Math.round((balanceDue - parsed.data.amount) * 100) / 100);
    if (remaining > 0) {
      setConfirmPartial({ data: parsed.data, remaining });
      return;
    }
    await doRecord(parsed.data);
  }

  async function doRecord(data: RecordPaymentInput) {
    if (!invoice) return;
    setSaving(true);
    const res = await apiPost(`/api/invoices/${invoice._id}/payments`, data);
    setSaving(false);
    setConfirmPartial(null);

    if (!res.ok) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(res.error ?? 'Failed to record payment', { variant: 'error' });
      return;
    }
    enqueueSnackbar('Payment recorded', { variant: 'success' });
    close();
    onRecorded();
  }

  return (
    <>
      <Modal
        open={open}
        onClose={close}
        title={`Record payment for ${invoice?.number ?? ''}`}
        icon={<PaymentsRounded />}
        maxWidth="xs"
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
            {/* No spinner here — the global overlay already covers the request. */}
            <Button
              variant="contained"
              onClick={submit}
              disabled={saving}
              startIcon={<PaymentsRounded />}
            >
              Record
            </Button>
          </>
        }
      >
        <Stack key={formKey} spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Balance due: {balanceLabel}
          </Typography>
          <TextInput
            name="amount"
            label="Amount"
            type="number"
            defaultValue={amountRef.current}
            error={Boolean(errors.amount)}
            helperText={errors.amount}
            required
            autoFocus
            disabled={saving}
            onChange={setAmount}
          />
          <SelectInput
            name="method"
            label="Method"
            value={method}
            options={METHOD_OPTIONS}
            error={Boolean(errors.method)}
            helperText={errors.method}
            required
            disabled={saving}
            onChange={handleMethod}
          />

          {/* Method-specific "related information". */}
          {fields.map((f) => (
            <TextInput
              key={f.key}
              name={f.key}
              label={f.label}
              defaultValue={detailsRef.current[f.key] ?? ''}
              error={Boolean(errors[f.key])}
              helperText={errors[f.key]}
              required={f.required}
              inputMode={f.inputMode}
              maxLength={f.maxLength}
              disabled={saving}
              onChange={setDetail}
            />
          ))}

          <TextInput
            name="notes"
            label="Notes"
            defaultValue={notesRef.current}
            multiline
            minRows={2}
            disabled={saving}
            onChange={setNotes}
          />

          <Divider />

          {/* Proof of payment. */}
          <Box>
            <Typography
              variant="overline"
              sx={{ display: 'block', fontWeight: 700, color: 'text.secondary', mb: 0.75 }}
            >
              Proof of payment{needsProof ? ' *' : ''}
            </Typography>

            {!proof ? (
              <Box
                component="label"
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                  px: 2,
                  py: 2.25,
                  textAlign: 'center',
                  cursor: saving ? 'default' : 'pointer',
                  borderRadius: 2,
                  border: '1.5px dashed',
                  borderColor: errors.proof ? 'error.main' : 'divider',
                  transition: 'border-color .16s ease, background-color .16s ease',
                  '&:hover': saving
                    ? undefined
                    : { borderColor: 'primary.main', bgcolor: 'action.hover' },
                }}
              >
                <input
                  hidden
                  type="file"
                  accept={PROOF_ACCEPT}
                  onChange={onPickProof}
                  disabled={saving}
                />
                <UploadFileRounded color={errors.proof ? 'error' : 'action'} />
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Attach proof
                </Typography>
                <Typography variant="caption" color={errors.proof ? 'error' : 'text.secondary'}>
                  {errors.proof ??
                    (needsProof
                      ? 'Screenshot or receipt image — required.'
                      : 'Screenshot or receipt image — optional for cash.')}
                </Typography>
              </Box>
            ) : (
              <Stack
                direction="row"
                spacing={1.5}
                alignItems="center"
                sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              >
                <Box
                  component="img"
                  src={proof.data}
                  alt="Payment proof"
                  sx={{
                    width: 44,
                    height: 44,
                    objectFit: 'cover',
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: 'divider',
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {proof.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(proof.size / 1024).toFixed(0)} KB
                  </Typography>
                </Box>
                <Button component="label" size="small" disabled={saving}>
                  Replace
                  <input
                    hidden
                    type="file"
                    accept={PROOF_ACCEPT}
                    onChange={onPickProof}
                    disabled={saving}
                  />
                </Button>
                <IconButton
                  size="small"
                  aria-label="Remove proof"
                  disabled={saving}
                  onClick={() => setProof(null)}
                >
                  <CloseRounded fontSize="small" />
                </IconButton>
              </Stack>
            )}
          </Box>
        </Stack>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmPartial)}
        title="Record a partial payment?"
        description={
          confirmPartial
            ? `This records ${invoice ? formatMoney(invoice.currency, confirmPartial.data.amount) : ''} of the ${balanceLabel} due. ${invoice ? formatMoney(invoice.currency, confirmPartial.remaining) : ''} will remain outstanding and the invoice stays "Partially paid". Continue?`
            : ''
        }
        confirmLabel="Record payment"
        confirmIcon={<PaymentsRounded />}
        loading={saving}
        onConfirm={() => confirmPartial && doRecord(confirmPartial.data)}
        onClose={() => setConfirmPartial(null)}
      />
    </>
  );
}
