'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SaveAsRounded from '@mui/icons-material/SaveAsRounded';
import ReceiptLongRounded from '@mui/icons-material/ReceiptLongRounded';
import { useSnackbar } from 'notistack';
import { Permission } from '@/modules/auth/rbac';
import { InvoiceType, TAX_POLICY, DEFAULT_CURRENCY } from '@/modules/invoicing/enums';
import { calcInvoice } from '@/modules/invoicing/calc';
import { invoiceFormSchema } from '@/modules/invoicing/schemas';
import { useCan } from '@/components/auth/SessionProvider';
import { NoAccess } from '@/components/ui/NoAccess';
import { apiPost } from '@/lib/api/client';
import { formatMoney } from '@/lib/format/money';
import { REMINDER_PRESETS } from '@/modules/invoicing/reminders';
import { AppLink } from '@/components/ui/AppLink';
import { DateField } from '@/components/form/DateField';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';

/*
 * New invoice, as a full page.
 *
 * It shares the two-column card layout of the edit page (`[id]/page.tsx`) on purpose — the two
 * screens are the same document at different points in its life, so they should read the same.
 * State is plain useState rather than the ref/memo dance the old dialog used: a page has no
 * backdrop or transition to keep still, so a keystroke re-rendering it costs nothing worth
 * optimising away.
 */

const TYPE_OPTIONS = [
  { value: InvoiceType.Tax, label: 'US Tax (taxed)' },
  { value: InvoiceType.Cash, label: 'US Cash (no tax)' },
  { value: InvoiceType.PK, label: 'Pakistan (PKR)' },
];

interface DraftItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface DraftForm {
  type: InvoiceType;
  billName: string;
  billEmail: string;
  items: DraftItem[];
  applyTax: boolean;
  taxPercent: number;
  notes: string;
  issueDate: string;
  dueDate: string;
  /** Minutes as a string, or '' for no reminder — matches the select's value type. */
  reminder: string;
}

/** Today as the browser sees it, in the YYYY-MM-DD shape <input type="date"> expects. */
const todayISODate = () => new Date().toISOString().slice(0, 10);

const blankItem = (): DraftItem => ({ description: '', quantity: 1, unitPrice: 0 });

const EMPTY: DraftForm = {
  type: InvoiceType.Tax,
  billName: '',
  billEmail: '',
  items: [blankItem()],
  applyTax: false,
  taxPercent: 8.75,
  notes: '',
  issueDate: '',
  dueDate: '',
  reminder: '',
};

const money = (n: number, cur: string) => formatMoney(cur, Number(n ?? 0));

