'use client';

import { memo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';

/*
 * The form primitives every dialog in the app builds on.
 *
 * They exist for one reason: a dialog that keeps all its values in one state object
 * re-renders itself, MUI's Dialog, Paper, Backdrop and transition included, on every
 * keystroke. React also re-commits each controlled input by blanking and restoring its `name`
 * and `type` attributes, so untouched fields keep writing to the DOM. In the user form that
 * measured ~19 DOM mutations per keystroke where 1 was needed.
 *
 * So `TextInput` owns its value and reports changes upward through `onChange`. Give it a
 * handler that writes to a ref instead of to state and the surrounding dialog never re-renders
 * while someone types; only the input being typed in does. `defaultValue` is read once at
 * mount, so remount the fields (a changing `key`) when the dialog opens with new data.
 */

/** A labelled group of fields, so a form reads as a document rather than a loose stack. */
export const FormSection = memo(function FormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{
          display: 'block',
          color: 'text.secondary',
          fontWeight: 700,
          letterSpacing: '0.08em',
          mb: 1,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
});

/** Hoisted so they are not rebuilt, and re-serialized by emotion, on every render. */
const SHRINK_LABEL = { shrink: true } as const;
const DISPLAY_EMPTY = { displayEmpty: true } as const;

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A text input that owns its value. Every prop besides the two callbacks is a primitive, and
 * the callbacks are expected to be identity-stable, which together let React skip this
 * subtree whenever a different field changes.
 */
export const TextInput = memo(function TextInput({
  name,
  label,
  defaultValue,
  error,
  helperText,
  disabled,
  required,
  placeholder,
  type,
  multiline,
  minRows,
  autoFocus,
  onChange,
  onBlur,
}: {
  name: string;
  label: string;
  defaultValue: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  minRows?: number;
  autoFocus?: boolean;
  onChange: (name: string, value: string) => void;
  onBlur?: (name: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <TextField
      label={label}
      type={type}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange(name, e.target.value);
      }}
      onBlur={onBlur ? () => onBlur(name) : undefined}
      error={error}
      helperText={helperText}
      fullWidth
      required={required}
      disabled={disabled}
      placeholder={placeholder}
      multiline={multiline}
      minRows={minRows}
      autoFocus={autoFocus}
    />
  );
});

/**
 * Select counterpart. Unlike TextInput this one is controlled by the parent: a pick has to
 * re-render whatever depends on it, and picks are rare enough that the cost does not matter.
 * Pass a memoized `options` array so the identity check still holds.
 */
export const SelectInput = memo(function SelectInput({
  name,
  label,
  value,
  options,
  placeholderLabel,
  error,
  helperText,
  disabled,
  required,
  onChange,
  onBlur,
}: {
  name: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  /** Shown as a disabled first entry while there is no value yet. */
  placeholderLabel?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (name: string, value: string) => void;
  onBlur?: (name: string) => void;
}) {
  return (
    <TextField
      select
      label={label}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
      onBlur={onBlur ? () => onBlur(name) : undefined}
      error={error}
      helperText={helperText}
      fullWidth
      required={required}
      disabled={disabled}
      InputLabelProps={SHRINK_LABEL}
      SelectProps={DISPLAY_EMPTY}
    >
      {placeholderLabel && (
        <MenuItem value="" disabled>
          {placeholderLabel}
        </MenuItem>
      )}
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
});
