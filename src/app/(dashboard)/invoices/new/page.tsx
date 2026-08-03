'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SaveAsRounded from '@mui/icons-material/SaveAsRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import { calcInvoice } from '@/modules/invoicing/calc';
import { invoiceFormSchema } from '@/modules/invoicing/schemas';
import { useCan } from '@/components/auth/SessionProvider';
import { NoAccess } from '@/components/ui/NoAccess';
import { apiPost } from '@/lib/api/client';
import { useApi } from '@/lib/api/useApi';
import {
  InvoiceTemplateForm,
  type TemplateForm,
  type CustomerOption,
  type ProductOption,
  shipToFor,
} from '@/components/invoices/InvoiceTemplateForm';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/** What the create endpoint reports back about emailing the invoice to the customer. */
interface EmailOutcome {
  sent: boolean;
  to?: string;
  reason?: string;
}

/*
 * New invoice — laid out as the printed template (see InvoiceTemplateForm / InvoiceDocument).
 * The page owns state, options fetching and submit; the form component is the template skin.
 */

const todayISODate = () => new Date().toISOString().slice(0, 10);
/** ISO date `days` from today (default net-7 due date). */
const plusDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const EMPTY: TemplateForm = {
  type: InvoiceType.Tax,
  billName: '',
  billEmail: '',
  billPhone: '',
  billAddress: '',
  shipName: '',
  shipAddress: '',
  items: [{ description: '', quantity: 1, unitPrice: 0 }],
  reseller: false,
  applyTax: false,
  taxPercent: 8.75,
  shippingHandling: 0,
  discount: 0,
  issueDate: '',
  dueDate: '',
  notes: '',
};

