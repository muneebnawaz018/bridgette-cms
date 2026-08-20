'use client';

import Grid from '@mui/material/Grid2';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import { TextInput, SelectInput, type SelectOption } from '@/components/form/fields';
import { statesFor } from '@/modules/customers/address';
import { type FieldErrors } from '@/lib/form/errors';
import { colors } from '@/lib/colors';

/*
 * The delivery addresses on a customer, one accordion each.
 *
 * Accordions rather than a stack of address blocks because ten of these is ten times nine
 * fields, and the dialog has a fixed height — expanded, a single address is about as tall as
 * the panel allows, so only one is ever open. Adding one collapses the rest, which is also the
 * only moment the form knows for certain which address somebody is working on.
 *
 * Text inputs stay uncontrolled and report (field, value) to the parent's ref, matching the rest
 * of the dialog: typing a street name must not re-render nine other addresses.
 */

export interface ShipAddressValue {
  name: string;
  phone: string;
  country: 'US' | 'PK';
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
  zipPlus4: string;
}

export const EMPTY_SHIP_ADDRESS: ShipAddressValue = {
  name: '',
  phone: '',
  country: 'US',
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  zipPlus4: '',
};

const COUNTRY_OPTIONS: SelectOption[] = [
  { value: 'US', label: 'United States' },
  { value: 'PK', label: 'Pakistan' },
];

const STATE_OPTIONS: Record<'US' | 'PK', SelectOption[]> = {
  US: statesFor('US').map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  PK: statesFor('PK').map((s) => ({ value: s.code, label: s.name })),
};

/**
 * Whether an address is finished — the same fields the schema will refuse to save without.
 *
 * Checked here so "add another" can be held back until this one stands on its own. Half-filled
 * addresses are the failure mode this list invites: somebody types a name, adds a second one to
 * see what happens, and Save then refuses over a box hidden inside a collapsed panel.
 */
function isComplete(a: ShipAddressValue): boolean {
  return Boolean(
    a.name.trim() && a.line1.trim() && a.city.trim() && a.state && /^\d{5}$/.test(a.zip.trim()),
  );
}

/** What the collapsed row says. Enough to tell two addresses apart without opening either. */
function summarise(a: ShipAddressValue, index: number): string {
  const where = [a.line1, a.city].filter(Boolean).join(', ');
  if (a.name && where) return `${a.name} · ${where}`;
  return a.name || where || `Address ${index + 1}`;
}

