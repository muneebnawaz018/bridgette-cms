'use client';

import { Fragment } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import { redA } from '@/lib/colors';

export interface FilterConfig {
  /** Shown when nothing narrower is selected, e.g. "All types". */
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** First entry is the "all" option (usually value ''). */
  options: { value: string; label: string }[];
}

/**
 * Full-width search field with an optional filter dropdown fused into the right edge
 * (one rounded control, not three scattered boxes). Stacks vertically on phones.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
  filter,
  filters,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** A single fused filter dropdown. */
  filter?: FilterConfig;
  /** Several fused filter dropdowns, rendered left-to-right (right edge on desktop). */
  filters?: FilterConfig[];
  autoFocus?: boolean;
}) {
  const filterList = filters ?? (filter ? [filter] : []);
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: 'stretch',
        width: '100%',
        // Match the table card exactly. Note a bare `2` here would mean 2 * shape.borderRadius
        // (24px), not 16px — the Paper override uses raw px, so this must too.
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'border-color .16s ease, box-shadow .16s ease',
        '&:focus-within': { borderColor: 'primary.main', boxShadow: `0 0 0 3px ${redA(0.14)}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1, px: 1.75, minHeight: 48 }}>
        <SearchRounded fontSize="small" sx={{ color: 'text.secondary', flexShrink: 0 }} />
        <InputBase
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          fullWidth
          sx={{ fontSize: '0.95rem' }}
          inputProps={{ 'aria-label': placeholder }}
        />
        {value && (
          <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')} sx={{ flexShrink: 0 }}>
            <CloseRounded fontSize="small" />
          </IconButton>
        )}
      </Box>

      {filterList.map((f, i) => (
        <Fragment key={i}>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Divider sx={{ display: { xs: 'block', sm: 'none' } }} />
          <Select
            value={f.value}
            onChange={(e) => f.onChange(String(e.target.value))}
            displayEmpty
            variant="standard"
            disableUnderline
            renderValue={(v) => f.options.find((o) => o.value === v)?.label ?? f.label}
            startAdornment={<FilterListRounded fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />}
            sx={{
              minWidth: { xs: '100%', sm: 176 },
              pl: 1.75,
              pr: 1,
              '& .MuiSelect-icon': { right: 10 },
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                py: 1.5,
                pr: '34px !important',
                fontWeight: 600,
                fontSize: '0.9rem',
              },
            }}
          >
            {f.options.map((o) => (
              <MenuItem key={o.value || '__all'} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </Fragment>
      ))}
    </Paper>
  );
}