export default function NewInvoicePage() {
  const router = useRouter();
  const { enqueueSnackbar } = useSnackbar();
  const canCreate = useCan(Permission.InvoiceCreate);

  const [form, setForm] = useState<DraftForm>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // Default the invoice date to today, after mount rather than in the initial state, so the
  // server-rendered HTML and the first client render agree (a date computed during SSR could
  // differ from the client's across a midnight boundary and trip a hydration warning).
  useEffect(() => {
    setForm((f) => (f.issueDate ? f : { ...f, issueDate: todayISODate() }));
  }, []);

  // A reminder fires after the due date, so one without a due date can never run. Surface that
  // as an inline error rather than silently accepting a reminder that will not arrive.
  const dueDateMissing = Boolean(form.reminder) && !form.dueDate;

  const policy = TAX_POLICY[form.type];
  const currency = DEFAULT_CURRENCY[form.type];
  const taxable = policy === 'always' || (policy === 'optional' && form.applyTax);

  const preview = useMemo(
    () =>
      calcInvoice({
        type: form.type,
        items: form.items.map((it) => ({
          quantity: Number(it.quantity) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          taxable: true,
          discount: 0,
        })),
        taxRate: Number(form.taxPercent) / 100,
        applyTax: form.applyTax,
      }),
    [form.type, form.items, form.taxPercent, form.applyTax],
  );

  const setLine = (i: number, patch: Partial<DraftItem>) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
    }));

  // A draft may be incomplete — it just needs a customer name (and a due date if a reminder is
  // set). A live invoice may not: every line must be filled in and the total must be positive,
  // otherwise "Create invoice" would issue a numbered document with blank lines or a zero total.
  const nameFilled = Boolean(form.billName.trim());
  const itemsValid =
    form.items.length > 0 &&
    form.items.every(
      (it) => it.description.trim() !== '' && Number(it.quantity) > 0 && Number(it.unitPrice) >= 0,
    );
  const canDraft = nameFilled && !dueDateMissing;
  const canFinalizeNew = nameFilled && itemsValid && preview.grandTotal > 0 && !dueDateMissing;

  // Tax line names its rate: "Tax (8.75%)". Trailing zeros trimmed.
  const taxRowLabel =
    taxable && Number(form.taxPercent) > 0
      ? `Tax (${Number(Number(form.taxPercent).toFixed(2))}%)`
      : 'Tax';

  async function submit(asDraft: boolean) {
    // Validate against the same schema the create dialog used, so the two entry points cannot
    // disagree about what a valid invoice is.
    const parsed = invoiceFormSchema.safeParse({
      type: form.type,
      billToName: form.billName.trim(),
      billToEmail: form.billEmail.trim(),
      items: form.items.map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })),
      taxRate: taxable ? Number(form.taxPercent) : undefined,
      notes: form.notes.trim() || undefined,
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      enqueueSnackbar('Please fix the highlighted fields', { variant: 'warning' });
      return;
    }
    setErrors({});
    setSaving(true);

    const res = await apiPost<{ _id: string }>('/api/invoices', {
      type: form.type,
      billTo: { name: form.billName, email: form.billEmail || undefined },
      items: form.items.map((it) => ({
        description: it.description,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })),
      taxRate: taxable ? Number(form.taxPercent) / 100 : undefined,
      applyTax: policy === 'optional' ? form.applyTax : undefined,
      notes: form.notes || undefined,
      issueDate: form.issueDate ? new Date(form.issueDate).toISOString() : undefined,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      reminderThresholdMinutes: form.reminder ? Number(form.reminder) : undefined,
      asDraft,
    });

    setSaving(false);
    if (!res.ok) {
      setErrors(serverFieldErrors(res.details));
      enqueueSnackbar(res.error ?? 'Failed to create invoice', { variant: 'error' });
      return;
    }
    enqueueSnackbar(asDraft ? 'Draft saved' : 'Invoice created', { variant: 'success' });
    // Land on the new invoice's own page — the same layout, now in view mode.
    // replace, not push: drop /invoices/new from history so Back from the new invoice returns
    // to the invoices table, not to an empty create form.
    if (res.data?._id) router.replace(`/invoices/${res.data._id}`);
    else router.replace('/invoices');
  }

  if (!canCreate) return <NoAccess message="You do not have permission to create invoices." />;

  return (
    <Box className="rise-in">
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2.5 }}>
        <IconButton
          onClick={() => router.push('/invoices')}
          aria-label="Back to invoices"
          sx={{ mr: 0.5 }}
        >
          <ArrowBackRounded />
        </IconButton>
        <Box sx={{ flexGrow: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            New invoice
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{ mt: 0.75 }}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Chip size="small" label={form.type.toUpperCase()} variant="outlined" />
            <Typography variant="body2" color="text.secondary">
              {currency}
            </Typography>
          </Stack>
        </Box>
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
          <Button
            variant="outlined"
            onClick={() => submit(true)}
            disabled={saving || !canDraft}
            startIcon={<SaveAsRounded />}
          >
            Save as draft
          </Button>
          <Button
            variant="contained"
            onClick={() => submit(false)}
            disabled={saving || !canFinalizeNew}
            startIcon={<ReceiptLongRounded />}
          >
            Create invoice
          </Button>
        </Stack>
      </Box>

      {/* Flat grid so paired cards share a row and stretch to equal height: Line items ↔ Bill
          to on the first row, Totals ↔ Details on the second. Each Paper fills its cell with
          height:100%. */}
      <Grid container spacing={2.5} alignItems="stretch">
        {/* Row 1 left — line items only; tax moved to Totals, where it belongs with the sum. */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Line items
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={1.5}>
              {form.items.map((line, i) => (
                <Grid container spacing={1} key={i} alignItems="center">
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Description"
                      size="small"
                      value={line.description}
                      onChange={(e) => setLine(i, { description: e.target.value })}
                      error={Boolean(errors[`items.${i}.description`])}
                      helperText={errors[`items.${i}.description`]}
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
                        setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
                      }
                    >
                      <DeleteOutlineRounded fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}
              {errors.items && (
                <Typography variant="caption" color="error">
                  {errors.items}
                </Typography>
              )}
              <Box>
                <Button
                  size="small"
                  startIcon={<AddRounded />}
                  disabled={saving}
                  onClick={() => setForm((f) => ({ ...f, items: [...f.items, blankItem()] }))}
                >
                  Add line
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Grid>

        {/* Row 1 right — customer + type together: both identify who and what this invoice is. */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Bill to
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={2}>
              <TextField
                select
                label="Invoice type"
                size="small"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as InvoiceType }))}
                fullWidth
                disabled={saving}
                helperText="Sets the numbering series, currency and tax rules. Cannot be changed later."
              >
                {TYPE_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Name"
                size="small"
                value={form.billName}
                onChange={(e) => setForm((f) => ({ ...f, billName: e.target.value }))}
                error={Boolean(errors.billToName)}
                helperText={errors.billToName}
                fullWidth
                required
                disabled={saving}
              />
              <TextField
                label="Email"
                size="small"
                value={form.billEmail}
                onChange={(e) => setForm((f) => ({ ...f, billEmail: e.target.value }))}
                error={Boolean(errors.billToEmail)}
                helperText={errors.billToEmail}
                fullWidth
                disabled={saving}
              />
            </Stack>
          </Paper>
        </Grid>

        {/* Row 2 left — totals, now including the tax controls that drive the tax line. */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: { xs: 2.5, md: 2.75 }, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Totals
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Stack spacing={2}>
              {(policy === 'optional' || taxable) && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  {policy === 'optional' && (
                    <TextField
                      select
                      size="small"
                      label="Apply tax"
                      value={form.applyTax ? 'yes' : 'no'}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, applyTax: e.target.value === 'yes' }))
                      }
                      sx={{ width: { xs: '100%', sm: 180 } }}
                      disabled={saving}
                    >
                      <MenuItem value="no">No</MenuItem>
                      <MenuItem value="yes">Yes</MenuItem>
                    </TextField>
                  )}
                  {taxable && (
                    <TextField
                      size="small"
                      label="Tax rate %"
                      type="number"
                      value={form.taxPercent}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, taxPercent: Number(e.target.value) }))
                      }
                      error={Boolean(errors.taxRate)}
                      helperText={errors.taxRate}
                      sx={{ width: { xs: '100%', sm: 180 } }}
                      disabled={saving}
                    />
                  )}
                </Stack>
              )}
              <Stack spacing={1}>
                <Row label="Subtotal" value={money(preview.subtotal, currency)} />
                <Row label={taxRowLabel} value={money(preview.taxAmount, currency)} />
                <Divider />
                <Row label="Grand total" value={money(preview.grandTotal, currency)} strong />
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
            <Stack spacing={2}>
              <DateField
                label="Invoice date"
                value={form.issueDate}
                onChange={(v) => setForm((f) => ({ ...f, issueDate: v }))}
                disabled={saving}
              />
              <DateField
                label="Due date"
                value={form.dueDate}
                onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
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
                onChange={(e) => setForm((f) => ({ ...f, reminder: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                fullWidth
                multiline
                minRows={4}
                disabled={saving}
              />
              {/* Terms are the company-wide policy, not a per-invoice free-text field — the
                  link is all this needs. */}
              <Box sx={{ pt: 0.5 }}>
                <AppLink href="/billing-terms" style={{ fontWeight: 600 }}>
                  View billing terms &amp; policies →
                </AppLink>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography className="tnum" sx={{ fontWeight: strong ? 700 : 500, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  );
}
