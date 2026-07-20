'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
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
import TableChartRounded from '@mui/icons-material/TableChartRounded';
import GridOnRounded from '@mui/icons-material/GridOnRounded';
import DataObjectRounded from '@mui/icons-material/DataObjectRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';
import { formatDate, today, daysAgo } from '@/lib/format/date';
import { formatMoney } from '@/lib/format/money';
import { colors, redA } from '@/lib/colors';
import type { InvoiceView, ExportFormat } from '@/modules/invoicing/schemas';

/** How many rows the preview step shows. The file itself is never capped by this. */
const PREVIEW_ROWS = 10;

const FORMATS: { value: ExportFormat; label: string; blurb: string; icon: ReactNode }[] = [
  { value: 'csv', label: 'CSV', blurb: 'Opens anywhere. Best for import.', icon: <TableChartRounded /> },
  { value: 'xlsx', label: 'Excel', blurb: 'Formatted .xlsx workbook.', icon: <GridOnRounded /> },
  { value: 'json', label: 'JSON', blurb: 'Structured, for developers.', icon: <DataObjectRounded /> },
];

const STEPS = ['Format', 'Dates', 'Preview'];

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
  const [format, setFormat] = useState<ExportFormat | null>(null);
  const [step, setStep] = useState(0);
  const [range, setRange] = useState({ from: daysAgo(7), to: today() });
  const [downloading, setDownloading] = useState(false);

  // Every open starts clean — a stale format/step from last time is never what you want.
  useEffect(() => {
    if (!open) return;
    setFormat(null);
    setStep(0);
    setRange({ from: daysAgo(7), to: today() });
  }, [open]);

  const invalidRange = Boolean(range.from && range.to && range.from > range.to);

  // The same filters the export route will apply, so the count and preview are truthful.
  const filterParams = useMemo(() => {
    const p = new URLSearchParams({ view });
    if (type) p.set('type', type);
    if (search) p.set('search', search);
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p;
  }, [view, type, search, range.from, range.to]);

  const countParams = new URLSearchParams(filterParams);
  countParams.set('page', '1');
  countParams.set('limit', String(PREVIEW_ROWS));

  // Only fetch once the dates matter (step 2+) and the range makes sense.
  const shouldFetch = open && step >= 1 && !invalidRange;
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

  async function runExport() {
    if (!format) return;
    setDownloading(true);
    try {
      const p = new URLSearchParams(filterParams);
      p.set('format', format);
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
        `invoices.${format}`;

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
      enqueueSnackbar(err instanceof Error ? err.message : 'The export failed', { variant: 'error' });
    } finally {
      setDownloading(false);
    }
  }

  // Step 1 unlocks on a format; step 2 needs a settled, non-empty count behind it.
  const canGoNext = step === 0 ? Boolean(format) : !invalidRange && !counting && total > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export invoices"
      description="Pick a format and date range, then review."
      icon={<FileDownloadRounded />}
      maxWidth="md"
      busy={downloading}
      actions={
        <>
          <Button onClick={onClose} disabled={downloading} variant="outlined" color="inherit" startIcon={<CloseRounded />}>
            Cancel
          </Button>
          {step > 0 && (
            <Button onClick={() => setStep((s) => s - 1)} disabled={downloading} variant="outlined" startIcon={<ArrowBackRounded />}>
              Back
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            // endIcon, not start: the arrow trails the label because it points at where the
            // step is going, which is the one place in these dialogs that reads better after.
            <Button variant="contained" disabled={!canGoNext} onClick={() => setStep((s) => s + 1)} endIcon={<ArrowForwardRounded />}>
              Next
            </Button>
          ) : (
            <SubmitButton
              variant="contained"
              loading={downloading}
              disabled={total === 0 || invalidRange}
              onClick={runExport}
              startIcon={<FileDownloadRounded />}
            >
              Export
            </SubmitButton>
          )}
        </>
      }
    >
      {/* alternativeLabel stacks each label under its circle. Side-by-side labels need about
          280px and overflowed the dialog on a 320px screen, scrollbar and all. */}
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

      {/* Step 1 — format. Nothing downstream unlocks until one is chosen. */}
      {step === 0 && (
        <Stack spacing={1.5}>
          {FORMATS.map((f) => {
            const selected = format === f.value;
            return (
              <Box
                key={f.value}
                role="radio"
                tabIndex={0}
                aria-checked={selected}
                onClick={() => setFormat(f.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFormat(f.value);
                  }
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  cursor: 'pointer',
                  borderRadius: '12px',
                  border: `1px solid ${selected ? 'transparent' : colors.surface.border}`,
                  bgcolor: selected ? redA(0.08) : 'transparent',
                  outline: selected ? `2px solid ${redA(0.5)}` : 'none',
                  outlineOffset: -1,
                  transition: 'background-color .16s ease, outline-color .16s ease',
                  '&:hover': { bgcolor: selected ? redA(0.12) : 'action.hover' },
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: '10px',
                    flexShrink: 0,
                    color: selected ? 'primary.main' : 'text.secondary',
                    bgcolor: 'action.hover',
                  }}
                >
                  {f.icon}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700 }}>{f.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {f.blurb}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Step 2 — dates, with a live count of what they match. */}
      {step === 1 && (
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Start date"
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: range.to || undefined }}
              fullWidth
            />
            <TextField
              label="End date"
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: range.from || undefined }}
              fullWidth
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
                : 'No invoices fall in this range. Widen the dates to continue.'}
            </Alert>
          )}

          <Typography variant="body2" color="text.secondary">
            The export also keeps the filters already applied to the list, so only what you can
            see is included.
          </Typography>
        </Stack>
      )}

      {/* Step 3 — preview the first rows before committing to a download. */}
      {step === 2 && (
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
                    <TableCell sx={{ fontWeight: 700, color: 'primary.main', whiteSpace: 'nowrap' }}>
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
            Downloading as {FORMATS.find((f) => f.value === format)?.label}.
          </Typography>
        </Stack>
      )}
    </Modal>
  );
}