export function CustomerShippingAddresses({
  values,
  errors,
  expanded,
  onExpand,
  onFieldChange,
  onBlurField,
  onAdd,
  onRemove,
  max,
  revision,
  disabled,
}: {
  values: ShipAddressValue[];
  /** Keyed the way the schema paths them: `shipAddresses.2.city`. */
  errors: FieldErrors;
  expanded: number | null;
  onExpand: (index: number | null) => void;
  onFieldChange: (index: number, field: keyof ShipAddressValue, value: string) => void;
  onBlurField: (path: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  max: number;
  /*
   * Bumped by the parent whenever the list itself changes. The inputs are uncontrolled, so
   * removing the first address would otherwise leave the second one's text sitting in the boxes
   * that now belong to the first — the key change remounts them against the new defaults.
   */
  revision: number;
  disabled?: boolean;
}) {
  const full = values.length >= max;
  const err = (index: number, field: string) => errors[`shipAddresses.${index}.${field}`];
  // The first address still missing something. Adding waits for it.
  const incomplete = values.findIndex((a) => !isComplete(a));
  const blocked = incomplete !== -1;

  const addHint = full
    ? `That is the limit of ${max} addresses`
    : blocked
      ? `Finish ${summarise(values[incomplete], incomplete)} first`
      : 'Add another delivery address';

  return (
    <Box>
      {/* Wraps on a phone: the heading and a labelled button together are wider than a 320px
          dialog column, and the button dropping to its own line beats either one being clipped. */}
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 1, gap: 1 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Delivery addresses
          {values.length > 1 ? ` (${values.length})` : ''}
        </Typography>
        {/* A labelled button rather than a bare icon: this is the only way to a second address,
            and a plus glyph in a heading was read as decoration. It sits with the heading, where
            "add another one of these" belongs to the list rather than to whichever address
            happens to be underneath it. */}
        <Tooltip title={addHint}>
          <span>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddRounded />}
              aria-label="Add another delivery address"
              disabled={disabled || full || blocked}
              onClick={onAdd}
            >
              Add address
            </Button>
          </span>
        </Tooltip>
      </Stack>

      {errors.shipAddresses && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {errors.shipAddresses}
        </Typography>
      )}

      {blocked && values.length > 0 && !full && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Finish this address to add another.
        </Typography>
      )}

      {values.map((a, i) => {
        // Any error inside this address, so a collapsed one still announces that it is the
        // reason Save is refusing — otherwise the message is hidden behind a closed panel.
        const hasError = Object.keys(errors).some((k) => k.startsWith(`shipAddresses.${i}.`));
        return (
          <Accordion
            key={`${revision}-${i}`}
            expanded={expanded === i}
            onChange={(_e, open) => onExpand(open ? i : null)}
            disableGutters
            sx={{
              mb: 1,
              borderRadius: 1,
              border: `1px solid ${hasError ? colors.status.error : colors.surface.border}`,
              '&::before': { display: 'none' },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreRounded />}>
              <Stack
                direction="row"
                alignItems="center"
                sx={{ flexGrow: 1, minWidth: 0, gap: 1, pr: 1 }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summarise(a, i)}
                </Typography>
                {hasError && (
                  <Box
                    component="span"
                    sx={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor: 'error.main',
                    }}
                  />
                )}
              </Stack>
              {/* Inside the summary, so removing an address never means expanding it first.
                  The click is stopped from reaching the summary, which would toggle it open. */}
              <IconButton
                size="small"
                aria-label={`Remove ${summarise(a, i)}`}
                disabled={disabled}
                component="span"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(i);
                }}
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </AccordionSummary>

            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextInput
                    name="name"
                    label="Ship to name"
                    placeholder="e.g. Acme Warehouse"
                    defaultValue={a.name}
                    helperText={err(i, 'name')}
                    error={Boolean(err(i, 'name'))}
                    required
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'name', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.name`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextInput
                    name="phone"
                    label="Contact phone"
                    placeholder="e.g. 415 555 0132"
                    defaultValue={a.phone}
                    helperText={err(i, 'phone')}
                    error={Boolean(err(i, 'phone'))}
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'phone', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.phone`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 3 }}>
                  <SelectInput
                    name="country"
                    label="Country"
                    value={a.country}
                    options={COUNTRY_OPTIONS}
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'country', v)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <TextInput
                    name="line1"
                    label="Street address"
                    placeholder={
                      a.country === 'US' ? 'e.g. 5775 Riverside Dr' : 'e.g. 12 Gulberg Blvd'
                    }
                    defaultValue={a.line1}
                    helperText={err(i, 'line1')}
                    error={Boolean(err(i, 'line1'))}
                    required
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'line1', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.line1`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextInput
                    name="line2"
                    label="Apt / suite / unit"
                    defaultValue={a.line2}
                    helperText={err(i, 'line2')}
                    error={Boolean(err(i, 'line2'))}
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'line2', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.line2`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: a.country === 'PK' ? 4 : 5 }}>
                  <TextInput
                    name="city"
                    label="City"
                    placeholder={a.country === 'US' ? 'e.g. Chino' : 'e.g. Sialkot'}
                    defaultValue={a.city}
                    helperText={err(i, 'city')}
                    error={Boolean(err(i, 'city'))}
                    required
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'city', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.city`)}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: a.country === 'PK' ? 4 : 3 }}>
                  <SelectInput
                    name="state"
                    label={a.country === 'PK' ? 'Province' : 'State'}
                    value={a.state}
                    options={STATE_OPTIONS[a.country]}
                    placeholderLabel={a.country === 'PK' ? 'Pick a province' : 'Pick a state'}
                    helperText={err(i, 'state')}
                    error={Boolean(err(i, 'state'))}
                    required
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'state', v)}
                  />
                </Grid>
                <Grid
                  size={{
                    xs: a.country === 'US' ? 7 : 12,
                    sm: a.country === 'PK' ? 4 : 2,
                  }}
                >
                  <TextInput
                    name="zip"
                    label={a.country === 'PK' ? 'Postal code' : 'ZIP'}
                    placeholder={a.country === 'PK' ? 'e.g. 54000' : 'e.g. 30328'}
                    defaultValue={a.zip}
                    helperText={err(i, 'zip')}
                    error={Boolean(err(i, 'zip'))}
                    required
                    inputMode="numeric"
                    maxLength={5}
                    disabled={disabled}
                    onChange={(_n, v) => onFieldChange(i, 'zip', v)}
                    onBlur={() => onBlurField(`shipAddresses.${i}.zip`)}
                  />
                </Grid>
                {a.country === 'US' && (
                  <Grid size={{ xs: 5, sm: 2 }}>
                    <TextInput
                      name="zipPlus4"
                      label="+4"
                      placeholder="e.g. 1234"
                      defaultValue={a.zipPlus4}
                      helperText={err(i, 'zipPlus4')}
                      error={Boolean(err(i, 'zipPlus4'))}
                      inputMode="numeric"
                      maxLength={4}
                      disabled={disabled}
                      onChange={(_n, v) => onFieldChange(i, 'zipPlus4', v)}
                      onBlur={() => onBlurField(`shipAddresses.${i}.zipPlus4`)}
                    />
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
