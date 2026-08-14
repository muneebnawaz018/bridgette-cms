'use client';

import { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import InboxRounded from '@mui/icons-material/InboxRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { useApi } from '@/lib/api/useApi';
import { apiPost } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';
import { formatAddress, type AddressParts } from '@/modules/customers/address';
import { colors } from '@/lib/colors';

/*
 * Field-by-field review of what a customer sent through their intake link.
 *
 * Every row is opt-in: staff tick what they accept, and the request names only those fields. The
 * service filters that list against its own allowlist regardless, so this UI is a convenience,
 * not the boundary.
 *
 * Only customer-writable fields appear here at all. Products, negotiated rates, invoice type and
 * internal notes are absent by construction — there is no row to tick, and no field name this
 * screen could send that would reach them.
 */

interface IntakeAddress extends AddressParts {
  country?: 'US' | 'PK';
}

interface Intake {
  _id: string;
  status: 'pending' | 'approved' | 'rejected';
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  addressParts?: IntakeAddress | null;
  shipping?: {
    sameAsBilling?: boolean;
    name?: string;
    phone?: string;
    address?: string;
    addressParts?: IntakeAddress | null;
  } | null;
  customerNote?: string;
  resellerCertificate?: { name?: string; contentType?: string; size?: number } | null;
  setReseller?: boolean;
  appliedFields?: string[];
  createdAt: string;
  reviewedAt?: string;
}

interface CurrentCustomer {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: string;
  shipping?: { sameAsBilling?: boolean; name?: string; address?: string } | null;
}

/** The rows staff can act on, in the order they read on the customer record. */
const ROWS = [
  { field: 'name', label: 'Full name' },
  { field: 'firstName', label: 'First name' },
  { field: 'lastName', label: 'Last name' },
  { field: 'email', label: 'Email' },
  { field: 'phone', label: 'Phone' },
  { field: 'addressParts', label: 'Billing address' },
  { field: 'shipping', label: 'Shipping address' },
] as const;

function describeShipping(s?: Intake['shipping']): string {
  if (!s) return '';
  if (s.sameAsBilling) return 'Same as billing';
  const parts = [s.name, s.address || (s.addressParts ? formatAddress(s.addressParts) : '')];
  return parts.filter(Boolean).join(' · ');
}

/** The submitted value for a row, rendered as the one line staff compare against. */
function submittedValue(intake: Intake, field: string): string {
  switch (field) {
    case 'addressParts':
      return intake.address || (intake.addressParts ? formatAddress(intake.addressParts) : '');
    case 'shipping':
      return describeShipping(intake.shipping);
    default:
      return String(intake[field as keyof Intake] ?? '');
  }
}

function currentValue(customer: CurrentCustomer | null, field: string): string {
  if (!customer) return '';
  switch (field) {
    case 'addressParts':
      return customer.address ?? '';
    case 'shipping':
      return describeShipping(customer.shipping as Intake['shipping']);
    default:
      return String(customer[field as keyof CurrentCustomer] ?? '');
  }
}

export function IntakeReviewDialog({
  open,
  customer,
  onClose,
  onApplied,
}: {
  open: boolean;
  customer: CurrentCustomer | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { data, isLoading, mutate } = useApi<{ items: Intake[] }>(
    open && customer ? `/api/customers/${customer._id}/intakes` : null,
    { globalLoading: false },
  );

  const intake = useMemo(
    () => data?.items.find((i) => i.status === 'pending') ?? null,
    [data?.items],
  );

  // Rows that actually carry a value and differ from what is on file. A submission that only
  // confirms the existing details should not present seven identical rows to tick.
  const changed = useMemo(() => {
    if (!intake) return [];
    return ROWS.filter(({ field }) => {
      const next = submittedValue(intake, field);
      return next !== '' && next !== currentValue(customer, field);
    });
  }, [intake, customer]);

  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Everything that changed starts ticked: the common case is accepting the lot, and staff
  // untick the exception rather than hunting for what to tick.
  useEffect(() => {
    setAccepted(Object.fromEntries(changed.map((r) => [r.field, true])));
  }, [changed]);

  async function review(decision: 'approved' | 'rejected') {
    if (!intake) return;
    setSaving(true);
    const fields = changed.filter((r) => accepted[r.field]).map((r) => r.field);
    const res = await apiPost(`/api/customers/intakes/${intake._id}`, { fields, decision });
    setSaving(false);

    if (!res.ok) {
      enqueueSnackbar(res.error ?? 'Could not apply the submission', { variant: 'error' });
      return;
    }
    enqueueSnackbar(
      decision === 'rejected'
        ? 'Submission dismissed'
        : `Applied ${fields.length} ${fields.length === 1 ? 'field' : 'fields'}`,
      { variant: 'success' },
    );
    void mutate();
    onApplied();
    onClose();
  }

  const nothingPending = !isLoading && !intake;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customer submission"
      description={customer ? `What ${customer.name} sent through their link.` : undefined}
      icon={<InboxRounded />}
      maxWidth="md"
      busy={saving}
      actions={
        intake ? (
          <>
            <Button
              variant="outlined"
              color="inherit"
              onClick={() => void review('rejected')}
              disabled={saving}
              startIcon={<BlockRounded />}
            >
              Dismiss
            </Button>
            <Button
              variant="contained"
              onClick={() => void review('approved')}
              disabled={saving}
              startIcon={<CheckRounded />}
            >
              Apply selected
            </Button>
          </>
        ) : (
          <Button variant="outlined" color="inherit" onClick={onClose} startIcon={<CloseRounded />}>
            Close
          </Button>
        )
      }
    >
      {isLoading && <Typography color="text.secondary">Loading…</Typography>}

      {nothingPending && (
        <Typography color="text.secondary">
          Nothing waiting for review. Anything this customer submits will appear here.
        </Typography>
      )}

      {intake && (
        <Stack spacing={2}>
          <Typography variant="caption" color="text.secondary">
            Submitted {formatDateTime(intake.createdAt)}
          </Typography>

          {intake.setReseller && (
            <Alert severity="info">
              They attached a resale certificate, so this customer is already tax-exempt. That part
              is applied, not pending. Open the certificate from the customer form to check it, and
              turn the exemption off there if it does not hold up.
            </Alert>
          )}

          {changed.length === 0 ? (
            <Typography color="text.secondary">
              Everything they sent matches what is already on file. Nothing to apply.
            </Typography>
          ) : (
            <Box>
              {changed.map(({ field, label }) => (
                <Box key={field}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, py: 1.25 }}>
                    <Checkbox
                      checked={Boolean(accepted[field])}
                      onChange={(e) => setAccepted((a) => ({ ...a, [field]: e.target.checked }))}
                      sx={{ mt: -0.5 }}
                    />
                    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                      <Typography sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                        {submittedValue(intake, field)}
                      </Typography>
                      {currentValue(customer, field) && (
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ textDecoration: 'line-through', wordBreak: 'break-word' }}
                        >
                          {currentValue(customer, field)}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                  <Divider />
                </Box>
              ))}
            </Box>
          )}

          {intake.customerNote && (
            <Box sx={{ bgcolor: colors.surface.subtle, borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                What they are looking for
              </Typography>
              {/* Their message, not a field: it never merges into the internal notes, and there
                  is nothing to tick because nothing about it is copied anywhere. */}
              <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>
                {intake.customerNote}
              </Typography>
              <Chip
                size="small"
                label="Not applied to the record"
                sx={{ mt: 1, fontWeight: 600 }}
                variant="outlined"
              />
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  );
}
