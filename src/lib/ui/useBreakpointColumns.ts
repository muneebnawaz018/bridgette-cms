'use client';

import { useMemo } from 'react';
import useMediaQuery from '@mui/material/useMediaQuery';
import type { GridColumnVisibilityModel } from '@mui/x-data-grid';

/**
 * Which grid columns to drop as the viewport narrows.
 *
 * Both lists carry ~900px of column `minWidth`, and from 768px up the shell reserves a 268px
 * rail, so every screen below roughly 1266px — a 1280 laptop included — scrolled the grid
 * sideways. Hiding columns is the only real fix: DataGrid measures its own columns and cannot
 * be told to drop one through CSS, so this has to be a JS decision.
 *
 * Each key names the tier a field survives down to; the field is hidden below it. `lg` fields
 * go first and `sm` fields last, so the columns that matter least disappear soonest.
 *
 * Pass a module-level constant, not an inline object — the memo keys off identity, and a fresh
 * object each render defeats it.
 */
export interface ColumnTiers {
  /** Hidden below lg (1200) — first to go. */
  lg?: readonly string[];
  /** Hidden below md (900). */
  md?: readonly string[];
  /** Hidden below sm (600) — the last cut before the essentials. */
  sm?: readonly string[];
}

export function useBreakpointColumns(tiers: ColumnTiers): GridColumnVisibilityModel {
  // Widths match the theme's own scale (sm 600 / md 900 / lg 1200), minus a hair so a viewport
  // sitting exactly on a breakpoint counts as the wider tier, which is how MUI's `up()` reads.
  const belowLg = useMediaQuery('(max-width:1199.95px)');
  const belowMd = useMediaQuery('(max-width:899.95px)');
  const belowSm = useMediaQuery('(max-width:599.95px)');

  return useMemo(() => {
    const model: GridColumnVisibilityModel = {};
    if (belowLg) for (const field of tiers.lg ?? []) model[field] = false;
    if (belowMd) for (const field of tiers.md ?? []) model[field] = false;
    if (belowSm) for (const field of tiers.sm ?? []) model[field] = false;
    return model;
  }, [tiers, belowLg, belowMd, belowSm]);
}
