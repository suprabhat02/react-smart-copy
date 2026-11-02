import { copyFailure } from './errors';

/**
 * A limit option read: `fallback` when it was not given, otherwise a positive whole number
 * or `Infinity`. Every `max*` option of the library is checked by this one rule.
 *
 * @throws {CopyFailure} `invalid-payload` for zero, a negative or fractional number, or `NaN`.
 */
export function positiveLimit(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (value === Infinity || (Number.isInteger(value) && value > 0)) return value;
  throw copyFailure('invalid-payload', `\`${name}\` must be a positive integer or Infinity (received ${String(value)}).`);
}
