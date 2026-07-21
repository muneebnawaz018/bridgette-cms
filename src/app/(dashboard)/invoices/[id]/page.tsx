'use client';

import { useState } from 'react';
import { AppLink } from '@/components/ui/AppLink';
import { useParams } from 'next/navigation';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Grid from '@mui/material/Grid2';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, TAX_POLICY } from '@/modules/invoicing/enums';
import { calcInvoice } from '@/modules/invoicing/calc';
import { useCan } from '@/components/auth/SessionProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { RecordPaymentModal } from '@/components/invoices/RecordPaymentModal';
import { useApi } from '@/lib/api/useApi';
import { apiPatch } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { paymentMethodLabel } from '@/lib/format/labels';
import { REMINDER_PRESETS, reminderLabel } from '@/modules/invoicing/reminders';

/**
 * One line describing an invoice's reminder: the interval, plus whether it has gone out yet.
 * The interval on its own ("3 days") does not answer the question people actually have, which
 * is whether they are still waiting on it.
 */
function reminderSummary(
  reminder: Invoice['reminder'] | undefined,
  isDraft: boolean,
  hasDueDate: boolean,
): string {
  if (!reminder?.thresholdMinutes) return '—';
  const label = `${reminderLabel(reminder.thresholdMinutes)} after due date`;
  if (reminder.sent) {
    const when = reminder.sentAt ? new Date(reminder.sentAt).toLocaleString() : 'already';
    return `${label} · sent ${when}`;
  }
  // No dueAt means the clock has not started: either a draft holding its interval until
  // finalized, or a finalized invoice with no due date to fire after.
  if (!reminder.dueAt) {
    if (isDraft) return `${label} · starts once finalized`;
    if (!hasDueDate) return `${label} · set a due date to schedule`;
    return label;
  }
  const due = new Date(reminder.dueAt);
  return `${label} · ${due.getTime() <= Date.now() ? 'due now' : `due ${due.toLocaleString()}`}`;
}

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
  items: Item[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  applyTax: boolean;
  issueDate?: string;
  dueDate?: string;
  terms?: string;
  notes?: string;
  isArchived: boolean;
  isDeleted: boolean;
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
}

interface EditItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
  discount: number;
}
interface EditForm {
  billName: string;
  billEmail: string;
  items: EditItem[];
  taxPercent: number;
  applyTax: boolean;
  notes: string;
  issueDate: string;
  dueDate: string;
  /** Minutes as a string, or '' for no reminder — matches the select's value type. */
  reminder: string;
}

/** Local alias for the shared formatter; the arguments read better in this order here. */
const money = (n: number, cur: string) => formatMoney(cur, Number(n ?? 0));

