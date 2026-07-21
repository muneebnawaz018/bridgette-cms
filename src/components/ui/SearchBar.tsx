'use client';

import { Fragment, useState } from 'react';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import InputBase from '@mui/material/InputBase';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import { DateField } from '@/components/form/DateField';
import SearchRounded from '@mui/icons-material/SearchRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import FilterListRounded from '@mui/icons-material/FilterListRounded';
import DateRangeRounded from '@mui/icons-material/DateRangeRounded';
import ArrowDropDownRounded from '@mui/icons-material/ArrowDropDownRounded';
import { formatDateShort } from '@/lib/format/date';
import { redA } from '@/lib/colors';

export interface FilterConfig {
  /** Shown when nothing narrower is selected, e.g. "All types". */
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** First entry is the "all" option (usually value ''). */
  options: { value: string; label: string }[];
}

/** A `from`/`to` pair of calendar days (YYYY-MM-DD). Empty string means "unbounded". */
export interface DateRangeConfig {
  from: string;
  to: string;
  onChange: (next: { from: string; to: string }) => void;
}

/**
 * One compact trigger that opens the two date fields in a dropdown. Two inline date inputs
 * ate roughly a third of the bar and stacked up three calendar icons, so the range collapses
 * to a summary here and the editing happens in the popover, where the fields have room for
 * real labels.
 */
function DateRangeFilter({ config }: { config: DateRangeConfig }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { from, to, onChange } = config;
  const hasRange = Boolean(from || to);

  let label = 'Any date';
  if (from && to) label = `${formatDateShort(from)} - ${formatDateShort(to)}`;
  else if (from) label = `From ${formatDateShort(from)}`;
  else if (to) label = `Until ${formatDateShort(to)}`;

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-label="Filter by date range"
        onClick={(e) => setAnchor(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setAnchor(e.currentTarget);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
          // Matches the Select filters beside it: a width floor, growing to fill the shared
          // filter row, then back to its natural width once the bar is a single line.
          minWidth: { xs: '100%', sm: 140, md: 168 },
          flexGrow: { xs: 0, sm: 1, lg: 0 },
          flexShrink: 0,
          minHeight: 48,
          pl: 1.25,
          pr: 0.5,
          transition: 'background-color .16s ease',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <DateRangeRounded
          fontSize="small"
          sx={{ color: 'text.secondary', mr: 0.75, flexShrink: 0 }}
        />
        <Box
          component="span"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
            fontSize: '0.9rem',
            color: hasRange ? 'text.primary' : 'text.secondary',
          }}
        >
          {label}
        </Box>
        <ArrowDropDownRounded sx={{ color: 'text.secondary', flexShrink: 0 }} />
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 1, p: 2, borderRadius: '12px', width: 268 } } }}
      >
        {/* maxDate/minDate cross-bind the fields, so an end-before-start range can't be picked. */}
        <Stack spacing={2}>
          <DateField
            label="Start date"
            value={from}
            onChange={(v) => onChange({ from: v, to })}
            maxDate={to || undefined}
          />
          <DateField
            label="End date"
            value={to}
            onChange={(v) => onChange({ from, to: v })}
            minDate={from || undefined}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button
              size="small"
              variant="outlined"
              color="inherit"
              disabled={!hasRange}
              onClick={() => onChange({ from: '', to: '' })}
            >
              Clear
            </Button>
            <Button size="small" variant="contained" onClick={() => setAnchor(null)}>
              Done
            </Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}

/** Vertical rule between controls sharing a row; turns horizontal once they stack. */
function FusedDivider() {
  return (
    <>
      <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
      <Divider sx={{ display: { xs: 'block', sm: 'none' } }} />
    </>
  );
}

/**
 * Full-width search field with optional filter dropdowns fused into the right edge (one
 * rounded control, not three scattered boxes).
 *
 * Layout, by width:
 * - phones: everything stacks, one control per row.
 * - 600px to 1200px: search on its own row, the filters sharing the row beneath it.
 * - 1200px and up: the whole bar is one row.
 *
 * The single-row switch waits for `lg` rather than `wide` because the sidebar rail takes
 * 268px from 768px up. Measured at 1024 with the rail out, one row left the search field
 * 163px — narrower than its own placeholder. Two rows keep it full-width instead.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Search',
  filter,
  filters,
  dateRange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** A single fused filter dropdown. */
  filter?: FilterConfig;
  /** Several fused filter dropdowns, rendered left-to-right (right edge on desktop). */
  filters?: FilterConfig[];
  /** A fused start/end date pair, rendered before the dropdowns. */
  dateRange?: DateRangeConfig;
  autoFocus?: boolean;
}) {
  const filterList = filters ?? (filter ? [filter] : []);
  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', lg: 'row' },
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
      {/* Search takes every spare pixel; minWidth:0 lets it shrink gracefully rather than
          forcing the filters to wrap. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexGrow: 1,
          minWidth: 0,
          px: 1.75,
          minHeight: 48,
        }}
      >
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
          <IconButton
            size="small"
            aria-label="Clear search"
            onClick={() => onChange('')}
            sx={{ flexShrink: 0 }}
          >
            <CloseRounded fontSize="small" />
          </IconButton>
        )}
      </Box>

      {(dateRange || filterList.length > 0) && (
        <>
          {/* Splits search from the filters: a rule down the middle at desktop width, a rule
              between the two rows below it. */}
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', lg: 'block' } }} />
          <Divider sx={{ display: { xs: 'block', lg: 'none' } }} />
        </>
      )}

      {/* The filters share one row beneath the search box until there is room for a single
          line. On that shared row each one grows to fill it, so the card has no dead space;
          at desktop width they fall back to their natural widths and search takes the slack. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: 'stretch',
          flexShrink: 0,
        }}
      >
        {dateRange && <DateRangeFilter config={dateRange} />}

        {filterList.map((f, i) => (
          <Fragment key={i}>
            {(dateRange || i > 0) && <FusedDivider />}
            <Select
              value={f.value}
              onChange={(e) => f.onChange(String(e.target.value))}
              displayEmpty
              variant="standard"
              disableUnderline
              renderValue={(v) => f.options.find((o) => o.value === v)?.label ?? f.label}
              startAdornment={
                <FilterListRounded fontSize="small" sx={{ color: 'text.secondary', mr: 0.75 }} />
              }
              sx={{
                // minWidth is only a floor — flexGrow is what fills the shared filter row.
                minWidth: { xs: '100%', sm: 118, md: 150 },
                flexGrow: { xs: 0, sm: 1, lg: 0 },
                flexShrink: 0,
                pl: 1.25,
                pr: 0.5,
                '& .MuiSelect-icon': { right: 4 },
                '& .MuiSelect-select': {
                  display: 'flex',
                  alignItems: 'center',
                  py: 1.5,
                  pr: '26px !important',
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
      </Box>
    </Paper>
  );
}
