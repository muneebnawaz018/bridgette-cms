'use client';

import { useState, useEffect, useMemo } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { DateField } from '@/components/form/DateField';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Alert from '@mui/material/Alert';
import FileDownloadRounded from '@mui/icons-material/FileDownloadRounded';
import LibraryBooksRounded from '@mui/icons-material/LibraryBooksRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { formatDate, today, daysAgo } from '@/lib/format/date';
import { formatMoney } from '@/lib/format/money';
import { colors } from '@/lib/colors';
import type { InvoiceView } from '@/modules/invoicing/schemas';

/** How many rows the preview step shows. The file itself is never capped by this. */
const PREVIEW_ROWS = 10;

/** CSV is the only export format now (Excel/JSON were removed). */
const FORMAT = 'csv';

const STEPS = ['Filters', 'Preview'];

/** Status filter for the export — 'all' means every state. */
const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'partiallyPaid', label: 'Partially paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
] as const;

interface PreviewRow {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  grandTotal: number;
  billTo?: { name?: string };
  createdAt?: string;
}

export function ExportInvoicesModal({
  open,
  onClose,
  view,
  type,
  search,
}: {
  open: boolean;
  onClose: () => void;
  view: InvoiceView;
  type: string;
  search: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [step, setStep] = useState(0);
  const [range, setRange] = useState({ from: daysAgo(7), to: today() });
  const [status, setStatus] = useState<string>('all');
  const [downloading, setDownloading] = useState(false);

  // Every open starts clean — a stale step/range from last time is never what you want.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setRange({ from: daysAgo(7), to: today() });
    setStatus('all');
  }, [open]);

  const invalidRange = Boolean(range.from && range.to && range.from > range.to);

  // The same filters the export route will apply, so the count and preview are truthful.
  const filterParams = useMemo(() => {
    const p = new URLSearchParams({ view });
    if (type) p.set('type', type);
    if (status !== 'all') p.set('state', status);
    if (search) p.set('search', search);
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p;
  }, [view, type, status, search, range.from, range.to]);

  const countParams = new URLSearchParams(filterParams);
  countParams.set('page', '1');
  countParams.set('limit', String(PREVIEW_ROWS));

  // Only fetch once the dates matter and the range makes sense.
  const shouldFetch = open && !invalidRange;
  const { data, isLoading, isValidating } = useApi<{ items: PreviewRow[]; total: number }>(
    shouldFetch ? `/api/invoices?${countParams.toString()}` : null,
    // The step says "Counting matching invoices…" in place of the total. Throwing the
    // app-wide overlay up as well would blank the dialog every time a date is edited.
    { globalLoading: false },
  );

  // useApi keeps previous data across key changes, so on a date edit `isLoading` stays false
  // while `data` still holds the old range's count. Treat revalidation as counting too —
  // showing a stale total next to fresh dates would be a lie the user acts on.
  const counting = isLoading || isValidating;
  const total = data?.total ?? 0;
  const preview = data?.items ?? [];

  /**
   * Download the export. `all` ignores the wizard's status/date/type/search filters and pulls
   * every invoice the user is allowed to see (RBAC still scopes an accountant to their own),
   * for the current view. The filtered path uses exactly what the preview counted.
   */
  async function runExport(all = false) {
    setDownloading(true);
    try {
      const p = all ? new URLSearchParams({ view }) : new URLSearchParams(filterParams);
      p.set('format', FORMAT);
      const res = await fetch(`/api/invoices/export?${p.toString()}`);
      if (!res.ok) {
        // The route returns JSON on failure, a file on success.
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.error ?? 'The export failed');
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const name =
        res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ??
        `invoices.${FORMAT}`;

      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      const truncated = res.headers.get('X-Export-Truncated') === 'true';
      const count = res.headers.get('X-Export-Count') ?? '0';
      enqueueSnackbar(
        truncated
          ? `Exported the first ${count} of ${res.headers.get('X-Export-Total')} invoices`
          : `Exported ${count} invoice${count === '1' ? '' : 's'}`,
        { variant: truncated ? 'warning' : 'success' },
      );
      onClose();
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'The export failed', {
        variant: 'error',
      });
    } finally {
      setDownloading(false);
    }
  }

  // The filtered flow needs a settled, non-empty count behind it before advancing/exporting.
  const canProceed = !invalidRange && !counting && total > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export invoices"
      description="Filter by status and date, or export every invoice — always as a CSV."
      icon={<FileDownloadRounded />}
      maxWidth="md"
      fullScreenOnMobile
      busy={downloading}
      actions={
        <>
          <Button
            onClick={onClose}
            disabled={downloading}
            variant="outlined"
            color="inherit"
            startIcon={<CloseRounded />}
          >
            Cancel
          </Button>
          {/* Always available: one click, every invoice, no filters. */}
          <Button
            onClick={() => runExport(true)}
            disabled={downloading}
            variant="outlined"
            startIcon={<LibraryBooksRounded />}
          >
            All invoices
          </Button>
          {step > 0 && (
            <Button
              onClick={() => setStep((s) => s - 1)}
              disabled={downloading}
              variant="outlined"
              startIcon={<ArrowBackRounded />}
            >
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              variant="contained"
              disabled={!canProceed || downloading}
              onClick={() => setStep((s) => s + 1)}
              endIcon={<ArrowForwardRounded />}
            >
              Next
            </Button>
          ) : (
            <SubmitButton
              variant="contained"
              loading={downloading}
              disabled={!canProceed}
              onClick={() => runExport(false)}
              startIcon={<FileDownloadRounded />}
            >
              Export
            </SubmitButton>
          )}
        </>
      }
    >
      {/* alternativeLabel stacks each label under its circle so they fit a narrow dialog. */}
      <Stepper
        activeStep={step}
        alternativeLabel
        sx={{
          mb: 3,
          '& .MuiStepLabel-label': { fontSize: '0.78rem', mt: 0.5 },
          '& .MuiStepConnector-root': { top: 12 },
        }}
      >
        {STEPS.map((s) => (
          <Step key={s}>
            <StepLabel>{s}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 1 — status + dates, with a live count of what they match. */}
      {step === 0 && (
        <Stack spacing={2.5}>
          <TextField
            select
            label="Status"
            size="medium"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
            helperText="Limit the export to one invoice status, or export them all."
          >
            {STATUS_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <DateField
              label="Start date"
              size="medium"
              value={range.from}
              onChange={(v) => setRange((r) => ({ ...r, from: v }))}
              maxDate={range.to || undefined}
            />
            <DateField
              label="End date"
              size="medium"
              value={range.to}
              onChange={(v) => setRange((r) => ({ ...r, to: v }))}
              minDate={range.from || undefined}
            />
          </Stack>

          {invalidRange ? (
            <Alert severity="error">The start date must be on or before the end date.</Alert>
          ) : counting ? (
            <Typography variant="body2" color="text.secondary">
              Counting matching invoices…
            </Typography>
          ) : (
            <Alert severity={total > 0 ? 'success' : 'warning'}>
              {total > 0
                ? `${total} invoice${total === 1 ? '' : 's'} found between ${formatDate(range.from)} and ${formatDate(range.to)}.`
                : 'No invoices fall in this range. Widen the dates, or use “All invoices”.'}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            The filtered export keeps the filters already applied to the list, so only what you can
            see is included. “All invoices” ignores these filters and exports everything you can
            see.
          </Typography>
        </Stack>
      )}

      {/* Step 2 — preview the first rows before committing to a download. */}
      {step === 1 && (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Showing the first {Math.min(PREVIEW_ROWS, total)} of {total} invoice
            {total === 1 ? '' : 's'}. The file contains all {total}.
          </Typography>

          {/* Five columns don't fit a phone: scroll the table inside its own box rather than
              letting it push the dialog wider than the screen. */}
          <Box
            sx={{
              maxHeight: 320,
              overflowY: 'auto',
              overflowX: 'auto',
              border: `1px solid ${colors.surface.border}`,
              borderRadius: '12px',
            }}
          >
            <Table size="small" stickyHeader sx={{ minWidth: 460 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Number</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>State</TableCell>
                  <TableCell sx={{ fontWeight: 700 }} align="right">
                    Total
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.map((r) => (
                  <TableRow key={r._id} hover>
                    <TableCell
                      sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}
                    >
                      {r.number}
                    </TableCell>
                    <TableCell>{r.billTo?.name ?? 'No customer'}</TableCell>
                    <TableCell>
                      <StatusChip label={r.state} tone={invoiceStateTone[r.state] ?? 'neutral'} />
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatMoney(r.currency, Number(r.grandTotal ?? 0))}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>

          <Typography variant="body2" color="text.secondary">
            Downloading as CSV.
          </Typography>
        </Stack>
      )}
    </Modal>
  );
}
