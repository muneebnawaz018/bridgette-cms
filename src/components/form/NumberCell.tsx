'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A bare numeric input for the invoice template, where the field IS the document (no MUI chrome).
 *
 * It exists because `value={n} onChange={e => set(Number(e.target.value))}` is wrong in a way that
 * only shows up while typing. Clearing the box hands back `''`, `Number('')` is `0`, and the zero
 * is written straight back into the field the user just emptied. The caret then sits before it,
 * so the next keystroke reads as `01`, then `011`, and so on.
 *
 * The fix is to keep what was typed as text and report the number separately. An empty box stays
 * empty on screen while the total behind it treats the field as zero, which is what an empty
 * amount means anyway. The text is only overwritten from the outside when the incoming number
 * genuinely differs from what is displayed, so a fresh render cannot reformat a half-typed value.
 */
export function NumberCell({
  value,
  onChange,
  className,
  disabled,
  min,
  max,
  step,
  'aria-label': ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  'aria-label'?: string;
}) {
  const [text, setText] = useState(() => String(value ?? 0));
  // What this input last reported. Lets an outside change (picking a product, resetting the form)
  // be told apart from the echo of our own onChange.
  const reported = useRef(value);

  useEffect(() => {
    if (value === reported.current) return;
    reported.current = value;
    setText(String(value ?? 0));
  }, [value]);

  function handle(raw: string) {
    setText(raw);
    // A blank field counts as zero for the totals without a zero being forced into the box.
    const next = raw.trim() === '' ? 0 : Number(raw);
    if (!Number.isFinite(next)) return;
    const clamped = Math.min(Math.max(next, min ?? -Infinity), max ?? Infinity);
    reported.current = clamped;
    onChange(clamped);
  }

  /*
   * Tidy up once the field is left, not while it is being used. `007` and `1.` are legitimate
   * things to have on screen mid-edit; they are only wrong once the user has moved on.
   */
  function normalize() {
    const n = text.trim() === '' ? 0 : Number(text);
    setText(Number.isFinite(n) ? String(n) : '0');
  }

  return (
    <input
      className={className}
      type="number"
      inputMode="decimal"
      value={text}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => handle(e.target.value)}
      onBlur={normalize}
    />
  );
}
