'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import SendRounded from '@mui/icons-material/SendRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import Grid from '@mui/material/Grid2';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import { useSnackbar } from 'notistack';
import { Modal } from '@/components/ui/Modal';
import { FormSection } from '@/components/form/fields';
import { apiPost } from '@/lib/api/client';
import { formatDate } from '@/lib/format/date';
import { INTAKE_TTL_DAYS } from '@/modules/customers/intake.constants';
import { colors } from '@/lib/colors';
import { COMPANY_CONTACT_US } from '@/modules/legal/company';

/*
 * Hands staff a one-time link for somebody who is not on file yet.
 *
 * Only ever for a new customer. A link creates a record and never edits one, so nobody already
 * in the list is sent one — that is what keeps a forwarded URL from rewriting billing details
 * staff have verified.
 *
 * The link is shown, not just emailed: a good share of these go out over WhatsApp, especially on
 * the Pakistan side, and an email-only flow would strand every customer who does not read one.
 * Emailing is a button next to the link rather than the only way out of this dialog.
 */

interface Issued {
  url: string;
  expiresAt: string;
}

export function IntakeLinkDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [issued, setIssued] = useState<Issued | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  /*
   * Where the invitation goes — not the customer's billing email, which they supply themselves
   * on the form.
   */
  const [emailTo, setEmailTo] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailedTo, setEmailedTo] = useState('');
  /*
   * Who to address the invitation to. Used for the greeting only: it is never written to the
   * customer record, because the customer gives us their own name on the form, and a name typed
   * from memory here would otherwise overwrite the one they actually go by.
   */
  const [greetName, setGreetName] = useState('');

  const issue = useCallback(async () => {
    setLoading(true);
    const res = await apiPost<Issued>('/api/customers/invite');
    setLoading(false);

    if (!res.ok || !res.data) {
      enqueueSnackbar(res.error ?? 'Could not create the link', { variant: 'error' });
      return;
    }
    setIssued(res.data);
    setCopied(false);
    // Nothing to tell the list behind: an invitation writes a customer only when it is
    // submitted, so there is no new row to refresh into view.
  }, [enqueueSnackbar]);

  /*
   * Minted once, when the dialog opens: issuing invalidates any previous link, so doing it on a
   * button press would silently break the link of anyone who opened this to re-read one they had
   * already sent.
   *
   * Held behind a ref rather than listed as a dependency. `issue` is rebuilt whenever its own
   * deps change — including `onCreated`, which a parent typically passes as an inline arrow and
   * therefore hands over fresh on every render. Depending on it directly meant: mint → onCreated
   * → parent re-renders → new `issue` → effect fires again, one customer and one token per
   * iteration, forever. The dialog opening is the event this should follow, and nothing else.
   */
  const issueRef = useRef(issue);
  issueRef.current = issue;

  /*
   * Whether this opening has already minted. React's dev StrictMode runs every effect twice, and
   * each run burns a token — so without this, opening the dialog once quietly issues two links
   * and invalidates the first, in development only, which is exactly the kind of thing that gets
   * found in production instead.
   */
  const mintedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      mintedRef.current = false;
      return;
    }
    if (mintedRef.current) return;
    mintedRef.current = true;

    setIssued(null);
    setCopied(false);
    setEmailError('');
    setEmailedTo('');
    setEmailTo('');
    setGreetName('');
    void issueRef.current();
  }, [open]);

  /*
   * Sends the link already on screen rather than minting a fresh one. Re-issuing would
   * invalidate the URL staff may have just copied or sent over WhatsApp, so "also email it"
   * would silently break "I already shared it".
   */
  async function sendEmail() {
    if (!issued) return;
    const to = emailTo.trim();
    if (!to) {
      setEmailError('Enter an email address to send it to');
      return;
    }
    setEmailError('');
    setSending(true);
    const token = issued.url.split('/intake/')[1] ?? '';
    const res = await apiPost<{ sent: boolean; to: string }>('/api/customers/intake-link/email', {
      token,
      to,
      name: greetName.trim() || undefined,
    });
    setSending(false);

    if (!res.ok) {
      setEmailError(res.error ?? 'Could not send the invitation');
      enqueueSnackbar(res.error ?? 'Could not send the invitation', { variant: 'error' });
      return;
    }
    setEmailedTo(to);
    enqueueSnackbar(`Invitation sent to ${to}`, { variant: 'success' });
  }

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.url);
      setCopied(true);
      enqueueSnackbar('Link copied', { variant: 'success' });
    } catch {
      // Clipboard access is refused on an insecure origin and in some in-app browsers. The
      // field is selectable, so say that rather than failing silently.
      enqueueSnackbar('Could not copy. Select the link and copy it manually.', {
        variant: 'warning',
      });
    }
  };

  /*
   * The WhatsApp text has to stand on its own: it arrives with no subject line, no sender
   * branding, and often from a number the customer has not saved. A bare "please confirm your
   * details" plus a link reads like a phishing attempt, which is exactly what a careful customer
   * will treat it as. So it names the company, says what the link is for, states that no account
   * is needed, and gives the expiry.
   */
  const whatsappText = issued
    ? [
        greetName.trim() ? `Dear ${greetName.trim()},` : 'Hello,',
        '',
        `This is ${COMPANY_CONTACT_US.name}. Before we raise your first invoice, we need your billing and shipping details on file.`,
        '',
        'Please use your personal link below to enter them. It takes about a minute, and no account or password is required.',
        '',
        issued.url,
        '',
        `The link is unique to you and remains valid until ${formatDate(issued.expiresAt)}.`,
        '',
        'Thank you.',
      ].join('\n')
    : '';

  const whatsapp = issued ? `https://wa.me/?text=${encodeURIComponent(whatsappText)}` : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a new customer"
      description={
        'A one-time link for someone new. Nothing is added to your customer list until they fill it in and submit.'
      }
      icon={<LinkRounded />}
      maxWidth="sm"
      actions={
        <Button variant="outlined" color="inherit" onClick={onClose} startIcon={<CheckRounded />}>
          Done
        </Button>
      }
    >
      <Stack spacing={3}>
        {/* The link itself. Read-only, and the copy button is the primary way to take it. */}
        <FormSection title="Your one-time link">
          <TextField
            value={issued?.url ?? (loading ? 'Creating your link…' : '')}
            fullWidth
            slotProps={{
              htmlInput: {
                readOnly: true,
                style: {
                  fontSize: '0.8rem',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                },
              },
              input: {
                // `edge="end"` is deliberately not used on the button below: it pulls the icon
                // outward with a negative margin, leaving it tighter to the border than the text
                // is on the left.
                sx: { bgcolor: colors.surface.subtle, pr: 1 },
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title={copied ? 'Copied' : 'Copy link'}>
                      <span>
                        <IconButton onClick={copy} disabled={!issued}>
                          {copied ? (
                            <CheckRounded sx={{ color: colors.status.success }} />
                          ) : (
                            <ContentCopyRounded />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Works once, and expires{' '}
            {issued ? formatDate(issued.expiresAt) : `in ${INTAKE_TTL_DAYS} days`}. Opening this
            dialog again replaces it.
          </Typography>
        </FormSection>

        {/* Who it is for, and how it reaches them. */}
        <FormSection title="Send it">
          {/* Who it goes to on one row, then the two ways to send it on the next. Email and
              WhatsApp are the same decision, so they are laid out as siblings — welding Send to
              the email field left WhatsApp orphaned underneath, looking like an afterthought. */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Their name (optional)"
                placeholder="e.g. James Young"
                value={greetName}
                onChange={(e) => setGreetName(e.target.value)}
                helperText="Used for the greeting."
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Email address"
                placeholder="name@company.com"
                value={emailTo}
                onChange={(e) => {
                  setEmailTo(e.target.value);
                  if (emailError) setEmailError('');
                }}
                error={Boolean(emailError)}
                helperText={emailError || (emailedTo ? `Sent to ${emailedTo}` : ' ')}
                fullWidth
                disabled={!issued || sending}
              />
            </Grid>

            <Grid size={12}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button
                  variant="contained"
                  startIcon={<SendRounded />}
                  onClick={() => void sendEmail()}
                  disabled={!issued || sending}
                  sx={{ flex: 1 }}
                >
                  {sending ? 'Sending…' : emailedTo ? 'Send again' : 'Send email'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<WhatsAppIcon />}
                  component="a"
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  disabled={!issued}
                  sx={{
                    flex: 1,
                    color: colors.external.whatsapp,
                    borderColor: colors.external.whatsapp,
                    '&:hover': {
                      borderColor: colors.external.whatsappDark,
                      color: colors.external.whatsappDark,
                      bgcolor: colors.status.successBg,
                    },
                  }}
                >
                  WhatsApp
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </FormSection>

        <Box
          sx={{
            display: 'flex',
            gap: 1.25,
            p: 1.5,
            borderRadius: 1,
            bgcolor: colors.status.infoBg,
            color: colors.status.info,
          }}
        >
          <InfoOutlined fontSize="small" sx={{ mt: 0.15, flexShrink: 0 }} />
          <Typography variant="caption" sx={{ lineHeight: 1.6 }}>
            They appear in your customer list once they submit the form, not before. If the email
            they enter already belongs to a customer, the form asks them to contact you instead — a
            link never changes a record that already exists — and the link stays usable, so a
            mistyped address can be corrected.
          </Typography>
        </Box>
      </Stack>
    </Modal>
  );
}
