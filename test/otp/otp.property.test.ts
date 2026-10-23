import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractOtp } from '../../src/otp';
import { emptyChars, inputStep, keyStep, pasteStep, setStep, type OtpKey, type OtpSettings } from '../../src/otp/state';
import { runs } from '../property';

const digits = (min: number, max: number) => fc.stringMatching(new RegExp(`^[0-9]{${String(min)},${String(max)}}$`));

/** Message text with no number in it. */
const words = fc
  .array(fc.constantFrom('hello', 'please', 'do not share', 'team', 'thanks', 'valid', 'for', 'minutes', 'your', 'account', 'is', '.', ',', '!'), { maxLength: 12 })
  .map((parts) => parts.join(' '));

describe('extractOtp, for any text', () => {
  it('never throws, and any code it gives fits the asked length and alphabet', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 300 }), fc.constantFrom('numeric' as const, 'alphanumeric' as const), (text, alphabet) => {
        const match = extractOtp(text, { alphabet });
        if (match === null) return;
        expect(match.code.length).toBeGreaterThanOrEqual(4);
        expect(match.code.length).toBeLessThanOrEqual(8);
        expect(match.code).toMatch(alphabet === 'numeric' ? /^[0-9]+$/ : /^[0-9A-Z]+$/);
      }),
      runs(500),
    );
  });

  it('reads any code pasted on its own, with or without separators', () => {
    fc.assert(
      fc.property(digits(4, 8), fc.constantFrom('', ' ', '-'), (code, separator) => {
        const half = Math.floor(code.length / 2);
        const text = half >= 2 && code.length - half >= 2 ? `${code.slice(0, half)}${separator}${code.slice(half)}` : code;
        expect(extractOtp(`  ${text}\n`)).toEqual({ code, source: 'whole-text', confidence: 'high', domain: null });
      }),
      runs(300),
    );
  });

  it('finds the code after a keyword, whatever the message around it', () => {
    fc.assert(
      fc.property(words, fc.constantFrom('Your code is', 'OTP:', 'Verification code', 'Use this one-time password:', 'PIN'), digits(4, 8), words, (before, keyword, code, after) => {
        expect(extractOtp(`${before} ${keyword} ${code}. ${after}`)?.code).toBe(code);
      }),
      runs(300),
    );
  });
});

describe('the code field reducer, for any sequence of actions', () => {
  const action = fc.oneof(
    fc.record({ kind: fc.constant('input' as const), text: fc.string({ maxLength: 10 }), previousFromBox: fc.boolean() }),
    fc.record({ kind: fc.constant('paste' as const), text: fc.oneof(digits(0, 10), fc.string({ maxLength: 40 })) }),
    fc.record({ kind: fc.constant('key' as const), key: fc.constantFrom<OtpKey>('Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End') }),
    fc.record({ kind: fc.constant('set' as const), text: fc.string({ maxLength: 12 }) }),
  );

  it('keeps one valid character or none per box, and focus on a box', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), fc.constantFrom('numeric' as const, 'alphanumeric' as const), fc.array(action, { maxLength: 30 }), (length, alphabet, actions) => {
        const settings: OtpSettings = { length, alphabet };
        let chars = emptyChars(length);
        let focus = 0;
        for (const step of actions) {
          const next =
            step.kind === 'input'
              ? inputStep(chars, focus, step.previousFromBox ? (chars[focus] as string) : '', step.text, settings)
              : step.kind === 'paste'
                ? pasteStep(chars, focus, step.text, settings)
                : step.kind === 'key'
                  ? keyStep(chars, focus, step.key, settings)
                  : setStep(step.text, settings);
          chars = next.chars;
          focus = next.focus;
          expect(chars).toHaveLength(length);
          for (const char of chars) expect(char).toMatch(alphabet === 'numeric' ? /^[0-9]?$/ : /^[0-9A-Z]?$/);
          expect(focus).toBeGreaterThanOrEqual(0);
          expect(focus).toBeLessThan(length);
        }
      }),
      runs(400),
    );
  });

  it('fills the field from any box with a pasted code of its length', () => {
    fc.assert(
      fc.property(digits(6, 6), fc.integer({ min: 0, max: 5 }), (code, index) => {
        expect(pasteStep(emptyChars(6), index, code, { length: 6, alphabet: 'numeric' }).chars.join('')).toBe(code);
      }),
      runs(200),
    );
  });
});
