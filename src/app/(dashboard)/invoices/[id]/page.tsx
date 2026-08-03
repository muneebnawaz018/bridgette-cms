'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AppLink } from '@/components/ui/AppLink';
import { useParams, useRouter } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import PrintRounded from '@mui/icons-material/PrintRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import { calcInvoice } from '@/modules/invoicing/calc';
import { useCan } from '@/components/auth/SessionProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone, invoiceStateLabel } from '@/components/ui/StatusChip';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import {
  InvoiceTemplateForm,
  type TemplateForm,
  type CustomerOption,
  type ProductOption,
  shipToFor,
} from '@/components/invoices/InvoiceTemplateForm';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/invoices/InvoiceDocument';
import Link from '@mui/material/Link';
import { paymentFieldLabel } from '@/modules/payments/methodFields';
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { SendInvoiceSummary } from '@/components/invoices/SendInvoiceSummary';
import { useApi } from '@/lib/api/useApi';
import { apiPatch, apiPost } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { paymentMethodLabel } from '@/lib/format/labels';

interface Party {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
}
interface Item {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
  /** Percent off this line, stored on the invoice at pick time. */
  discountPercent?: number;
  discount?: number;
  lineTotal?: number;
}
interface Invoice {
  _id: string;
  number: string;
  type: InvoiceType;
  state: string;
  currency: string;
  billTo: Party;
  shipTo?: Party;
  items: Item[];
  subtotal: number;
  shippingHandlingTariff?: number;
  totalBeforeTax?: number;
  discount?: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  applyTax: boolean;
  reseller?: boolean;
  issueDate?: string;
  dueDate?: string;
  terms?: string;
  notes?: string;
  isArchived: boolean;
  isDeleted: boolean;
  /** Where an email would go: the customer's current address, resolved server-side. */
  sendTo?: string;
  /** Last time this invoice was emailed to the customer, if ever. */
  sent?: { at?: string; to?: string; count?: number } | null;
  archiveReason?: string;
  deleteReason?: string;
  reminder?: {
    thresholdMinutes?: number;
    dueAt?: string;
    sent?: boolean;
    sentAt?: string;
  };
}
interface Payment {
  _id: string;
  amount: number;
  currency: string;
  method: string;
  reference?: string;
  paidAt: string;
  /** Method-specific fields, keyed as in PAYMENT_METHOD_FIELDS. */
  details?: Record<string, string>;
  /** Present (without the image bytes) when a proof was attached. */
  proof?: { name?: string; contentType?: string; size?: number };
}

/** Local alias for the shared formatter; the arguments read better in this order here. */
const money = (n: number, cur: string) => formatMoney(cur, Number(n ?? 0));

