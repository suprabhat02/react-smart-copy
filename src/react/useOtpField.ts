import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createOtpField, type OtpField, type OtpFieldOptions, type OtpSnapshot } from '../otp/field';
import { useIsomorphicLayoutEffect } from './utils';

export type UseOtpFieldOptions = OtpFieldOptions;

/** Props for one box: spread them on an `<input>`. The field sets its value; don't pass `value`. */
export interface OtpInputProps {
  readonly ref: (element: HTMLInputElement | null) => void;
  readonly type: 'text';
  readonly autoComplete: 'one-time-code' | 'off';
  readonly inputMode: 'numeric' | 'text';
  readonly 'aria-label': string;
  readonly autoCapitalize: 'off' | 'characters';
  readonly spellCheck: false;
  readonly pattern?: string;
}

export interface UseOtpFieldResult extends OtpSnapshot {
  /** Props for box `index` (0 to `length - 1`). Render one `<input>` for each. */
  readonly getInputProps: (index: number) => OtpInputProps;
  /** Fills the boxes with `code` from the first. Stable identity. */
  readonly setValue: (code: string) => void;
  /** Empties every box and focuses the first. Stable identity. */
  readonly clear: () => void;
  /** Focuses the first empty box. Stable identity. */
  readonly focus: () => void;
}

const defaultLabel = (numeric: boolean) => (index: number, length: number) => `${numeric ? 'Digit' : 'Character'} ${String(index + 1)} of ${String(length)}`;

/**
 * A one-time code field of single-character boxes, headless: typing moves to the next box
 * and Backspace to the one before; pasting a code (or an SMS holding one) into any box
 * fills them all; an SMS autofill (iOS, Android) and, with `webOtp`, the WebOTP API do too.
 * Every box has an accessible name; name the group around them.
 *
 * `length`, `alphabet` and `webOtp` are read when the field is made: a change makes a new,
 * empty field. Callbacks and `label` may change on every render.
 *
 * @example
 * const otp = useOtpField({ length: 6, onComplete: (code) => void verify(code) });
 * <div role="group" aria-label="Verification code">
 *   {Array.from({ length: 6 }, (_, index) => <input key={index} {...otp.getInputProps(index)} />)}
 * </div>
 */
export function useOtpField(options: UseOtpFieldOptions = {}): UseOtpFieldResult {
  const latest = useRef(options);
  useIsomorphicLayoutEffect(() => {
    latest.current = options;
  });
  const length = options.length ?? 6;
  const alphabet = options.alphabet ?? 'numeric';
  const webOtp = options.webOtp === true;

  const field: OtpField = useMemo(
    () =>
      createOtpField({
        length,
        alphabet,
        webOtp,
        label: (index, total) => (latest.current.label ?? defaultLabel(alphabet === 'numeric'))(index, total),
        onChange: (snapshot) => latest.current.onChange?.(snapshot),
        onComplete: (code) => latest.current.onComplete?.(code),
      }),
    [length, alphabet, webOtp],
  );
  const snapshot = useSyncExternalStore(field.subscribe, field.getSnapshot, field.getSnapshot);

  // The boxes, by index, as React mounts them; attached to the field once they are all there.
  const elements = useRef<(HTMLInputElement | null)[]>([]);
  const refs = useMemo(
    () =>
      Array.from({ length }, (_, index) => (element: HTMLInputElement | null) => {
        elements.current[index] = element;
      }),
    [length],
  );
  const attached = useRef<{ readonly field: OtpField; readonly inputs: readonly HTMLInputElement[]; readonly detach: () => void } | null>(null);
  useIsomorphicLayoutEffect(() => {
    const inputs = elements.current.slice(0, length).filter((element): element is HTMLInputElement => element !== null);
    const current = attached.current;
    const same = current !== null && current.field === field && current.inputs.length === inputs.length && current.inputs.every((input, index) => input === inputs[index]);
    if (same) return;
    current?.detach();
    attached.current = inputs.length === length ? { field, inputs, detach: field.attach(inputs) } : null;
  });
  useEffect(
    () => () => {
      attached.current?.detach();
      attached.current = null;
    },
    [],
  );

  // This render's label: the props are rendered now, before the latest options are stored.
  const labelOf = options.label;
  const getInputProps = useCallback(
    (index: number): OtpInputProps => {
      const numeric = alphabet === 'numeric';
      const label = (labelOf ?? defaultLabel(numeric))(index, length);
      return {
        ref: refs[index] ?? (() => undefined),
        type: 'text',
        autoComplete: index === 0 ? 'one-time-code' : 'off',
        inputMode: numeric ? 'numeric' : 'text',
        'aria-label': label,
        autoCapitalize: numeric ? 'off' : 'characters',
        spellCheck: false,
        ...(numeric ? { pattern: '[0-9]*' } : {}),
      };
    },
    [alphabet, length, refs, labelOf],
  );

  return {
    ...snapshot,
    getInputProps,
    setValue: field.setValue,
    clear: field.clear,
    focus: field.focus,
  };
}
