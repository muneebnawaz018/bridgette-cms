'use client';

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
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  filter?: FilterConfig;
  autoFocus?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: 'stretch',
        width: '100%',
        borderRadius: 2.5,
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

      {filter && (
        <>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
          <Divider sx={{ display: { xs: 'block', sm: 'none' } }} />
          <Select
            value={filter.value}
            onChange={(e) => filter.onChange(String(e.target.value))}
            displayEmpty
            variant="standard"
            disableUnderline
            renderValue={(v) => filter.options.find((o) => o.value === v)?.label ?? filter.label}
            startAdornment={<FilterListRounded fontSize="small" sx={{ color: 'text.secondary', mr: 1 }} />}
            sx={{
              minWidth: { xs: '100%', sm: 176 },
              px: 1.75,
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                py: 1.5,
                fontWeight: 600,
                fontSize: '0.9rem',
              },
            }}
          >
            {filter.options.map((o) => (
              <MenuItem key={o.value || '__all'} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </>
      )}
    </Paper>
  );
}
