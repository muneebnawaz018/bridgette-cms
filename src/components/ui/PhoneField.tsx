'use client';

import { memo, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ButtonBase from '@mui/material/ButtonBase';
import Typography from '@mui/material/Typography';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { COUNTRIES, countryByIso2, joinPhone, formatNational } from '@/lib/format/countries';
import { colors } from '@/lib/colors';

/** Hoisted: these never change, so they should not be rebuilt on every render. */
const SHRINK_LABEL = { shrink: true } as const;
// maxLength counts the display spaces too, so allow room for the separators.
const INPUT_PROPS = { inputMode: 'tel', autoComplete: 'tel-national', maxLength: 20 } as const;
// 300px flush against a 320px screen left 20px of viewport. Cap to the available width below
// sm so the country list never sits on the edge.
const MENU_SLOT_PROPS = {
  paper: { sx: { maxHeight: 340, width: { xs: 'calc(100vw - 32px)', sm: 300 } } },
} as const;
const ROOT_SX = { '& .MuiInputBase-root': { pl: 1 } } as const;
const PICKER_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
  py: 0.5,
  pl: 0.5,
  pr: 1,
  mr: 1,
  borderRadius: 1,
  borderRight: `1px solid ${colors.surface.border}`,
  '&:hover': { bgcolor: 'action.hover' },
} as const;

export const PhoneField = memo(function PhoneField({
  iso2,
  national,
  onChange,
  label = 'Phone',
  required,
  disabled,
  error,
  helperText,
  onBlur,
}: {
  iso2: string;
  national: string;
  onChange: (next: { iso2: string; national: string; e164: string }) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  onBlur?: () => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [query, setQuery] = useState('');
  const open = Boolean(anchor);
  const country = countryByIso2(iso2) ?? COUNTRIES[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.includes(q.replace('+', '')),
    );
  }, [query]);

  function emit(nextIso2: string, nextNational: string) {
    onChange({
      iso2: nextIso2,
      national: nextNational,
      e164: joinPhone(nextIso2, nextNational),
    });
  }

  function pick(nextIso2: string) {
    setAnchor(null);
    setQuery('');
    emit(nextIso2, national);
  }

  function handleNumber(raw: string) {
    // Keep digits only, then strip a leading 0 — "0300…" is the local trunk form of "300…".
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    emit(iso2, digits);
  }

  return (
    <>
      <TextField
        label={label}
        required={required}
        disabled={disabled}
        error={error}
        helperText={helperText}
        // Digits are stored unspaced; the grouping is applied purely for display.
        value={formatNational(iso2, national)}
        onChange={(e) => handleNumber(e.target.value)}
        onBlur={onBlur}
        fullWidth
        placeholder={formatNational(iso2, '3001234567')}
        InputLabelProps={SHRINK_LABEL}
        inputProps={INPUT_PROPS}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start" sx={{ mr: 0 }}>
              <ButtonBase
                onClick={(e) => !disabled && setAnchor(e.currentTarget)}
                disabled={disabled}
                aria-label="Select country code"
                sx={PICKER_SX}
              >
                <Box component="span" sx={{ fontSize: '1.1rem', lineHeight: 1 }}>
                  {country.flag}
                </Box>
                <Typography component="span" sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  +{country.dial}
                </Typography>
                <ArrowDropDownRounded fontSize="small" sx={{ color: 'text.secondary', ml: -0.5 }} />
              </ButtonBase>
            </InputAdornment>
          ),
        }}
        sx={ROOT_SX}
      />

      {/* Built only while the menu is open. Closed, MUI throws the children away anyway, so
          rendering 80 countries on every keystroke of the surrounding form is wasted work. */}
      <Menu
        anchorEl={anchor}
        open={open}
        onClose={() => {
          setAnchor(null);
          setQuery('');
        }}
        slotProps={MENU_SLOT_PROPS}
      >
        {open && (
          <Box sx={{ px: 1.5, pb: 1, pt: 0.5 }}>
            <TextField
              size="small"
              fullWidth
              autoFocus
              placeholder="Search country or code"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </Box>
        )}
        {open &&
          filtered.map((c) => (
            <MenuItem key={c.iso2} selected={c.iso2 === iso2} onClick={() => pick(c.iso2)}>
              <Box component="span" sx={{ mr: 1, fontSize: '1.1rem' }}>
                {c.flag}
              </Box>
              <Box
                component="span"
                sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {c.name}
              </Box>
              <Box component="span" sx={{ color: 'text.secondary', ml: 1 }}>
                +{c.dial}
              </Box>
            </MenuItem>
          ))}
        {open && filtered.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2">No match</Typography>
          </MenuItem>
        )}
      </Menu>
    </>
  );
});
