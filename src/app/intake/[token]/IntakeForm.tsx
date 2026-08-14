'use client';

import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import { useSnackbar } from 'notistack';
import { BrandLockup } from '@/components/layout/BrandLockup';
import { FormSection, TextInput, SelectInput } from '@/components/form/fields';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { statesFor } from '@/modules/customers/address';
import { customerIntakeSubmitSchema } from '@/modules/customers/intake.schemas';
import { apiPost } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';
import { colors, gradients } from '@/lib/colors';
import { COMPANY_CONTACT_US } from '@/modules/legal/company';

/*
 * The customer-facing intake form. No session, no account, no app chrome — the person filling
 * this in is a customer, not a user of the portal, and everything here is written for someone
 * who has never seen it before.
 *
 * Validated with the same Zod schema the API parses, so a field that will be rejected says so
 * before the round trip rather than after it. Values live in a ref, matching the admin dialogs:
 * typing re-renders only the input being typed in.
 */

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' },
];

const STATE_OPTIONS: Record<'US' | 'PK', { value: string; label: string }[]> = {
  US: statesFor('US').map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  PK: statesFor('PK').map((s) => ({ value: s.code, label: s.name })),
};

/** Mirrors the server's allowlist. The server re-checks the bytes; this only saves a round trip. */
const CERT_ACCEPT =
  'image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const CERT_ACCEPT_TYPES =
  /^(image\/|application\/pdf$|application\/msword$|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$)/;
/** 4MB raw. Base64 inflates by a third, keeping the encoded body inside the route's ceiling. */
const CERT_MAX_BYTES = 4 * 1024 * 1024;

interface Certificate {
  data: string;
  name: string;
  contentType: string;
  size: number;
}

type Country = 'US' | 'PK';

interface Values {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  zipPlus4: string;
  shipName: string;
  shipPhone: string;
  shipLine1: string;
  shipLine2: string;
  shipCity: string;
  shipState: string;
  shipZip: string;
  shipZipPlus4: string;
  customerNote: string;
}

const EMPTY: Values = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  zipPlus4: '',
  shipName: '',
  shipPhone: '',
  shipLine1: '',
  shipLine2: '',
  shipCity: '',
  shipState: '',
  shipZip: '',
  shipZipPlus4: '',
  customerNote: '',
};

/** Shape the flat form values into the payload the API schema expects. */
function toPayload(
  v: Values,
  country: Country,
  shipCountry: Country,
  shipSame: boolean,
  certificate: Certificate | null,
) {
  return {
    firstName: v.firstName || undefined,
    lastName: v.lastName || undefined,
    email: v.email,
    phone: v.phone || undefined,
    addressParts: {
      country,
      line1: v.line1,
      line2: v.line2 || undefined,
      city: v.city || undefined,
      state: v.state || undefined,
      zip: v.zip || undefined,
      zipPlus4: country === 'US' ? v.zipPlus4 || undefined : undefined,
    },
    shipping: shipSame
      ? { sameAsBilling: true }
      : {
          sameAsBilling: false,
          name: v.shipName || undefined,
          phone: v.shipPhone || undefined,
          addressParts: {
            country: shipCountry,
            line1: v.shipLine1,
            line2: v.shipLine2 || undefined,
            city: v.shipCity || undefined,
            state: v.shipState || undefined,
            zip: v.shipZip || undefined,
            zipPlus4: shipCountry === 'US' ? v.shipZipPlus4 || undefined : undefined,
          },
        },
    customerNote: v.customerNote || undefined,
    resellerCertificate: certificate ?? undefined,
  };
}

/**
 * Map the schema's nested error paths onto the flat input names this form uses.
 *
 * Taking the last segment would be simpler and wrong: `shipping.addressParts.city` and
 * `addressParts.city` both end in "city", so a shipping error would light up the billing input
 * and leave the field that is actually wrong looking fine.
 */
