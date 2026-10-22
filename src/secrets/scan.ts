import { copyFailure } from '../core/errors';
import { PRIVATE_KEY, RULES } from './rules';
import { SECRET_KINDS, SECRET_LABELS, type SecretConfidence, type SecretFinding, type SecretKind } from './types';

/** Longest text scanned, in characters. Default 1,000,000; the rest is not scanned (`truncated`). */
export const DEFAULT_SECRET_SCAN_LENGTH = 1_000_000;

export interface ScanSecretsOptions {
  /** Kinds to look for. Default: every kind. */
  readonly kinds?: readonly SecretKind[];
  /** Least confidence reported. Default `'medium'`: everything. `'high'` leaves out guesses. */
  readonly minConfidence?: SecretConfidence;
  /** Longest text scanned, in characters. Default {@link DEFAULT_SECRET_SCAN_LENGTH}. */
  readonly maxLength?: number;
}

export interface SecretScan {
  /** In the order they appear; findings never overlap. */
  readonly findings: readonly SecretFinding[];
  /** The text was longer than `maxLength`: only its start was scanned. */
  readonly truncated: boolean;
}

/** A preview of `secret` safe to show: a known prefix and, where allowed, the last 4 characters. */
function mask(kind: SecretKind, secret: string, keep: number, tail: boolean): string {
  if (kind === 'private-key') return '-----BEGIN \u2026 PRIVATE KEY-----';
  const compact = kind === 'card-number' || kind === 'iban' ? secret.replace(/[ -]/g, '') : secret;
  if (kind === 'card-number') return `\u2022\u2022\u2022\u2022 ${compact.slice(-4)}`;
  if (!tail) return '\u2022'.repeat(8);
  // Short secrets show no more than their prefix: their last characters would give too much away.
  return compact.length - keep < 12 ? `${compact.slice(0, keep)}\u2026` : `${compact.slice(0, keep)}\u2026${compact.slice(-4)}`;
}

interface Candidate extends SecretFinding {
  readonly priority: number;
}

function finding(kind: SecretKind, confidence: SecretConfidence, start: number, secret: string, keep: number, tail: boolean, priority: number): Candidate {
  return { kind, label: SECRET_LABELS[kind], confidence, start, end: start + secret.length, masked: mask(kind, secret, keep, tail), priority };
}

/** Private keys: from their `BEGIN` line to their `END` line, or to the end of the text when it is cut off. */
function privateKeys(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(PRIVATE_KEY)) {
    const start = match.index;
    const endLine = /-----END [A-Z0-9 ]{0,80}-----/g;
    endLine.lastIndex = start + match[0].length;
    const end = endLine.exec(text);
    const stop = end === null ? text.length : end.index + end[0].length;
    found.push(finding('private-key', 'high', start, text.slice(start, stop), 0, false, -1));
  }
  return found;
}

/**
 * Finds secrets in `text`: keys and tokens of services by their documented formats, private
 * keys, passwords in URLs and connection strings, card numbers and IBANs by their checksums,
 * and random-looking values assigned to names such as `password` or `api_key`.
 *
 * Findings say where each secret is and what kind it is, with a masked preview; they never
 * hold the secret. Every pattern runs in linear time, so any text is safe to scan. Works
 * anywhere, including servers.
 *
 * @example
 * const { findings } = scanSecrets(pastedText);
 * if (findings.length > 0) warn(`This contains a ${findings[0].label}.`);
 *
 * @throws {CopyFailure} `invalid-payload` for an unknown kind or a negative `maxLength`.
 */
export function scanSecrets(text: string, options: ScanSecretsOptions = {}): SecretScan {
  const kinds = new Set(options.kinds ?? SECRET_KINDS);
  for (const kind of kinds) {
    if (!SECRET_KINDS.includes(kind)) throw copyFailure('invalid-payload', `Unknown secret kind: ${kind}.`);
  }
  const maxLength = options.maxLength ?? DEFAULT_SECRET_SCAN_LENGTH;
  if (!(maxLength >= 0)) throw copyFailure('invalid-payload', 'maxLength must be a number of at least 0.');
  const scanned = text.length > maxLength ? text.slice(0, maxLength) : text;
  const highOnly = options.minConfidence === 'high';

  const candidates: Candidate[] = kinds.has('private-key') ? privateKeys(scanned) : [];
  RULES.forEach((rule, priority) => {
    // One pattern can find two kinds (an AWS secret key, or a generic secret): both are checked below.
    if (!kinds.has(rule.kind) && !(rule.kind === 'generic-secret' && kinds.has('aws-secret-access-key'))) return;
    // Patterns are shared: the scan is synchronous, so resetting `lastIndex` is enough.
    const pattern = rule.pattern;
    pattern.lastIndex = 0;
    for (let match = pattern.exec(scanned); match !== null; match = pattern.exec(scanned)) {
      const secret = match[rule.group] as string;
      const start = match.index + match[0].length - secret.length;
      const verdict = rule.check(secret, match);
      const kind = verdict?.kind ?? rule.kind;
      if (verdict === null || !kinds.has(kind)) {
        if (rule.retry === true) pattern.lastIndex = start + 1;
        continue;
      }
      const value = secret.slice(0, verdict.length);
      const keep = typeof rule.keep === 'number' ? rule.keep : rule.keep(value);
      candidates.push(finding(kind, verdict.confidence, start, value, keep, rule.tail, priority));
      // What the match read past the secret (more digits after a card) is looked at again.
      pattern.lastIndex = start + verdict.length;
    }
  });

  // Overlapping findings: the earliest wins, then the most specific rule. A rule finds at most
  // one secret at a position, so no two candidates tie.
  candidates.sort((a, b) => a.start - b.start || a.priority - b.priority);
  const findings: SecretFinding[] = [];
  let reached = 0;
  for (const candidate of candidates) {
    if ((highOnly && candidate.confidence !== 'high') || candidate.start < reached) continue;
    const { kind, label, confidence, start, end, masked } = candidate;
    findings.push({ kind, label, confidence, start, end, masked });
    reached = end;
  }
  return { findings, truncated: scanned.length < text.length };
}
