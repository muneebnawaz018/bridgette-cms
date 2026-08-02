'use client';

import { useCallback, useRef, useState, type MutableRefObject } from 'react';

/*
 * Save-button state for the ref-backed dialogs.
 *
 * Those forms deliberately keep typed values in a ref so a keystroke re-renders only the input
 * being typed in (see components/form/fields). That means the dialog cannot simply read the
 * current values during render to decide whether Save should be enabled.
 *
 * So the two things the button actually depends on are tracked as booleans instead: `dirty`
 * (anything differs from what the form opened with) and `valid` (the whole form parses). They are
 * recomputed on every change but only written to state when one of them FLIPS, so typing still
 * costs zero dialog re-renders until the button's state genuinely changes.
 */

export interface FormGuard {
  /** Something differs from the values the form opened with. */
  dirty: boolean;
  /** The whole form currently parses. */
  valid: boolean;
  /** Recompute both. Call after writing to the values ref. */
  refresh: () => void;
  /** Reset to "opened with these values" — call when the dialog (re)opens. */
  reset: (values: unknown) => void;
  /** Why Save is disabled, or undefined when it is enabled. */
  reason: string | undefined;
}

/** Order-insensitive for arrays, so re-picking the same set is not a change. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    Array.isArray(v) ? [...(v as unknown[])].map(String).sort() : v,
  );
}

export function useFormGuard<T>({
  valuesRef,
  isValid,
}: {
  valuesRef: MutableRefObject<T>;
  /** True when the form as a whole is submittable. */
  isValid: (values: T) => boolean;
}): FormGuard {
  const baselineRef = useRef<string>('');
  const [dirty, setDirty] = useState(false);
  const [valid, setValid] = useState(false);

  const refresh = useCallback(() => {
    const values = valuesRef.current;
    const nextDirty = stable(values) !== baselineRef.current;
    const nextValid = isValid(values);
    // Only a flip reaches state — a keystroke that changes neither costs no render.
    setDirty((d) => (d === nextDirty ? d : nextDirty));
    setValid((v) => (v === nextValid ? v : nextValid));
  }, [valuesRef, isValid]);

  const reset = useCallback(
    (values: unknown) => {
      baselineRef.current = stable(values);
      setDirty(false);
      setValid(isValid(values as T));
    },
    [isValid],
  );

  return {
    dirty,
    valid,
    refresh,
    reset,
    // Order matters: an untouched form is "nothing to save" even if it is also incomplete,
    // because that is the more useful thing to say about it.
    reason: dirty ? (valid ? undefined : 'Fill the highlighted fields') : 'No changes to save',
  };
}