function toInputNames(errors: FieldErrors): FieldErrors {
  const mapped: FieldErrors = {};
  for (const [path, message] of Object.entries(errors)) {
    if (path.startsWith('shipping.addressParts.')) {
      const leaf = path.split('.').pop() ?? '';
      mapped[`ship${leaf.charAt(0).toUpperCase()}${leaf.slice(1)}`] = message;
    } else if (path.startsWith('shipping.')) {
      const leaf = path.slice('shipping.'.length);
      mapped[`ship${leaf.charAt(0).toUpperCase()}${leaf.slice(1)}`] = message;
    } else if (path.startsWith('addressParts.')) {
      mapped[path.slice('addressParts.'.length)] = message;
    }
  }
  return mapped;
}

export function IntakeForm({ token, customerName }: { token: string; customerName: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const valuesRef = useRef<Values>({ ...EMPTY });

  const [country, setCountry] = useState<Country>('US');
  const [shipCountry, setShipCountry] = useState<Country>('US');
  /*
   * The two state pickers are the only inputs held in React state rather than the ref. A picked
   * value has to render, and SelectInput is controlled by its parent — reading it back out of the
   * ref would leave the dropdown showing the placeholder after a pick, because nothing re-renders.
   */
  const [state, setState] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipSame, setShipSame] = useState(true);
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [certError, setCertError] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // (name, value) rather than the raw event: TextInput owns its own value and reports the two
  // things the form needs, which is what keeps a keystroke from re-rendering the whole page.
  const setText = useCallback((name: string, value: string) => {
    valuesRef.current[name as keyof Values] = value;
  }, []);

  const blurField = useCallback((name: string) => {
    setTouched((t) => ({ ...t, [name]: true }));
  }, []);

  /** An error is shown once its field has been visited, or once submit has been attempted. */
  const shown = (name: string) => (submitted || touched[name] ? errors[name] : undefined);

  const pickCertificate = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after an error
    if (!file) return;

    if (!CERT_ACCEPT_TYPES.test(file.type)) {
      setCertError('Attach an image, a PDF or a Word document');
      return;
    }
    if (file.size > CERT_MAX_BYTES) {
      setCertError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is 4MB`);
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file'));
        reader.readAsDataURL(file);
      });
      setCertificate({ data, name: file.name, contentType: file.type, size: file.size });
      setCertError('');
    } catch {
      setCertError('Could not read that file');
    }
  }, []);

  async function submit() {
    setSubmitted(true);
    const payload = toPayload(
      { ...valuesRef.current, state, shipState },
      country,
      shipCountry,
      shipSame,
      certificate,
    );

    const parsed = customerIntakeSubmitSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = toFieldErrors(parsed.error);
      setErrors({ ...fieldErrors, ...toInputNames(fieldErrors) });
      enqueueSnackbar('Check the highlighted fields', { variant: 'warning' });
      return;
    }

    setSaving(true);
    const res = await apiPost(`/api/intake/${token}`, parsed.data);
    setSaving(false);

    if (res.ok) {
      setDone(true);
      return;
    }
    const serverErrors = serverFieldErrors(res.details);
    if (Object.keys(serverErrors).length > 0) setErrors(serverErrors);
    enqueueSnackbar(res.error ?? 'Could not send your details', { variant: 'error' });
  }

  if (done) {
    return (
      <Paper sx={{ overflow: 'hidden' }}>
        {/* A brand bar rather than a green tick alone: this is the last screen the customer sees,
            and it should look like it came from us. */}
        <Box sx={{ background: gradients.brand, height: 6 }} />
        <Box sx={{ p: { xs: 4, sm: 6 }, textAlign: 'center' }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              mx: 'auto',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: colors.status.successBg,
            }}
          >
            <CheckCircleRounded sx={{ fontSize: 42, color: colors.status.success }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, mt: 2.5 }}>
            {customerName ? `Thank you, ${customerName}` : 'Thank you'}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 440, mx: 'auto' }}>
            We have your details. They will be used on your next invoice, and there is nothing else
            for you to do.
          </Typography>
          <Divider sx={{ my: 4 }} />
          <Typography variant="caption" color="text.secondary">
            You can close this page. Questions? {COMPANY_CONTACT_US.email}
          </Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <>
      <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5 }}>
        {customerName ? `Hello ${customerName}` : 'Your details'}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2.5 }}>
        Fill in your billing and shipping details so we can raise your invoices correctly. It takes
        a minute, and you do not need an account.
      </Typography>
      <Paper sx={{ p: { xs: 2.5, sm: 4 } }}>
        <FormSection title="Your details">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="firstName"
                defaultValue=""
                label="First name"
                helperText={shown('firstName')}
                error={Boolean(shown('firstName'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="lastName"
                defaultValue=""
                label="Last name"
                helperText={shown('lastName')}
                error={Boolean(shown('lastName'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="email"
                defaultValue=""
                label="Email"
                required
                helperText={shown('email') ?? 'Where we send your invoices'}
                error={Boolean(shown('email'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextInput
                name="phone"
                defaultValue=""
                label="Phone"
                placeholder="e.g. +1 909 516 8570"
                helperText={shown('phone')}
                error={Boolean(shown('phone'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Billing address">
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <SelectInput
                name="country"
                label="Country"
                value={country}
                options={COUNTRY_OPTIONS}
                onChange={(_name, value) => {
                  setCountry(value === 'PK' ? 'PK' : 'US');
                  // A state picked from the other country's list is not in this one's.
                  setState('');
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextInput
                name="line1"
                defaultValue=""
                label="Street address"
                required
                helperText={shown('line1')}
                error={Boolean(shown('line1'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextInput
                name="line2"
                defaultValue=""
                label="Apt / suite / unit"
                helperText={shown('line2')}
                error={Boolean(shown('line2'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: country === 'US' ? 5 : 4 }}>
              <TextInput
                name="city"
                defaultValue=""
                label="City"
                required
                helperText={shown('city')}
                error={Boolean(shown('city'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: country === 'US' ? 3 : 4 }}>
              <SelectInput
                name="state"
                label={country === 'US' ? 'State' : 'Province'}
                value={state}
                options={STATE_OPTIONS[country]}
                placeholderLabel={country === 'US' ? 'Pick a state' : 'Pick a province'}
                helperText={shown('state')}
                error={Boolean(shown('state'))}
                onChange={(_name, value) => {
                  setState(value);
                  setTouched((t) => ({ ...t, state: true }));
                }}
              />
            </Grid>
            <Grid size={{ xs: country === 'US' ? 7 : 12, sm: country === 'US' ? 2 : 4 }}>
              <TextInput
                name="zip"
                defaultValue=""
                label={country === 'US' ? 'ZIP' : 'Postal code'}
                required
                inputMode="numeric"
                maxLength={5}
                helperText={shown('zip')}
                error={Boolean(shown('zip'))}
                onChange={setText}
                onBlur={blurField}
              />
            </Grid>
            {country === 'US' && (
              <Grid size={{ xs: 5, sm: 2 }}>
                <TextInput
                  name="zipPlus4"
                  defaultValue=""
                  label="+4"
                  inputMode="numeric"
                  maxLength={4}
                  helperText={shown('zipPlus4')}
                  error={Boolean(shown('zipPlus4'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
            )}
          </Grid>
        </FormSection>

        <FormSection title="Shipping address">
          <FormControlLabel
            control={
              <Checkbox checked={shipSame} onChange={(e) => setShipSame(e.target.checked)} />
            }
            label="Ship to the same address"
          />
          {!shipSame && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="shipName"
                  defaultValue=""
                  label="Recipient name"
                  required
                  helperText={shown('shipName')}
                  error={Boolean(shown('shipName'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextInput
                  name="shipPhone"
                  defaultValue=""
                  label="Recipient phone"
                  helperText={shown('shipPhone')}
                  error={Boolean(shown('shipPhone'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <SelectInput
                  name="shipCountry"
                  label="Country"
                  value={shipCountry}
                  options={COUNTRY_OPTIONS}
                  onChange={(_name, value) => {
                    setShipCountry(value === 'PK' ? 'PK' : 'US');
                    setShipState('');
                  }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 9 }}>
                <TextInput
                  name="shipLine1"
                  defaultValue=""
                  label="Street address"
                  required
                  helperText={shown('shipLine1')}
                  error={Boolean(shown('shipLine1'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextInput
                  name="shipCity"
                  defaultValue=""
                  label="City"
                  required
                  helperText={shown('shipCity')}
                  error={Boolean(shown('shipCity'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <SelectInput
                  name="shipState"
                  label={shipCountry === 'US' ? 'State' : 'Province'}
                  value={shipState}
                  options={STATE_OPTIONS[shipCountry]}
                  placeholderLabel="Pick one"
                  required
                  helperText={shown('shipState')}
                  error={Boolean(shown('shipState'))}
                  onChange={(_name, value) => setShipState(value)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextInput
                  name="shipZip"
                  defaultValue=""
                  label={shipCountry === 'US' ? 'ZIP' : 'Postal code'}
                  required
                  inputMode="numeric"
                  maxLength={5}
                  helperText={shown('shipZip')}
                  error={Boolean(shown('shipZip'))}
                  onChange={setText}
                  onBlur={blurField}
                />
              </Grid>
            </Grid>
          )}
        </FormSection>

        <FormSection title="Resale certificate">
          <Typography color="text.secondary" variant="body2" sx={{ mb: 1.5 }}>
            Only if you buy for resale and hold a valid certificate. Attaching it removes sales tax
            from your invoices. Skip this if it does not apply to you.
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Button
              component="label"
              variant="outlined"
              startIcon={<UploadFileRounded />}
              disabled={saving}
            >
              {certificate ? 'Replace file' : 'Attach certificate'}
              <input hidden type="file" accept={CERT_ACCEPT} onChange={pickCertificate} />
            </Button>
            {certificate && (
              <>
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                  {certificate.name}
                </Typography>
                <Button size="small" color="inherit" onClick={() => setCertificate(null)}>
                  Remove
                </Button>
              </>
            )}
          </Stack>
          {(certError || errors['resellerCertificate.data']) && (
            <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
              {certError || errors['resellerCertificate.data']}
            </Typography>
          )}
        </FormSection>

        <FormSection title="Anything else">
          <TextInput
            name="customerNote"
            defaultValue=""
            label="What are you looking for? (optional)"
            placeholder="Products you are interested in, or anything we should know"
            multiline
            minRows={3}
            onChange={setText}
            onBlur={blurField}
          />
        </FormSection>

        <Divider sx={{ my: 2 }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SubmitButton
            variant="contained"
            size="large"
            loading={saving}
            onClick={submit}
            sx={{ minWidth: 200 }}
          >
            Send my details
          </SubmitButton>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.5, textAlign: 'right' }}
        >
          This link works once. {customerName ? `Sent for ${customerName}.` : ''}
        </Typography>
      </Paper>
    </>
  );
}

/** The page shell — brand bar, no app chrome, since the reader has no account here. */
export function IntakeShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: colors.surface.subtle }}>
      <Box sx={{ background: gradients.ink, px: { xs: 2.5, sm: 4 }, py: 2.5 }}>
        <BrandLockup subtitle="Customer details" />
      </Box>
      <Box sx={{ maxWidth: 880, mx: 'auto', px: { xs: 1.5, sm: 3 }, py: { xs: 2.5, sm: 4 } }}>
        {children}
      </Box>
    </Box>
  );
}
