'use client';

import { useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import { colors, gradients, whiteA } from '@/lib/colors';

/*
 * The teams a customer buys for, entered as free text.
 *
 * An Autocomplete with nothing to complete: there is no list of teams anywhere, so the only
 * thing the menu can offer is what has just been typed. That is deliberate rather than a
 * shortcut — a shared list would put one customer's team names in every other customer's
 * picker, and these names only mean anything on the record they were typed on.
 *
 * The menu exists all the same, instead of a bare "press Enter": a row that has to be clicked
 * is how somebody discovers that this box makes tokens rather than taking a sentence. Enter
 * still works, for anyone adding several in a row.
 */

const TEAM_MAX = 60;

/** Matches the products picker: full-height token, brand gradient, tinted delete cross. */
const CHIP_SX = {
  height: 28,
  maxWidth: '100%',
  backgroundImage: gradients.brand,
  color: colors.brand.white,
  fontWeight: 600,
  // A 60-character team name is allowed, and on a phone that is wider than the field. Truncated
  // with the full name on hover rather than pushing the input sideways.
  '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
  '& .MuiChip-deleteIcon': {
    color: whiteA(0.7),
    '&:hover': { color: colors.brand.white },
  },
} as const;

/*
 * Fifteen chips stack several rows deep on a narrow screen, which on the customer dialog would
 * push Save off the bottom. The token area scrolls at that point instead of growing without
 * limit; the field itself keeps its normal height until there is something to scroll.
 */
const ROOT_SX = {
  '& .MuiAutocomplete-inputRoot': { maxHeight: 132, overflowY: 'auto' },
} as const;

export function CustomerTeamsField({
  value,
  onChange,
  max,
  disabled,
}: {
  value: string[];
  onChange: (teams: string[]) => void;
  /** How many teams one customer may hold. */
  max: number;
  disabled?: boolean;
}) {
  const [input, setInput] = useState('');
  const full = value.length >= max;

  /** Already held, ignoring case: "Varsity" and "varsity" are the same team. */
  const has = (name: string) => value.some((t) => t.toLowerCase() === name.toLowerCase());

  /*
   * Typed a name that is already a chip. Without saying so, the menu simply shows nothing and
   * the box looks broken — the name is right there on screen, so "nothing happened" reads as a
   * bug rather than as "you already have that one".
   */
  const duplicate = Boolean(input.trim()) && has(input.trim());

  /*
   * Everything that decides whether a typed name can be added, in one place, so the menu and the
   * Enter key cannot disagree about it — a name the menu refuses to offer must not be addable by
   * pressing Enter instead.
   */
  const candidate = () => {
    const name = input.trim().slice(0, TEAM_MAX);
    return name && !has(name) && !full ? name : '';
  };

  const add = (name: string) => {
    const team = name.trim().slice(0, TEAM_MAX);
    if (!team || has(team) || full) return;
    onChange([...value, team]);
    setInput('');
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      sx={ROOT_SX}
      // Nothing is stored to complete against; the menu is built from the input alone.
      options={[] as string[]}
      value={value}
      inputValue={input}
      disabled={disabled}
      onInputChange={(_e, next, reason) => {
        // A pick clears the box itself, in `add`. Letting this write the picked label back would
        // leave the name sitting in the input as well as on the chip.
        if (reason !== 'reset') setInput(next);
      }}
      filterOptions={() => {
        const name = candidate();
        return name ? [name] : [];
      }}
      onChange={(_e, picked, reason) => {
        // Removing a chip hands back the shortened list; anything else is an add, and `add`
        // owns the rules for what may be added.
        if (reason === 'removeOption' || reason === 'clear') {
          onChange(picked as string[]);
          return;
        }
        const last = (picked as string[])[picked.length - 1];
        if (last !== undefined) add(last);
      }}
      renderOption={(props, name) => {
        const { key, ...rest } = props as typeof props & { key?: string };
        return (
          <li key={key ?? name} {...rest}>
            Add “{name}”
          </li>
        );
      }}
      renderTags={(tags, getTagProps) =>
        tags.map((team, i) => {
          const { key, ...rest } = getTagProps({ index: i });
          return <Chip key={key} {...rest} label={team} title={team} sx={CHIP_SX} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Teams"
          placeholder={full ? '' : 'Type a team name'}
          helperText={
            full
              ? `That is the limit of ${max} teams.`
              : duplicate
                ? 'That team is already on the list'
                : `Type a name and pick it to add it. Up to ${max}.`
          }
        />
      )}
    />
  );
}
