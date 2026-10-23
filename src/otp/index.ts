/**
 * `react-smart-copy/otp`
 *
 * One-time codes, pasted and autofilled the way people expect: the code in an SMS or an
 * e-mail they paste, and a field of single-character boxes that a paste, an SMS autofill or
 * the WebOTP API fills at once. Framework-agnostic (`useOtpField` in the React entry is the
 * same field, for React) and free of dependencies.
 *
 * - {@link extractOtp}: the code in a message, never a price, a date or a phone number.
 * - {@link createOtpField}: the boxes' typing, pasting, autofill, keys and accessibility.
 * - {@link normalizeOtpText}: digits of any script, and full-width characters, as ASCII.
 *
 * @module
 */

export { extractOtp, OTP_SCAN_LENGTH, type ExtractOtpOptions, type OtpMatch, type OtpSource } from './extract';
export { createOtpField, type OtpField, type OtpFieldOptions, type OtpSnapshot } from './field';
export { normalizeOtpText, type OtpAlphabet } from './normalize';
export type { WebOtpStatus } from './web-otp';