function toForm(inv: Invoice): EditForm {
  return {
    billName: inv.billTo?.name ?? '',
    billEmail: inv.billTo?.email ?? '',
    items: inv.items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      taxable: it.taxable ?? true,
      discount: it.discount ?? 0,
    })),
    taxPercent: Math.round((inv.taxRate ?? 0) * 10000) / 100,
    applyTax: inv.applyTax ?? false,
    notes: inv.notes ?? '',
    issueDate: inv.issueDate ? inv.issueDate.slice(0, 10) : '',
    dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
    reminder: inv.reminder?.thresholdMinutes != null ? String(inv.reminder.thresholdMinutes) : '',
  };
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = useCan(Permission.InvoiceEdit);
  const canPay = useCan(Permission.PaymentRecord);

  const { data: invoice, isLoading, error, mutate } = useApi<Invoice>(`/api/invoices/${id}`);
  const { data: payments, mutate: mutatePayments } = useApi<Payment[]>(
    `/api/invoices/${id}/payments`,
  );

  const [form, setForm] = useState<EditForm | null>(null); // non-null == form
  // null = no confirm open; true = finalizing this draft; false = a plain save. Carrying the
  // intent here keeps the one confirm dialog serving both the "Save" and "Finalize" buttons.
  const [confirmFinalize, setConfirmFinalize] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  // The record-payment modal owns its own form and request.
  const [payOpen, setPayOpen] = useState(false);

  // The app-wide overlay is already up (useApi drives it); rendering a second one here would
  // sit inside the page and leave the sidebar and top bar uncovered.
  if (isLoading && !invoice) return null;
  if (error || !invoice) return <Alert severity="error">This invoice could not be loaded.</Alert>;

  const locked = invoice.isArchived || invoice.isDeleted;
  const isDraft = invoice.state === 'draft';
  const policy = TAX_POLICY[invoice.type];

  const canSave = Boolean(form && form.billName && form.items.length > 0);
  // A reminder fires after the due date, so one without a due date can never run — block the
  // save and flag the field until a date is set.
  const dueDateMissing = Boolean(form?.reminder) && !form?.dueDate;

  const preview =
    form &&
    calcInvoice({
      type: invoice.type,
      items: form.items.map((it) => ({
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        taxable: it.taxable,
        discount: Number(it.discount) || 0,
      })),
      taxRate: Number(form.taxPercent) / 100,
      applyTax: form.applyTax,
    });

  const setLine = (i: number, patch: Partial<EditItem>) =>
    setForm((f) =>
      f ? { ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } : f,
    );

  // The tax line names its own rate, so "Tax  USD 1.49" reads as "Tax (8.75%)  USD 1.49".
  // Editing takes the live percentage from the form; viewing derives it from the stored
  // fraction. Trailing zeros are trimmed so 8.5 shows as "8.5%", not "8.50%".
  const taxRatePct = form ? Number(form.taxPercent) || 0 : (invoice.taxRate ?? 0) * 100;
  const taxRowLabel = taxRatePct > 0 ? `Tax (${Number(taxRatePct.toFixed(2))}%)` : 'Tax';

  async function doSave() {
    if (!form || !invoice || confirmFinalize === null) return;
    const finalize = confirmFinalize;
    const taxable = policy === 'always' || (policy === 'optional' && form.applyTax);
    setSaving(true);
    const res = await apiPatch(`/api/invoices/${invoice._id}`, {
      billTo: { name: form.billName, email: form.billEmail || undefined },
      items: form.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
        taxable: it.taxable,
        discount: Number(it.discount) || 0,
      })),
      taxRate: taxable ? Number(form.taxPercent) / 100 : undefined,
      applyTax: policy === 'optional' ? form.applyTax : undefined,
      notes: form.notes || undefined,
      issueDate: form.issueDate ? new Date(form.issueDate).toISOString() : undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      // null, not undefined, when cleared: undefined would mean "leave it as it is".
      reminderThresholdMinutes: form.reminder ? Number(form.reminder) : null,
      // Only meaningful while the invoice is still a draft: false finalizes it, omitted leaves
      // the state untouched. The service ignores it for already-finalized invoices.
      ...(isDraft ? { asDraft: !finalize } : {}),
    });
    setSaving(false);
    setConfirmFinalize(null);
    if (res.ok) {
      enqueueSnackbar(finalize ? 'Invoice finalized' : 'Invoice updated', { variant: 'success' });
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
            <StatusChip label={invoice.state} tone={invoiceStateTone[invoice.state] ?? 'neutral'} />
            <Typography variant="body2" color="text.secondary">
              {invoice.currency}
            </Typography>
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          {!form && canEdit && !locked && (
            <Button
              variant="outlined"
              startIcon={<EditRounded />}
              onClick={() => setForm(toForm(invoice))}
            >
              Edit
            </Button>
          )}
          {!form && canPay && !locked && invoice.state !== 'paid' && invoice.state !== 'draft' && (
            <Button
              variant="contained"
              startIcon={<PaymentsRounded />}
              onClick={() => setPayOpen(true)}
            >
              Record payment
            </Button>
          )}
          {form && (
            <>
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
                    disabled={saving || !canSave || dueDateMissing}
                    startIcon={<SaveRounded />}
                  >
                    Save as draft
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => setConfirmFinalize(true)}
                    disabled={saving || !canSave || dueDateMissing}
                    startIcon={<CheckCircleRounded />}
                  >
                    Finalize invoice
                  </Button>
                </>
              ) : (
                <Button
                  variant="contained"
                  onClick={() => setConfirmFinalize(false)}
                  disabled={saving || !canSave || dueDateMissing}
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

      {/* Flat grid so paired cards share a row and stretch to equal height: Line items ↔ Bill
          to, then Totals ↔ Details. Payments spans the full width below. */}
      <Grid container spacing={2.5} alignItems="stretch">
        {/* Row 1 left — line items. Tax controls live with Totals now, not here. */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Line items
            </Typography>
            <Divider sx={{ mb: 1.5 }} />

            {!form ? (
              <Stack divider={<Divider flexItem />}>
                {invoice.items.map((it, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 2, py: 1.2, alignItems: 'baseline' }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {it.description || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {it.quantity} × {money(it.unitPrice, invoice.currency)}
                        {it.discount ? ` · less ${money(it.discount, invoice.currency)}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="body2" className="tnum" sx={{ fontWeight: 600 }}>
                      {money(it.lineTotal ?? it.quantity * it.unitPrice, invoice.currency)}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                {form.items.map((line, i) => (
                  <Grid container spacing={1} key={i} alignItems="center">
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        label="Description"
                        size="small"
                        value={line.description}
                        onChange={(e) => setLine(i, { description: e.target.value })}
                        fullWidth
                        disabled={saving}
                      />
                    </Grid>
                    <Grid size={{ xs: 5, sm: 2 }}>
                      <TextField
                        label="Qty"
                        size="small"
                        type="number"
                        value={line.quantity}
                        onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                        fullWidth
                        disabled={saving}
                      />
                    </Grid>
                    <Grid size={{ xs: 5, sm: 3 }}>
                      <TextField
                        label="Unit price"
                        size="small"
                        type="number"
                        value={line.unitPrice}
                        onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })}
                        fullWidth
                        disabled={saving}
                      />
                    </Grid>
                    <Grid size={{ xs: 2, sm: 1 }}>
                      <IconButton
                        aria-label="Remove line"
                        size="small"
                        disabled={saving || form.items.length === 1}
                        onClick={() =>
                          setForm((f) =>
                            f ? { ...f, items: f.items.filter((_, idx) => idx !== i) } : f,
                          )
                        }
                      >
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Box>
                  <Button
                    size="small"
                    startIcon={<AddRounded />}
                    disabled={saving}
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              items: [
                                ...f.items,
                                {
                                  description: '',
                                  quantity: 1,
                                  unitPrice: 0,
                                  taxable: true,
                                  discount: 0,
                                },
                              ],
                            }
                          : f,
                      )
                    }
                  >
                    Add line
                  </Button>
                </Box>
              </Stack>
            )}
          </Paper>
        </Grid>

        {/* Row 1 right — bill-to. */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Bill to
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            {!form ? (
              <Stack spacing={0.5}>
                <Typography sx={{ fontWeight: 600 }}>{invoice.billTo?.name ?? '—'}</Typography>
                {invoice.billTo?.email && (
                  <Typography variant="body2" color="text.secondary">
                    {invoice.billTo.email}
                  </Typography>
                )}
                {invoice.billTo?.phone && (
                  <Typography variant="body2" color="text.secondary">
                    {invoice.billTo.phone}
                  </Typography>
                )}
                {invoice.billTo?.address && (
                  <Typography variant="body2" color="text.secondary">
                    {invoice.billTo.address}
                  </Typography>
                )}
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Name"
                  size="small"
                  value={form.billName}
                  onChange={(e) => setForm((f) => (f ? { ...f, billName: e.target.value } : f))}
                  fullWidth
                  required
                  disabled={saving}
                />
                <TextField
                  label="Email"
                  size="small"
                  value={form.billEmail}
                  onChange={(e) => setForm((f) => (f ? { ...f, billEmail: e.target.value } : f))}
                  fullWidth
                  disabled={saving}
                />
              </Stack>
            )}
          </Paper>
        </Grid>

        {/* Row 2 left — totals, with the tax controls that drive the tax line. */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Totals
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={2}>
              {form && (policy === 'optional' || policy === 'always' || form.applyTax) && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  {policy === 'optional' && (
                    <TextField
                      select
                      size="small"
                      label="Apply tax"
                      value={form.applyTax ? 'yes' : 'no'}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, applyTax: e.target.value === 'yes' } : f))
                      }
                      sx={{ width: { xs: '100%', sm: 180 } }}
                      disabled={saving}
                    >
                      <MenuItem value="no">No</MenuItem>
                      <MenuItem value="yes">Yes</MenuItem>
                    </TextField>
                  )}
                  {(policy === 'always' || (policy === 'optional' && form.applyTax)) && (
                    <TextField
                      size="small"
                      label="Tax rate %"
                      type="number"
                      value={form.taxPercent}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, taxPercent: Number(e.target.value) } : f))
                      }
                      sx={{ width: { xs: '100%', sm: 180 } }}
                      disabled={saving}
                    />
                  )}
                </Stack>
              )}
              <Stack spacing={1}>
                <Row
                  label="Subtotal"
                  value={money(preview ? preview.subtotal : invoice.subtotal, invoice.currency)}
                />
                <Row
                  label={taxRowLabel}
                  value={money(preview ? preview.taxAmount : invoice.taxAmount, invoice.currency)}
                />
                <Divider />
                <Row
                  label="Grand total"
                  value={money(preview ? preview.grandTotal : invoice.grandTotal, invoice.currency)}
                  strong
                />
                {!form && <Row label="Paid" value={money(invoice.amountPaid, invoice.currency)} />}
                {!form && (
                  <Row
                    label="Balance due"
                    value={money(invoice.balanceDue, invoice.currency)}
                    strong
                    danger={invoice.balanceDue > 0}
                  />
                )}
              </Stack>
            </Stack>
          </Paper>
        </Grid>

        {/* Row 2 right — schedule, terms and notes. */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Details
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            {!form ? (
              <Stack spacing={1}>
                <Row
                  label="Invoice date"
                  value={invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : '—'}
                />
                <Row
                  label="Due date"
                  value={invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'}
                />
                <Row
                  label="Reminder"
                  value={reminderSummary(invoice.reminder, isDraft, Boolean(invoice.dueDate))}
                />
                <Row label="Notes" value={invoice.notes || '—'} />
                <Box sx={{ pt: 1 }}>
                  <AppLink href="/billing-terms" style={{ fontWeight: 600 }}>
                    View billing terms &amp; policies →
                  </AppLink>
                </Box>
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField
                  label="Invoice date"
                  size="small"
                  type="date"
                  value={form.issueDate}
                  onChange={(e) => setForm((f) => (f ? { ...f, issueDate: e.target.value } : f))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  disabled={saving}
                />
                <TextField
                  label="Due date"
                  size="small"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => (f ? { ...f, dueDate: e.target.value } : f))}
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  disabled={saving}
                  error={dueDateMissing}
                  helperText={
                    dueDateMissing ? 'A reminder fires after the due date — set one.' : undefined
                  }
                />
                <TextField
                  select
                  label="Remind me if unpaid"
                  size="small"
                  value={form.reminder}
                  onChange={(e) => setForm((f) => (f ? { ...f, reminder: e.target.value } : f))}
                  fullWidth
                  disabled={saving}
                  helperText="Fires this long after the due date, once the invoice is finalized."
                >
                  <MenuItem value="">No reminder</MenuItem>
                  {REMINDER_PRESETS.map((p) => (
                    <MenuItem key={p.minutes} value={String(p.minutes)}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Notes"
                  size="small"
                  value={form.notes}
                  onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
                  fullWidth
                  multiline
                  minRows={4}
                  disabled={saving}
                />
                {/* Terms are the company-wide policy, not a per-invoice field — link only. */}
                <Box sx={{ pt: 0.5 }}>
                  <AppLink href="/billing-terms" style={{ fontWeight: 600 }}>
                    View billing terms &amp; policies →
                  </AppLink>
                </Box>
              </Stack>
            )}
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
              <Stack divider={<Divider flexItem />}>
                {payments.map((p) => (
                  <Box key={p._id} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 1 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} className="tnum">
                        {money(p.amount, p.currency)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {paymentMethodLabel(p.method)} · {new Date(p.paidAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>

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

function Row({
  label,
  value,
  strong,
  danger,
}: {
  label: string;
  value: string;
  strong?: boolean;
  danger?: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        className="tnum"
        sx={{
          fontWeight: strong ? 700 : 500,
          color: danger ? 'error.main' : 'text.primary',
          textAlign: 'right',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
