'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, PaymentMethod, TAX_POLICY } from '@/modules/invoicing/enums';
import { calcInvoice } from '@/modules/invoicing/calc';
import { useCan } from '@/components/auth/SessionProvider';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { BrandLoader } from '@/components/ui/BrandLoader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { apiPost, apiPatch } from '@/lib/api/client';

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
  dueDate?: string;
  terms?: string;
  notes?: string;
  isArchived: boolean;
  isDeleted: boolean;
  archiveReason?: string;
  deleteReason?: string;
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
  terms: string;
  notes: string;
  dueDate: string;
}

const money = (n: number, cur: string) =>
  `${cur} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
    terms: inv.terms ?? '',
    notes: inv.notes ?? '',
    dueDate: inv.dueDate ? inv.dueDate.slice(0, 10) : '',
  };
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const canEdit = useCan(Permission.InvoiceEdit);
  const canPay = useCan(Permission.PaymentRecord);

  const { data: invoice, isLoading, error, mutate } = useApi<Invoice>(`/api/invoices/${id}`);
  const { data: payments, mutate: mutatePayments } = useApi<Payment[]>(`/api/invoices/${id}/payments`);

  const [form, setForm] = useState<EditForm | null>(null); // non-null == form
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);

  // Record-payment dialog
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: '', method: PaymentMethod.BankTransfer });
  const [recording, setRecording] = useState(false);

  if (isLoading && !invoice) return <BrandLoader overlay label="Loading invoice…" />;
  if (error || !invoice) return <Alert severity="error">This invoice could not be loaded.</Alert>;

  const locked = invoice.isArchived || invoice.isDeleted;
  const policy = TAX_POLICY[invoice.type];

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
    setForm((f) => (f ? { ...f, items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) } : f));

  async function doSave() {
    if (!form || !invoice) return;
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
      terms: form.terms || undefined,
      notes: form.notes || undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
    });
    setSaving(false);
    setConfirmSave(false);
    if (res.ok) {
      enqueueSnackbar('Invoice updated', { variant: 'success' });
      setForm(null);
      void mutate();
    } else {
      enqueueSnackbar(res.error ?? 'Could not update invoice', { variant: 'error' });
    }
  }

  async function submitPayment() {
    if (!invoice) return;
    setRecording(true);
    const res = await apiPost(`/api/invoices/${invoice._id}/payments`, {
      amount: Number(pay.amount),
      method: pay.method,
    });
    setRecording(false);
    if (res.ok) {
      enqueueSnackbar('Payment recorded', { variant: 'success' });
      setPayOpen(false);
      void mutate();
      void mutatePayments();
    } else {
      enqueueSnackbar(res.error ?? 'Failed to record payment', { variant: 'error' });
    }
  }

  return (
    <Box className="rise-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <IconButton component={Link} href="/invoices" aria-label="Back to invoices" sx={{ mr: 0.5 }}>
          <ArrowBackRounded />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>{invoice.number}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75 }} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip size="small" label={invoice.type.toUpperCase()} variant="outlined" />
            <StatusChip label={invoice.state} tone={invoiceStateTone[invoice.state] ?? 'neutral'} />
            <Typography variant="body2" color="text.secondary">{invoice.currency}</Typography>
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          {!form && canEdit && !locked && (
            <Button variant="outlined" startIcon={<EditRounded />} onClick={() => setForm(toForm(invoice))}>
              Edit
            </Button>
          )}
          {!form && canPay && !locked && invoice.state !== 'paid' && invoice.state !== 'draft' && (
            <Button variant="contained" onClick={() => { setPay({ amount: String(invoice.balanceDue ?? ''), method: PaymentMethod.BankTransfer }); setPayOpen(true); }}>
              Record payment
            </Button>
          )}
          {form && (
            <>
              <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
              <Button variant="contained" onClick={() => setConfirmSave(true)} disabled={saving || !form.billName || form.items.length === 0}>
                Save changes
              </Button>
            </>
          )}
        </Stack>
      </Box>

      {invoice.isDeleted && <Alert severity="error" sx={{ mb: 2 }}>This invoice is deleted. Reason: {invoice.deleteReason || 'none given'}</Alert>}
      {invoice.isArchived && !invoice.isDeleted && <Alert severity="warning" sx={{ mb: 2 }}>This invoice is archived. Reason: {invoice.archiveReason || 'none given'}</Alert>}

      <Grid container spacing={2.5}>
        {/* Main column: line items + totals */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, mb: 2.5 }}>
            <Typography variant="h6" gutterBottom>Line items</Typography>
            <Divider sx={{ mb: 1.5 }} />

            {!form ? (
              <Stack divider={<Divider flexItem />}>
                {invoice.items.map((it, i) => (
                  <Box key={i} sx={{ display: 'flex', gap: 2, py: 1.2, alignItems: 'baseline' }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{it.description || '—'}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {it.quantity} × {money(it.unitPrice, invoice.currency)}
                        {it.discount ? ` · less ${money(it.discount, invoice.currency)}` : ''}
                      </Typography>
                    </Box>
                    <Typography className="tnum" sx={{ fontWeight: 600 }}>
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
                      <TextField label="Description" size="small" value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} fullWidth disabled={saving} />
                    </Grid>
                    <Grid size={{ xs: 4, sm: 2 }}>
                      <TextField label="Qty" size="small" type="number" value={line.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} fullWidth disabled={saving} />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField label="Unit price" size="small" type="number" value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} fullWidth disabled={saving} />
                    </Grid>
                    <Grid size={{ xs: 2, sm: 1 }}>
                      <IconButton aria-label="Remove line" disabled={saving || form.items.length === 1} onClick={() => setForm((f) => (f ? { ...f, items: f.items.filter((_, idx) => idx !== i) } : f))}>
                        <DeleteOutlineRounded fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Box>
                  <Button size="small" startIcon={<AddRounded />} disabled={saving} onClick={() => setForm((f) => (f ? { ...f, items: [...f.items, { description: '', quantity: 1, unitPrice: 0, taxable: true, discount: 0 }] } : f))}>
                    Add line
                  </Button>
                </Box>
                {policy === 'optional' && (
                  <TextField select size="small" label="Apply tax" value={form.applyTax ? 'yes' : 'no'} onChange={(e) => setForm((f) => (f ? { ...f, applyTax: e.target.value === 'yes' } : f))} sx={{ maxWidth: 180 }} disabled={saving}>
                    <MenuItem value="no">No</MenuItem>
                    <MenuItem value="yes">Yes</MenuItem>
                  </TextField>
                )}
                {(policy === 'always' || (policy === 'optional' && form.applyTax)) && (
                  <TextField size="small" label="Tax rate %" type="number" value={form.taxPercent} onChange={(e) => setForm((f) => (f ? { ...f, taxPercent: Number(e.target.value) } : f))} sx={{ maxWidth: 180 }} disabled={saving} />
                )}
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h6" gutterBottom>Totals</Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1}>
              <Row label="Subtotal" value={money(preview ? preview.subtotal : invoice.subtotal, invoice.currency)} />
              <Row label="Tax" value={money(preview ? preview.taxAmount : invoice.taxAmount, invoice.currency)} />
              <Divider />
              <Row label="Grand total" value={money(preview ? preview.grandTotal : invoice.grandTotal, invoice.currency)} strong />
              {!form && <Row label="Paid" value={money(invoice.amountPaid, invoice.currency)} />}
              {!form && <Row label="Balance due" value={money(invoice.balanceDue, invoice.currency)} strong danger={invoice.balanceDue > 0} />}
            </Stack>
          </Paper>
        </Grid>

        {/* Side column: bill-to, meta, payments */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: { xs: 2.5, md: 3 }, mb: 2.5 }}>
            <Typography variant="h6" gutterBottom>Bill to</Typography>
            <Divider sx={{ mb: 1.5 }} />
            {!form ? (
              <Stack spacing={0.5}>
                <Typography sx={{ fontWeight: 600 }}>{invoice.billTo?.name ?? '—'}</Typography>
                {invoice.billTo?.email && <Typography variant="body2" color="text.secondary">{invoice.billTo.email}</Typography>}
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField label="Name" size="small" value={form.billName} onChange={(e) => setForm((f) => (f ? { ...f, billName: e.target.value } : f))} fullWidth required disabled={saving} />
                <TextField label="Email" size="small" value={form.billEmail} onChange={(e) => setForm((f) => (f ? { ...f, billEmail: e.target.value } : f))} fullWidth disabled={saving} />
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: { xs: 2.5, md: 3 }, mb: 2.5 }}>
            <Typography variant="h6" gutterBottom>Details</Typography>
            <Divider sx={{ mb: 1.5 }} />
            {!form ? (
              <Stack spacing={1}>
                <Row label="Due date" value={invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '—'} />
                <Row label="Terms" value={invoice.terms || '—'} />
                <Row label="Notes" value={invoice.notes || '—'} />
              </Stack>
            ) : (
              <Stack spacing={2}>
                <TextField label="Due date" size="small" type="date" value={form.dueDate} onChange={(e) => setForm((f) => (f ? { ...f, dueDate: e.target.value } : f))} fullWidth InputLabelProps={{ shrink: true }} disabled={saving} />
                <TextField label="Terms" size="small" value={form.terms} onChange={(e) => setForm((f) => (f ? { ...f, terms: e.target.value } : f))} fullWidth disabled={saving} />
                <TextField label="Notes" size="small" value={form.notes} onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))} fullWidth multiline minRows={2} disabled={saving} />
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: { xs: 2.5, md: 3 } }}>
            <Typography variant="h6" gutterBottom>Payments</Typography>
            <Divider sx={{ mb: 1.5 }} />
            {!payments || payments.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No payments recorded.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {payments.map((p) => (
                  <Box key={p._id} sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 1 }}>
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }} className="tnum">{money(p.amount, p.currency)}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.method} · {new Date(p.paidAt).toLocaleDateString()}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Save confirm */}
      <ConfirmDialog
        open={confirmSave}
        title="Save changes?"
        description="Totals and the invoice state are recalculated from the new line items and tax."
        confirmLabel="Save changes"
        loading={saving}
        onConfirm={doSave}
        onClose={() => setConfirmSave(false)}
      />

      {/* Record payment */}
      <Dialog open={payOpen} onClose={() => setPayOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Record payment for {invoice.number}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">Balance due: {money(invoice.balanceDue, invoice.currency)}</Typography>
            <TextField label="Amount" type="number" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} fullWidth disabled={recording} />
            <TextField select label="Method" value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value as PaymentMethod }))} fullWidth disabled={recording}>
              {Object.values(PaymentMethod).map((m) => (
                <MenuItem key={m} value={m}>{m}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayOpen(false)} disabled={recording}>Cancel</Button>
          <SubmitButton variant="contained" loading={recording} onClick={submitPayment} disabled={!pay.amount || Number(pay.amount) <= 0}>Record</SubmitButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function Row({ label, value, strong, danger }: { label: string; value: string; strong?: boolean; danger?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography className="tnum" sx={{ fontWeight: strong ? 700 : 500, color: danger ? 'error.main' : 'text.primary', textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}