/** Build the template-shaped edit form from a stored invoice. */
function toForm(inv: Invoice): TemplateForm {
  return {
    type: inv.type,
    billName: inv.billTo?.name ?? '',
    billEmail: inv.billTo?.email ?? '',
    billPhone: inv.billTo?.phone ?? '',
    billAddress: inv.billTo?.address ?? '',
    shipName: inv.shipTo?.name ?? '',
    shipAddress: inv.shipTo?.address ?? '',
    items: inv.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent ?? 0,
    })),
    reseller: inv.reseller ?? false,
    applyTax: inv.applyTax ?? false,
    taxPercent: Math.round((inv.taxRate ?? 0) * 10000) / 100,
    shippingHandling: inv.shippingHandlingTariff ?? 0,
    discount: inv.discount ?? 0,
    notes: inv.notes ?? '',
    issueDate: inv.issueDate ? inv.issueDate.slice(0, 10) : '',
    dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
  };
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  // Covers editing a draft and emailing an invoice. Editing a finalized invoice is not a
  // permission anyone holds — see updateInvoice.
  const canEdit = useCan(Permission.InvoiceEdit);
  const canPay = useCan(Permission.PaymentRecord);

  const { data: invoice, isLoading, error, mutate } = useApi<Invoice>(`/api/invoices/${id}`);
  const { data: payments, mutate: mutatePayments } = useApi<Payment[]>(
    `/api/invoices/${id}/payments`,
  );

  const [form, setForm] = useState<TemplateForm | null>(null); // non-null == form
  // What the form looked like when editing started, so Save can be dead until something differs.
  const baselineRef = useRef<string>('');
  const startEdit = useCallback((inv: Invoice) => {
    const next = toForm(inv);
    baselineRef.current = JSON.stringify(next);
    setForm(next);
  }, []);
  // Selected customer id, so per-customer product rates resolve in the line picker.
  const [customerId, setCustomerId] = useState<string | null>(null);
  const { data: productData } = useApi<{ items: ProductOption[] }>(
    `/api/products/options${customerId ? `?customerId=${customerId}` : ''}`,
  );
  const products = useMemo(() => productData?.items ?? [], [productData]);

  function onCustomerPick(opt: CustomerOption | null) {
    setCustomerId(opt ? opt._id : null);
    setForm((f) =>
      f
        ? {
            ...f,
            billName: opt ? opt.name : f.billName,
            billEmail: opt ? (opt.email ?? '') : f.billEmail,
            billPhone: opt ? (opt.phone ?? '') : f.billPhone,
            billAddress: opt ? (opt.address ?? '') : f.billAddress,
            // SHIP TO follows the customer as well — their delivery address, or the billing
            // party repeated when they ship to the same place.
            shipName: opt ? shipToFor(opt).name : f.shipName,
            shipAddress: opt ? shipToFor(opt).address : f.shipAddress,
            // Reseller exemption follows the customer. Type is fixed once the invoice exists.
            reseller: opt ? Boolean(opt.reseller) : f.reseller,
          }
        : f,
    );
  }
  // null = no confirm open; true = finalizing this draft; false = a plain save. Carrying the
  // intent here keeps the one confirm dialog serving both the "Save" and "Finalize" buttons.
  const [confirmFinalize, setConfirmFinalize] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // The record-payment modal owns its own form and request.
  const [payOpen, setPayOpen] = useState(false);

  /*
   * Emailing the invoice. Creating one no longer does this on its own: there is no unsend, so
   * an invoice with a wrong figure would be in the customer's inbox before anyone had read it.
   * This is the deliberate step, taken from the page that shows what they will receive.
   */
  const [confirmSend, setConfirmSend] = useState(false);
  const [sending, setSending] = useState(false);

  async function doSend() {
    setSending(true);
    const res = await apiPost<{ to?: string }>(`/api/invoices/${id}/send`, {});
    setSending(false);
    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not send the invoice', { variant: 'error' });
      return;
    }
    // The address the server actually used, not the one this page was showing.
    enqueueSnackbar(`Invoice emailed to ${res.data?.to ?? 'the customer'}`, { variant: 'success' });
    setConfirmSend(false);
    void mutate(); // the "sent" stamp changes the button's label
  }

  // The app-wide overlay is already up (useApi drives it via loadingBus); rendering a second
  // loader here would sit inside the page and leave the sidebar and top bar uncovered.
  if (isLoading && !invoice) return null;
  if (error || !invoice) return <Alert severity="error">This invoice could not be loaded.</Alert>;

  const locked = invoice.isArchived || invoice.isDeleted;
  const isDraft = invoice.state === 'draft';
  const policy = TAX_POLICY[invoice.type];
  // Reseller (US Tax only) is tax-exempt. Read from the form while editing, the stored flag when
  // viewing, so the tax line reads correctly in both modes.
  const resellerExempt =
    invoice.type === InvoiceType.Tax && (form ? form.reseller : Boolean(invoice.reseller));

  const dirty = form ? JSON.stringify(form) !== baselineRef.current : false;
  const complete = Boolean(form && form.billName.trim() && form.items.length > 0);
  const canSave = complete && dirty;
  // Why Save is dead. "Nothing changed" first: it is the more useful thing to say about a form
  // someone has only just opened.
  const blockedReason = !form
    ? undefined
    : !dirty
      ? 'No changes to save'
      : !complete
        ? 'A customer and at least one line are required'
        : undefined;

  const preview =
    form &&
    calcInvoice({
      type: invoice.type,
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
    });

  // The read-only view renders the same template document as print/edit, so it maps the stored
  // invoice onto the document shape.
  const docData: InvoiceDocumentData = {
    number: invoice.number,
    type: invoice.type,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    billTo: invoice.billTo,
    shipTo: invoice.shipTo,
    reseller: Boolean(invoice.reseller),
    items: invoice.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent ?? 0,
      lineTotal: it.lineTotal ?? it.quantity * it.unitPrice,
    })),
    subtotal: invoice.subtotal,
    shippingHandlingTariff: invoice.shippingHandlingTariff ?? 0,
    totalBeforeTax:
      invoice.totalBeforeTax ??
      invoice.subtotal + (invoice.shippingHandlingTariff ?? 0) - (invoice.discount ?? 0),
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    discount: invoice.discount ?? 0,
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
  };

  async function doSave() {
    if (!form || !invoice || confirmFinalize === null) return;
    const finalize = confirmFinalize;
    const taxable =
      (policy === 'always' || (policy === 'optional' && form.applyTax)) && !resellerExempt;
    setSaving(true);
    const res = await apiPatch(`/api/invoices/${invoice._id}`, {
      // Only when the customer was re-picked in this edit. Left out otherwise so an edit that
      // never touched the party keeps whatever link the invoice already had.
      customerId: customerId ?? undefined,
      billTo: {
        name: form.billName,
        email: form.billEmail || undefined,
        phone: form.billPhone || undefined,
        address: form.billAddress || undefined,
      },
      shipTo: form.shipName.trim()
        ? { name: form.shipName.trim(), address: form.shipAddress.trim() || undefined }
        : undefined,
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
      reseller: invoice.type === InvoiceType.Tax ? form.reseller : undefined,
      notes: form.notes || undefined,
      issueDate: form.issueDate ? new Date(form.issueDate).toISOString() : undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      // Only meaningful while the invoice is still a draft: false finalizes it, omitted leaves
      // the state untouched. The service ignores it for already-finalized invoices.
      ...(isDraft ? { asDraft: !finalize } : {}),
    });
    setSaving(false);
    setConfirmFinalize(null);
    if (res.ok) {
      enqueueSnackbar(finalize ? 'Invoice finalized' : 'Invoice updated', { variant: 'success' });
      // Finalizing turns a draft into a live invoice — leave the editor and drop back to the
      // invoices table, where it now appears in the active list.
      if (finalize) {
        router.push('/invoices');
        return;
      }
      setForm(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update invoice', { variant: 'error' });
    }
  }

  return (
    <Box className="rise-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <IconButton
          component={AppLink}
          href="/invoices"
          aria-label="Back to invoices"
          sx={{ mr: 0.5 }}
        >
          <ArrowBackRounded />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            {invoice.number}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 0.75 }}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Chip size="small" label={invoice.type.toUpperCase()} variant="outlined" />
            <StatusChip
              label={invoiceStateLabel(invoice.state)}
              tone={invoiceStateTone[invoice.state] ?? 'neutral'}
            />
            <Typography variant="body2" color="text.secondary">
              {invoice.currency}
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          {/* Opens the printable template in a new tab (its own layout, no app chrome) — the
              print dialog is the Save-as-PDF path. Hidden while editing and for drafts, which
              are not yet real documents to hand out. */}
          {!form && !isDraft && (
            <Button
              variant="outlined"
              startIcon={<PrintRounded />}
              onClick={() => window.open(`/print/invoices/${id}`, '_blank')}
            >
              Print / PDF
            </Button>
          )}
          {/* Same rule as Print: a draft is not a document to hand out yet. */}
          {!form && !isDraft && !locked && canEdit && (
            <Button
              variant="outlined"
              startIcon={<SendRounded />}
              onClick={() => setConfirmSend(true)}
            >
              {invoice.sent?.at ? 'Email again' : 'Email to customer'}
            </Button>
          )}
          {/* Drafts only. A finalized invoice is a document the customer already has; the API
              refuses to change one, so offering the button would only produce an error. */}
          {!form && !locked && isDraft && canEdit && (
            <Button
              variant="contained"
              startIcon={<EditRounded />}
              onClick={() => startEdit(invoice)}
            >
              Edit
            </Button>
          )}
          {/* Record payment lives in the overflow menu only. It used to be both a button and a
              menu item, which read as two different actions sitting next to each other. */}
          {!form && (
            <RowActionsMenu
              ariaLabel="Invoice actions"
              actions={
                canPay && !locked && invoice.state !== 'paid' && invoice.state !== 'draft'
                  ? [{ label: 'Record payment', onClick: () => setPayOpen(true) }]
                  : []
              }
            />
          )}
          {form && (
            <>
              {blockedReason && !saving && (
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  {blockedReason}
                </Typography>
              )}
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => setForm(null)}
                disabled={saving}
                startIcon={<CloseRounded />}
              >
                Cancel
              </Button>
              {isDraft ? (
                // A draft offers two exits: keep refining it, or finalize it into a live
                // invoice. The finalize is the primary (contained) action.
                <>
                  <Button
                    variant="outlined"
                    onClick={() => setConfirmFinalize(false)}
                    disabled={saving || !canSave}
                    startIcon={<SaveRounded />}
                  >
                    Save as draft
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => setConfirmFinalize(true)}
                    disabled={saving || !canSave}
                    startIcon={<CheckCircleRounded />}
                  >
                    Finalize invoice
                  </Button>
                </>
              ) : (
                <Button
                  variant="contained"
                  onClick={() => setConfirmFinalize(false)}
                  disabled={saving || !canSave}
                  startIcon={<SaveRounded />}
                >
                  Save changes
                </Button>
              )}
            </>
          )}
        </Stack>
      </Box>

      {invoice.isDeleted && (
        <Alert severity="error" sx={{ mb: 2 }}>
          This invoice is deleted. Reason: {invoice.deleteReason || 'none given'}
        </Alert>
      )}
      {invoice.isArchived && !invoice.isDeleted && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This invoice is archived. Reason: {invoice.archiveReason || 'none given'}
        </Alert>
      )}

      {/* Editing (drafts, or an admin editing a finalized invoice) happens on the template
          itself, so the form reads like the printed document. Viewing shows the summary cards. */}
      {form && (
        <InvoiceTemplateForm
          form={form}
          setForm={setForm as React.Dispatch<React.SetStateAction<TemplateForm>>}
          preview={preview as ReturnType<typeof calcInvoice>}
          saving={saving}
          errors={{}}
          products={products}
          onCustomerPick={onCustomerPick}
        />
      )}

      {/* Flat grid so paired cards share a row and stretch to equal height: Line items ↔ Bill
          to, then Totals ↔ Details. Payments spans the full width below. */}
      {!form && (
        <Grid container spacing={2.5} alignItems="stretch">
          {/* The invoice shown in the very template it prints and edits in. */}
          <Grid size={12}>
            <Paper sx={{ p: { xs: 1.5, md: 2.5 }, overflowX: 'auto' }}>
              <InvoiceDocument invoice={docData} />
            </Paper>
          </Grid>

          {/* Payments — full width below the paired cards. */}
          <Grid size={12}>
            <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
              <Typography variant="h6" gutterBottom>
                Payments
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              {!payments || payments.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No payments recorded.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />} spacing={0.5}>
                  {payments.map((p) => (
                    <Box key={p._id} sx={{ py: 1.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} className="tnum">
                            {money(p.amount, p.currency)}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {paymentMethodLabel(p.method)} ·{' '}
                            {new Date(p.paidAt).toLocaleDateString()}
                          </Typography>
                          {/* Method-specific details captured with the payment. */}
                          {p.details && Object.keys(p.details).length > 0 && (
                            <Stack spacing={0.25} sx={{ mt: 0.75 }}>
                              {Object.entries(p.details).map(([k, v]) => (
                                <Typography key={k} variant="caption" color="text.secondary">
                                  <Box
                                    component="span"
                                    sx={{ color: 'text.primary', fontWeight: 600 }}
                                  >
                                    {paymentFieldLabel(p.method, k)}:
                                  </Box>{' '}
                                  {v}
                                </Typography>
                              ))}
                            </Stack>
                          )}
                        </Box>
                        {/* Always occupy the proof slot so the row layout is consistent — a link when
                          there is proof, a muted "No proof" (cash) when there is not. */}
                        {p.proof ? (
                          <Link
                            href={`/api/invoices/${id}/payments/${p._id}/proof`}
                            target="_blank"
                            rel="noopener"
                            variant="body2"
                            sx={{ fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            View proof
                          </Link>
                        ) : (
                          <Typography
                            variant="body2"
                            color="text.disabled"
                            sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                          >
                            No proof
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Stack>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Save / finalize confirm — one dialog, wording switched by intent. */}
      <ConfirmDialog
        open={confirmFinalize !== null}
        title={confirmFinalize ? 'Finalize this invoice?' : 'Save changes?'}
        description={
          confirmFinalize
            ? 'This turns the draft into a live invoice. Totals are locked in from the current line items, and it can no longer be returned to draft.'
            : 'Totals and the invoice state are recalculated from the new line items and tax.'
        }
        confirmLabel={confirmFinalize ? 'Finalize' : 'Save'}
        confirmIcon={confirmFinalize ? <CheckCircleRounded /> : <SaveRounded />}
        loading={saving}
        onConfirm={doSave}
        onClose={() => setConfirmFinalize(null)}
      />

      {/* Sending is irreversible in the only way that matters: the customer has it. So it asks
          first, and names the address it will actually use rather than "the customer". */}
      <ConfirmDialog
        open={confirmSend}
        title={`Email ${invoice.number}?`}
        // Wider than the default so the address is not broken across lines — a half-wrapped
        // email is the one thing on this dialog that has to be read carefully.
        maxWidth="sm"
        description={
          <SendInvoiceSummary
            customerName={invoice.billTo?.name}
            sendTo={invoice.sendTo}
            total={invoice.grandTotal}
            currency={invoice.currency}
            alreadySent={Boolean(invoice.sent?.at)}
          />
        }
        confirmLabel="Send"
        confirmIcon={<SendRounded />}
        confirmDisabled={!invoice.sendTo}
        loading={sending}
        onConfirm={doSend}
        onClose={() => setConfirmSend(false)}
      />

      <RecordPaymentModal
        invoice={payOpen ? invoice : null}
        onClose={() => setPayOpen(false)}
        onRecorded={() => {
          void mutate();
          void mutatePayments();
        }}
      />
    </Box>
  );
}
