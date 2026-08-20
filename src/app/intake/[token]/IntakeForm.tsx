'use client';

import { useCallback, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid2';
import Paper from '@mui/material/Paper';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import { useSnackbar } from 'notistack';
import { BrandLockup } from '@/components/layout/BrandLockup';
import { FormSection, TextInput, SelectInput } from '@/components/form/fields';
import { PhoneField } from '@/components/ui/PhoneField';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { splitPhone, joinPhone, DEFAULT_COUNTRY_ISO2 } from '@/lib/format/countries';
import { statesFor } from '@/modules/customers/address';
import { customerIntakeSubmitSchema } from '@/modules/customers/intake.schemas';
import { TEAMS_MAX } from '@/modules/customers/schemas';
import { canBeReseller } from '@/modules/customers/invoiceType';
import { apiPost } from '@/lib/api/client';
import { type FieldErrors, toFieldErrors, serverFieldErrors } from '@/lib/form/errors';
import { colors, gradients } from '@/lib/colors';
import {
  CertificateDropzone,
  type CertificateFile,
} from '@/components/customers/CertificateDropzone';
import { CustomerTeamsField } from '@/components/customers/CustomerTeamsField';
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

/** The admin form's reseller question, in words the customer answering it can act on. */
const RESELLER_OPTIONS = [
  { value: 'no', label: 'No, I pay sales tax' },
  { value: 'yes', label: 'Yes, I hold a resale certificate' },
];

const COUNTRY_OPTIONS = [
  { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' },
];

const STATE_OPTIONS: Record<'US' | 'PK', { value: string; label: string }[]> = {
  US: statesFor('US').map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  PK: statesFor('PK').map((s) => ({ value: s.code, label: s.name })),
};

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
  certificate: CertificateFile | null,
  teams: string[],
) {
  return {
    // The two required ones go through as typed, blank included: an omitted field reads back as
    // "Required", while an empty string gets the message the schema actually wrote for it.
    firstName: v.firstName,
    lastName: v.lastName || undefined,
    email: v.email,
    phone: v.phone,
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
    teams,
    customerNote: v.customerNote || undefined,
    // Never sent for a Pakistani address: US sales tax is what a certificate exempts.
    resellerCertificate: (canBeReseller(country) && certificate) || undefined,
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

export function IntakeForm({ token }: { token: string }) {
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
  /*
   * The phone picker is controlled by its two halves; the joined E.164 string is what the ref
   * carries and the API stores, the same way the admin dialog holds it.
   */
  const [phone, setPhone] = useState({ iso2: DEFAULT_COUNTRY_ISO2, national: '' });
  /*
   * Whether they are claiming an exemption. On screen only — the payload carries the certificate
   * and nothing else, so the exemption follows from the file rather than from a tick.
   */
  const [reseller, setReseller] = useState(false);
  /** Free-text team names. Controlled, since adding one has to render its chip. */
  const [teams, setTeams] = useState<string[]>([]);
  const [certificate, setCertificate] = useState<CertificateFile | null>(null);
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

  const changePhone = useCallback((next: { iso2: string; national: string; e164: string }) => {
    setPhone({ iso2: next.iso2, national: next.national });
    valuesRef.current.phone = next.e164;
  }, []);

  /** An error is shown once its field has been visited, or once submit has been attempted. */
  const shown = (name: string) => (submitted || touched[name] ? errors[name] : undefined);

  /*
   * Drop a field's error the moment it is answered. The text inputs re-validate on submit and
   * hold their own value, but a select's error is only recomputed on the next submit — so
   * without this, picking a state left "A state is required" sitting under a filled-in field.
   */
  const clearError = useCallback((name: string) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  async function submit() {
    setSubmitted(true);

    /*
     * Answering yes without attaching anything would send a submission that changes nothing: the
     * exemption comes from the file, never from the answer. Caught here rather than silently
     * ignored, so nobody leaves believing they are tax-exempt.
     */
    if (reseller && !certificate) {
      setCertError('Attach your resale certificate, or answer "No"');
      enqueueSnackbar('Attach your resale certificate', { variant: 'warning' });
      return;
    }

    const payload = toPayload(
      { ...valuesRef.current, state, shipState },
      country,
      shipCountry,
      shipSame,
      certificate,
      teams,
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
            {/* Their own name, as they just typed it — the invitation carried none. */}
            {valuesRef.current.firstName
              ? `Thank you, ${valuesRef.current.firstName}`
              : 'Thank you'}
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
        Your details
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
                required
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
              <PhoneField
                iso2={phone.iso2}
                national={phone.national}
                onChange={changePhone}
                onBlur={() => blurField('phone')}
                required
                helperText={shown('phone')}
                error={Boolean(shown('phone'))}
                disabled={saving}
              />
            </Grid>
            {/* Optional, and the same control staff use — the customer naming their own teams is
                the person most likely to spell them the way they mean them. */}
            <Grid size={12}>
              <CustomerTeamsField
                value={teams}
                onChange={setTeams}
                max={TEAMS_MAX}
                disabled={saving}
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
                  const next = value === 'PK' ? 'PK' : 'US';
                  setCountry(next);
                  // A state picked from the other country's list is not in this one's.
                  setState('');
                  /*
                   * The dial code follows the country: somebody billed in Pakistan is reached on
                   * a +92 number far more often than not. Digits already typed are kept — only
                   * the code in front of them changes — and the picker still overrides it.
                   */
                  const { national } = splitPhone(valuesRef.current.phone);
                  valuesRef.current.phone = joinPhone(next, national);
                  setPhone({ iso2: next, national });
                  /*
                   * A resale certificate exempts a customer from US sales tax, which a Pakistani
                   * customer is not charged in the first place. Switching to Pakistan drops the
                   * question and any file already attached, so the section cannot disappear still
                   * holding one and post it — the server refuses that combination anyway.
                   */
                  if (!canBeReseller(next)) {
                    setReseller(false);
                    setCertificate(null);
                    setCertError('');
                  }
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
                required
                helperText={shown('state')}
                error={Boolean(shown('state'))}
                onChange={(_name, value) => {
                  setState(value);
                  clearError('state');
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
                  placeholder="e.g. 415 555 0132"
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
                  onChange={(_name, value) => {
                    setShipState(value);
                    clearError('shipState');
                  }}
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

        {/* US only: the certificate is a US sales-tax instrument, and a Pakistani customer has
            nothing to exempt. Asking them for one would only invite a file we must reject. */}
        {canBeReseller(country) && (
          <FormSection title="Resale certificate">
            <Typography color="text.secondary" variant="body2" sx={{ mb: 1.5 }}>
              Answer yes only if you buy for resale and hold a valid certificate. Attaching it
              removes sales tax from your invoices.
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <SelectInput
                  name="reseller"
                  label="Reseller"
                  value={reseller ? 'yes' : 'no'}
                  options={RESELLER_OPTIONS}
                  disabled={saving}
                  onChange={(_name, value) => {
                    const isReseller = value === 'yes';
                    setReseller(isReseller);
                    // Going back to "no" drops the file, so the answer on screen and what gets
                    // posted cannot disagree.
                    if (!isReseller) {
                      setCertificate(null);
                      setCertError('');
                    }
                  }}
                />
              </Grid>
              {/* The upload appears once they answer yes, the way the admin form reveals it —
                  the file is the whole of what "yes" means, since nothing else on this form can
                  grant an exemption. */}
              {reseller && (
                <Grid size={12}>
                  <CertificateDropzone
                    file={certificate}
                    onPick={(f) => {
                      setCertificate(f);
                      setCertError('');
                    }}
                    onRemove={() => setCertificate(null)}
                    onError={setCertError}
                    error={certError || errors['resellerCertificate.data']}
                    disabled={saving}
                  />
                </Grid>
              )}
            </Grid>
          </FormSection>
        )}

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
          {/* Full width on a phone, where most of these are filled in: a 200px button floating
              at the right edge of a narrow screen is easy to miss and awkward to hit. */}
          <SubmitButton
            variant="contained"
            size="large"
            loading={saving}
            onClick={submit}
            sx={{ minWidth: 200, width: { xs: '100%', sm: 'auto' } }}
          >
            Send my details
          </SubmitButton>
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1.5, textAlign: 'right' }}
        >
          This link works once.
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
