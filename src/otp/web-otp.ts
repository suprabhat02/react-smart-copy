/**
 * Where filling a code from an SMS (the WebOTP API) stands.
 *
 * - `idle`: not asked for.
 * - `waiting`: the browser is waiting for an SMS that ends with `@your.host #code`.
 * - `received`: it came, and filled the field.
 * - `unsupported`: this browser has no WebOTP API (only Chrome on Android has).
 * - `failed`: the browser refused or gave up (no permission, a timeout, an insecure page).
 * - `aborted`: the field was detached before an SMS came.
 */
export type WebOtpStatus = 'idle' | 'waiting' | 'received' | 'unsupported' | 'failed' | 'aborted';

export type WebOtpResult = { readonly status: 'received'; readonly code: string } | { readonly status: 'unsupported' | 'failed' };

/** The parts of the Credential Management API the WebOTP API adds. */
interface OtpCredentials {
  get(options: { readonly otp: { readonly transport: readonly string[] }; readonly signal: AbortSignal }): Promise<{ readonly code?: unknown } | null>;
}

/** Asks the browser for the code of an SMS sent to this device, until `signal` aborts. Never rejects. */
export async function receiveWebOtp(signal: AbortSignal): Promise<WebOtpResult> {
  const credentials = (globalThis as { navigator?: { credentials?: OtpCredentials } }).navigator?.credentials;
  if (typeof (globalThis as { OTPCredential?: unknown }).OTPCredential === 'undefined' || credentials === undefined) return { status: 'unsupported' };
  try {
    const credential = await credentials.get({ otp: { transport: ['sms'] }, signal });
    return typeof credential?.code === 'string' ? { status: 'received', code: credential.code } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
