'use client';

import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';

export interface RowAction {
  label: string;
  onClick: () => void;
  /** Renders in the error colour. Use for archive/delete style actions. */
  danger?: boolean;
}

/**
 * The "⋮" overflow menu at the end of a table row. Both list pages had written their own,
 * differing only in which items they offered.
 *
 * It keeps its own anchor state so the page holding the grid never re-renders when a menu
 * opens, and renders nothing at all when the caller has no permitted actions, which is what
 * keeps an empty button out of rows the user cannot act on.
 */
export function RowActionsMenu({
  actions,
  ariaLabel = 'Row actions',
}: {
  actions: RowAction[];
  ariaLabel?: string;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  if (actions.length === 0) return null;

  const close = () => setAnchor(null);

  return (
    <>
      <IconButton size="small" aria-label={ariaLabel} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertRounded fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {actions.map((a) => (
          <MenuItem
            key={a.label}
            sx={a.danger ? { color: 'error.main' } : undefined}
            onClick={() => {
              close();
              a.onClick();
            }}
          >
            {a.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
