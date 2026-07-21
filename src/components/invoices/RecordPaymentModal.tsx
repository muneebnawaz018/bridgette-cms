'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Typography from '@mui/material/Typography';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { PaymentMethod } from '@/modules/invoicing/enums';
import { recordPaymentSchema } from '@/modules/payments/schemas';
import { apiPost } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { PAYMENT_METHOD_LABEL } from '@/lib/format/labels';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/**
 * Record a payment against an invoice.
 *
 * The invoice list and the invoice detail page had each grown their own version of this, with
 * the same POST and the same two fields, except the detail page built it out of a raw MUI
 * Dialog so it did not look like any other dialog in the app. This is the one copy.
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
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.BankTransfer);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formKey, setFormKey] = useState(0);

  // Read through a ref so a background refresh of the invoice cannot reset a half-typed
  // amount: the reset below is keyed on opening, and on switching to a different invoice.
  const invoiceRef = useRef(invoice);
  invoiceRef.current = invoice;

  useLayoutEffect(() => {
    if (!open) return;
    const balance = invoiceRef.current?.balanceDue;
    amountRef.current = balance ? String(balance) : '';
    setMethod(PaymentMethod.BankTransfer);
    setErrors({});
    setFormKey((k) => k + 1);
  }, [open, invoiceId]);

  const setAmount = useCallback((_name: string, value: string) => {
    amountRef.current = value;
  }, []);

  const handleMethod = useCallback((_name: string, value: string) => {
    setMethod(value as PaymentMethod);
  }, []);

  const close = useCallback(() => {
    setErrors({});
    onClose();
  }, [onClose]);

  const balanceLabel = useMemo(
    () => (invoice ? formatMoney(invoice.currency, Number(invoice.balanceDue ?? 0)) : ''),
    [invoice],
  );

  async function submit() {
    if (!invoice) return;
    // The API's own schema, so the button and the server can never disagree about what counts
    // as a valid payment.
    const parsed = recordPaymentSchema.safeParse({
      amount: Number(amountRef.current),
      method,
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    if (parsed.data.amount > Number(invoice.balanceDue ?? 0)) {
      setErrors({ amount: `That is more than the ${balanceLabel} still owed.` });
      return;
    }

    setErrors({});
    setSaving(true);
    const res = await apiPost(`/api/invoices/${invoice._id}/payments`, parsed.data);
    setSaving(false);

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
      </Stack>
    </Modal>
  );
}
