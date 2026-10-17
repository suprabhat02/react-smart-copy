/**
 * UTF-8 ⇄ base64url without padding. The alphabet (`A–Z a–z 0–9 - _`) needs no
 * escaping in HTML attributes, survives every clipboard sanitiser we target, and is
 * a closed set, so the envelope can be found with a strict token match instead of
 * parsing untrusted HTML.
 */

const CHUNK = 0x8000;

export function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE64URL = /^[A-Za-z0-9_-]*$/;

/** Decodes base64url to text. Throws on a malformed token or invalid UTF-8. */
export function decodeBase64Url(token: string): string {
  if (!BASE64URL.test(token) || token.length % 4 === 1) throw new TypeError('Malformed base64url token.');
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (token.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Upper bound of the bytes a base64url token decodes to, without decoding it. */
export const decodedSize = (token: string): number => Math.floor((token.length * 3) / 4);
