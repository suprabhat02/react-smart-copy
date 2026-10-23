// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { emptyChars, inputStep, keyStep, pasteStep, setStep, type OtpSettings } from '../../src/otp/state';

const six: OtpSettings = { length: 6, alphabet: 'numeric' };
const chars = (text: string): string[] => Array.from(text.padEnd(6, '.'), (char) => (char === '.' ? '' : char));
const show = (step: { readonly chars: readonly string[]; readonly focus: number }): string => `${step.chars.map((char) => char || '.').join('')}@${String(step.focus)}`;

describe('inputStep', () => {
  it('writes a typed character and moves to the next box', () => {
    expect(show(inputStep(emptyChars(6), 0, '', '4', six))).toBe('4.....@1');
    expect(show(inputStep(chars('48'), 2, '', '2', six))).toBe('482...@3');
    expect(show(inputStep(chars('48291'), 5, '', '3', six))).toBe('482913@5');
  });

  it('replaces the character a box held, whichever side the new one was typed on', () => {
    expect(show(inputStep(chars('4'), 0, '4', '47', six))).toBe('7.....@1');
    expect(show(inputStep(chars('4'), 0, '4', '74', six))).toBe('7.....@1');
    expect(show(inputStep(chars('4'), 0, '4', '7', six))).toBe('7.....@1');
    expect(show(inputStep(chars('4'), 0, '4', '4', six))).toBe('4.....@1');
    // Two new characters (an input method): both are written.
    expect(show(inputStep(chars('4'), 0, '4', '57', six))).toBe('57....@2');
  });

  it('spreads several characters over the next boxes, and a whole code over all of them', () => {
    expect(show(inputStep(emptyChars(6), 2, '', '913', six))).toBe('..913.@5');
    expect(show(inputStep(emptyChars(6), 4, '', '9137', six))).toBe('....91@5');
    // An SMS autofill puts the whole code in one box (iOS puts it in the first).
    expect(show(inputStep(chars('1'), 3, '', '482913', six))).toBe('482913@5');
    expect(show(inputStep(emptyChars(6), 0, '', '482 913', six))).toBe('482913@5');
  });

  it('ignores characters a code cannot have, and empties a cleared box', () => {
    expect(show(inputStep(chars('48'), 2, '', 'x', six))).toBe('48....@2');
    expect(show(inputStep(chars('48'), 1, '8', '', six))).toBe('4.....@1');
    expect(show(inputStep(chars('48'), 1, '8', '8x', six))).toBe('48....@1');
  });

  it('reads digits of other scripts, and upper-cases alphanumeric codes', () => {
    expect(show(inputStep(emptyChars(6), 0, '', '\u096A', six))).toBe('4.....@1');
    expect(inputStep(emptyChars(4), 0, '', 'k7', { length: 4, alphabet: 'alphanumeric' }).chars).toEqual(['K', '7', '', '']);
  });
});

describe('pasteStep', () => {
  it('fills every box with the code in what was pasted, wherever it was pasted', () => {
    expect(show(pasteStep(emptyChars(6), 3, 'Your code is 482913.', six))).toBe('482913@5');
    expect(show(pasteStep(chars('111111'), 0, '482-913', six))).toBe('482913@5');
  });

  it('writes a part of a code from the box it was pasted in', () => {
    expect(show(pasteStep(chars('48'), 2, '29', six))).toBe('4829..@4');
  });

  it('ignores a paste with no code in it', () => {
    expect(show(pasteStep(chars('48'), 2, 'hello', six))).toBe('48....@2');
    expect(show(pasteStep(chars('48'), 2, 'Numbers 123456 and 654321', six))).toBe('48....@2');
    expect(show(pasteStep(chars('48'), 2, '', six))).toBe('48....@2');
  });
});

describe('keyStep', () => {
  it('deletes backwards from an empty box, and in place from a full one', () => {
    expect(show(keyStep(chars('482'), 3, 'Backspace', six))).toBe('48....@2');
    expect(show(keyStep(chars('482'), 2, 'Backspace', six))).toBe('48....@2');
    expect(show(keyStep(emptyChars(6), 0, 'Backspace', six))).toBe('......@0');
    expect(show(keyStep(chars('482'), 1, 'Delete', six))).toBe('4.2...@1');
  });

  it('moves between boxes', () => {
    expect(keyStep(chars('482'), 2, 'ArrowLeft', six).focus).toBe(1);
    expect(keyStep(chars('482'), 0, 'ArrowLeft', six).focus).toBe(0);
    expect(keyStep(chars('482'), 2, 'ArrowRight', six).focus).toBe(3);
    expect(keyStep(chars('482'), 5, 'ArrowRight', six).focus).toBe(5);
    expect(keyStep(chars('482'), 4, 'Home', six).focus).toBe(0);
    expect(keyStep(chars('482'), 0, 'End', six).focus).toBe(3);
    expect(keyStep(chars('482913'), 0, 'End', six).focus).toBe(5);
  });
});

describe('setStep', () => {
  it('writes a code from the first box, dropping what a code cannot have', () => {
    expect(show(setStep('482913', six))).toBe('482913@5');
    expect(show(setStep('48', six))).toBe('48....@2');
    expect(show(setStep('4-8x29', six))).toBe('4829..@4');
    expect(show(setStep('48291399', six))).toBe('482913@5');
    expect(show(setStep('', six))).toBe('......@0');
  });
});