export default function NewInvoicePage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.InvoiceCreate);

  const [form, setForm] = useState<TemplateForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Default the invoice date to today after mount (avoids an SSR/client midnight mismatch).
  useEffect(() => {
    // Invoice date = today; due date defaults to net-7 (a week out), still editable.
    setForm((f) =>
      f.issueDate ? f : { ...f, issueDate: todayISODate(), dueDate: f.dueDate || plusDaysISO(7) },
    );
  }, []);

  // Type comes from the New-invoice menu on the list as ?type=. The template opens straight away
  // with that type applied; if absent it just defaults (EMPTY.type) — no separate chooser screen.
  const searchParams = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('type');
    if (t && (Object.values(InvoiceType) as string[]).includes(t)) {
      setForm((f) => ({ ...f, type: t as InvoiceType }));
    }
  }, [searchParams]);

  const { data: productData } = useApi<{ items: ProductOption[] }>(
    `/api/products/options${customerId ? `?customerId=${customerId}` : ''}`,
  );
  const products = useMemo(() => productData?.items ?? [], [productData]);

  const policy = TAX_POLICY[form.type];
  const resellerExempt = form.type === InvoiceType.Tax && form.reseller;
  const taxable =
    (policy === 'always' || (policy === 'optional' && form.applyTax)) && !resellerExempt;

  const preview = useMemo(
    () =>
      calcInvoice({
        type: form.type,
        items: form.items.map((it) => ({
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          taxable: true,
          discountPercent: Number(it.discountPercent) || 0,
          discount: 0,
        })),
        shippingHandlingTariff: Number(form.shippingHandling) || 0,
        invoiceDiscount: Number(form.discount) || 0,
        taxRate: Number(form.taxPercent) / 100,
        applyTax: form.applyTax,
        reseller: form.reseller,
      }),
    [form],
  );

  const nameFilled = Boolean(form.billName.trim());
  const itemsValid =
    form.items.length > 0 &&
    form.items.every(
      (it) => it.description.trim() !== '' && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0,
    );

  /*
   * The same parse submit() runs, hoisted so the buttons can be gated on it instead of letting
   * someone press Save and be told no. The form is fully controlled here, so this is just a
   * derived value — no refs or change counters needed.
   */
  const parsed = useMemo(
    () =>
      invoiceFormSchema.safeParse({
        type: form.type,
        billToName: form.billName.trim(),
        billToEmail: form.billEmail.trim(),
        items: form.items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
          discountPercent: Number(it.discountPercent) || 0,
        })),
        taxRate: taxable ? Number(form.taxPercent) : undefined,
        reseller: form.type === InvoiceType.Tax ? form.reseller : undefined,
        notes: form.notes.trim() || undefined,
      }),
    [form, taxable],
  );

  const canDraft = nameFilled && parsed.success;
  const canFinalizeNew = canDraft && itemsValid && preview.grandTotal > 0;
  /*
   * Why the button is dead, or — once it works — why it still says "draft". The last branch is
   * not a blocker: the invoice saves fine, it just is not complete enough to go out as one.
   */
  const blockedReason = !nameFilled
    ? 'Add a customer to save'
    : // Every line can be removed now, so this is a state the form can genuinely be left in.
      form.items.length === 0
      ? 'Add a line to save'
      : !parsed.success
        ? 'Fix the highlighted fields'
        : !canFinalizeNew
          ? 'Add a line with an amount to create the invoice'
          : undefined;

  function onCustomerPick(opt: CustomerOption | null) {
    setCustomerId(opt ? opt._id : null);
    setForm((f) => ({
      ...f,
      billName: opt ? opt.name : f.billName,
      billEmail: opt ? (opt.email ?? '') : f.billEmail,
      billPhone: opt ? (opt.phone ?? '') : f.billPhone,
      billAddress: opt ? (opt.address ?? '') : f.billAddress,
      // SHIP TO comes along too — for most customers that is the billing party repeated, and
      // for the rest it is the delivery address they were set up with.
      shipName: opt ? shipToFor(opt).name : f.shipName,
      shipAddress: opt ? shipToFor(opt).address : f.shipAddress,
      // The customer carries the tax profile: reseller exemption, and (if set) the invoice type.
      reseller: opt ? Boolean(opt.reseller) : f.reseller,
      type: opt?.invoiceType ?? f.type,
    }));
  }

  async function submit(asDraft: boolean) {
    // `parsed` above is the single source of truth for validity — the buttons are gated on it,
    // and re-parsing here would risk the two drifting apart.
    if (!parsed.success) {
      // The buttons are gated on this same parse; reaching here means something changed under
      // us, so the field errors are shown rather than a toast that names nothing.
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setSaving(true);

    const shipTo = form.shipName.trim()
      ? { name: form.shipName.trim(), address: form.shipAddress.trim() || undefined }
      : undefined;

    const res = await apiPost<{ _id: string; emailed?: EmailOutcome }>('/api/invoices', {
      type: form.type,
      // Sent alongside the billing snapshot, not instead of it: the snapshot is what prints on
      // the document, this is what lets a later send find the customer's current email.
      customerId: customerId ?? undefined,
      billTo: {
        name: form.billName.trim(),
        email: form.billEmail.trim() || undefined,
        phone: form.billPhone.trim() || undefined,
        address: form.billAddress.trim() || undefined,
      },
      shipTo,
      items: form.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        discountPercent: Number(it.discountPercent) || 0,
      })),
      shippingHandlingTariff: Number(form.shippingHandling) || undefined,
      invoiceDiscount: Number(form.discount) || undefined,
      taxRate: taxable ? Number(form.taxPercent) / 100 : undefined,
      applyTax: policy === 'optional' ? form.applyTax : undefined,
      reseller: form.type === InvoiceType.Tax ? form.reseller : undefined,
      notes: form.notes || undefined,
      issueDate: form.issueDate ? new Date(form.issueDate).toISOString() : undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      asDraft,
    });

    setSaving(false);
    if (!res.ok) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(res.error ?? 'Failed to create invoice', { variant: 'error' });
      return;
    }
    /*
     * The API sends the invoice to the customer as part of creating it and waits for the result,
     * so the toast reports what actually happened rather than what was intended. A send that
     * failed is a warning, not an error: the invoice exists and is retryable from the list or
     * from the invoice page.
     */
    const emailed = res.data?.emailed;
    if (asDraft) {
      enqueueSnackbar('Draft saved', { variant: 'success' });
    } else if (emailed?.sent) {
      enqueueSnackbar(`Invoice created and emailed to ${emailed.to}`, { variant: 'success' });
    } else if (emailed?.reason) {
      enqueueSnackbar(`Invoice created, but not emailed: ${emailed.reason}`, {
        variant: 'warning',
      });
    } else {
      enqueueSnackbar('Invoice created', { variant: 'success' });
    }
    if (res.data?._id) router.replace(`/invoices/${res.data._id}`);
    else router.replace('/invoices');
  }

  if (!canCreate) return <NoAccess message="You do not have permission to create invoices." />;

  return (
    <Box className="rise-in">
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <IconButton onClick={() => router.push('/invoices')} aria-label="Back to invoices">
          <ArrowBackRounded />
        </IconButton>
        <Typography variant="h4" sx={{ fontWeight: 800, flexGrow: 1, minWidth: 160 }}>
          New invoice
        </Typography>
        {blockedReason && !saving && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {blockedReason}
          </Typography>
        )}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => router.push('/invoices')}
            disabled={saving}
            startIcon={<CloseRounded />}
          >
            Cancel
          </Button>
          {/* One button, not two. The pair only ever differed by how complete the form was, so
              a half-filled invoice showed a dead "Create invoice" next to a live "Save as draft"
              and made the reader work out which one this invoice qualified for. The button now
              says what pressing it will do, and promotes itself the moment the form earns it. */}
          <Button
            variant="contained"
            onClick={() => submit(!canFinalizeNew)}
            disabled={saving || !canDraft}
            startIcon={canFinalizeNew ? <ReceiptLongRounded /> : <SaveAsRounded />}
          >
            {canFinalizeNew ? 'Create invoice' : 'Save as draft'}
          </Button>
        </Stack>
      </Box>

      <InvoiceTemplateForm
        form={form}
        setForm={setForm}
        preview={preview}
        saving={saving}
        errors={errors}
        products={products}
        onCustomerPick={onCustomerPick}
      />
    </Box>
  );
}
