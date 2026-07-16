'use client';

import Link from 'next/link';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import { Modal } from '@/components/ui/Modal';
import { StatusChip, invoiceStateTone } from '@/components/ui/StatusChip';
import { useApi } from '@/lib/api/useApi';

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
  lineTotal?: number;
}
interface Invoice {
  _id: string;
  number: string;
  type: string;
  state: string;
  currency: string;
  billTo: Party;
  items: Item[];
  subtotal: number;
  taxAmount: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  dueDate?: string;
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
  paidAt: string;
}

const money = (n: number, cur: string) =>
  `${cur} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.4 }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" className="tnum" sx={{ fontWeight: strong ? 800 : 600 }}>{value}</Typography>
    </Box>
  );
}

export function InvoiceDetailsModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  // keepPreviousData:false so opening a different invoice never flashes the last one's data
  // (and a failed fetch shows the error state instead of stale data).
  const { data: invoice, isLoading } = useApi<Invoice>(id ? `/api/invoices/${id}` : null, { keepPreviousData: false });
  const { data: payments } = useApi<Payment[]>(id ? `/api/invoices/${id}/payments` : null, { keepPreviousData: false });

  const cur = invoice?.currency ?? '';

  return (
    <Modal
      open={Boolean(id)}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.number}` : 'Invoice'}
      description={invoice ? `${invoice.type.toUpperCase()} · ${invoice.currency}` : undefined}
      maxWidth="md"
      actions={
        <>
          <Button onClick={onClose} color="inherit">Close</Button>
          {invoice && (
            <Button component={Link} href={`/invoices/${invoice._id}`} variant="contained" startIcon={<OpenInNewRounded />}>
              Open full invoice
            </Button>
          )}
        </>
      }
    >
      {isLoading && !invoice ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 5 }}>
          <CircularProgress size={26} />
        </Box>
      ) : !invoice ? (
        <Typography color="error">Could not load this invoice.</Typography>
      ) : (
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <StatusChip label={invoice.state} tone={invoiceStateTone[invoice.state] ?? 'neutral'} />
            {invoice.isDeleted && <Chip size="small" color="error" variant="outlined" label="Deleted" />}
            {invoice.isArchived && !invoice.isDeleted && <Chip size="small" color="warning" variant="outlined" label="Archived" />}
          </Box>

          {invoice.isDeleted && <Alert severity="error">Deleted. Reason: {invoice.deleteReason || 'none given'}</Alert>}
          {invoice.isArchived && !invoice.isDeleted && <Alert severity="warning">Archived. Reason: {invoice.archiveReason || 'none given'}</Alert>}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="overline" color="text.secondary">Bill to</Typography>
              <Typography sx={{ fontWeight: 700 }}>{invoice.billTo?.name || 'No customer'}</Typography>
              {invoice.billTo?.email && <Typography variant="body2" color="text.secondary">{invoice.billTo.email}</Typography>}
              {invoice.billTo?.phone && <Typography variant="body2" color="text.secondary">{invoice.billTo.phone}</Typography>}
              {invoice.billTo?.address && <Typography variant="body2" color="text.secondary">{invoice.billTo.address}</Typography>}
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="overline" color="text.secondary">Due date</Typography>
              <Typography sx={{ fontWeight: 600 }}>
                {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'Not set'}
              </Typography>
            </Grid>
          </Grid>

          <Box>
            <Typography variant="overline" color="text.secondary">Line items</Typography>
            <Divider sx={{ mb: 0.5 }} />
            <Stack divider={<Divider flexItem />}>
              {invoice.items.map((it, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 2, py: 0.75 }}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.description}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {it.quantity} × {money(it.unitPrice, cur)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" className="tnum" sx={{ fontWeight: 700 }}>
                    {money(it.lineTotal ?? it.quantity * it.unitPrice, cur)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>

          <Box sx={{ maxWidth: 320, ml: 'auto', width: '100%' }}>
            <Row label="Subtotal" value={money(invoice.subtotal, cur)} />
            <Row label="Tax" value={money(invoice.taxAmount, cur)} />
            <Divider sx={{ my: 0.5 }} />
            <Row label="Total" value={money(invoice.grandTotal, cur)} strong />
            <Row label="Paid" value={money(invoice.amountPaid, cur)} />
            <Row label="Balance due" value={money(invoice.balanceDue, cur)} strong />
          </Box>

          {payments && payments.length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary">Payments</Typography>
              <Divider sx={{ mb: 0.5 }} />
              <Stack divider={<Divider flexItem />}>
                {payments.map((p) => (
                  <Box key={p._id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6 }}>
                    <Typography variant="body2" color="text.secondary">
                      {new Date(p.paidAt).toLocaleDateString()} · {p.method}
                    </Typography>
                    <Typography variant="body2" className="tnum" sx={{ fontWeight: 600 }}>{money(p.amount, p.currency)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  );
}
