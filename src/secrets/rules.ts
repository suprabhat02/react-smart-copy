import { isCardNumber, isIban, isJwtHeader, looksSecret } from './checks';
import type { SecretConfidence, SecretKind } from './types';

/** A rule's verdict on a candidate: how sure it is, and how much of the candidate is the secret. */
export interface Verdict {
  readonly confidence: SecretConfidence;
  /** Characters of the candidate that are the secret (a card number followed by more digits). */
  readonly length: number;
  /** The kind, when one pattern finds two (an AWS secret key, or a generic secret). */
  readonly kind?: SecretKind;
}

/**
 * One way to find a kind of secret. Every pattern is global and linear: bounded repeats,
 * no nested quantifiers, no lookbehind (older Safari). Group `group` is the secret, and it
 * ends the match: whatever follows is only looked ahead at, so the secret's start is the
 * match's end minus its length. The scan goes on right after each secret found.
 */
export interface Rule {
  readonly kind: SecretKind;
  readonly pattern: RegExp;
  readonly group: number;
  /** Characters of the secret a preview may show at the start: its known prefix. */
  readonly keep: number | ((secret: string) => number);
  /** Whether a preview may show the last 4 characters (never for passwords). */
  readonly tail: boolean;
  readonly check: (secret: string, match: RegExpMatchArray) => Verdict | null;
  /**
   * When `check` turns a match down, look again from the character after its start: a short
   * candidate (a card, an IBAN) can run into the next one. Other rules go on after the match.
   */
  readonly retry?: boolean;
}

const high = (secret: string): Verdict => ({ confidence: 'high', length: secret.length });
const medium = (secret: string): Verdict => ({ confidence: 'medium', length: secret.length });

/** Start of a token: the start of the text, or a character that can't be part of one. */
const B = '(^|[^A-Za-z0-9_])';
/** After a token: nothing that could continue it. */
const E = '(?![A-Za-z0-9_])';

const token = (kind: SecretKind, body: string, keep: Rule['keep'], options: { readonly end?: string; readonly flags?: string; readonly confidence?: SecretConfidence } = {}): Rule => ({
  kind,
  pattern: new RegExp(`${B}(${body})${options.end ?? E}`, `g${options.flags ?? ''}`),
  group: 2,
  keep,
  tail: true,
  check: options.confidence === 'medium' ? medium : high,
});

/** A name, an assignment (`=`, `:`, `=>`, `:=`) and a value: `API_KEY="..."`, `"password": "..."`. */
const ASSIGNMENT = /(^|[^A-Za-z0-9_])(["']?([A-Za-z_][A-Za-z0-9_.-]{0,63})["']?\s{0,8}(?:=>|:=|[:=])\s{0,8}["'`]?)([^\s"'`,;()[\]{}<>]{8,200})/g;

/** Names that hold secrets, at the end of the name: `password`, `GITHUB_TOKEN`, `db.apiKey`. */
const SECRET_NAME = /(?:pass(?:word|wd|phrase)?|pwd|secret|token|api[_.-]?key|access[_.-]?key|private[_.-]?key|auth[_.-]?key|credentials?|client[_.-]?secret|signing[_.-]?key)$/i;

/**
 * A card number, grouped as cards print it or not. The last group is tried without itself
 * too: what follows a card is often more digits (`4242 4242 4242 4242 12/26`, a date).
 */
function card(candidate: string): Verdict | null {
  if (isCardNumber(candidate)) return { confidence: /[ -]/.test(candidate) ? 'high' : 'medium', length: candidate.length };
  const cut = candidate.search(/[ -]\d{1,4}$/);
  return cut !== -1 && isCardNumber(candidate.slice(0, cut)) ? { confidence: 'high', length: cut } : null;
}

/** An IBAN, cut to its country's length: what follows (a BIC, a word) is not part of it. */
function iban(candidate: string): Verdict | null {
  let letters = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    if (candidate[index] !== ' ') letters += 1;
    // Each possible length is tried as the end: the checksum and country length decide.
    if (letters >= 15 && (index + 1 === candidate.length || candidate[index + 1] === ' ') && isIban(candidate.slice(0, index + 1))) {
      return { confidence: 'high', length: index + 1 };
    }
  }
  return null;
}

/** Rules in priority order: when findings overlap, the earlier rule's finding is kept. */
export const RULES: readonly Rule[] = [
  token('aws-access-key-id', '(?:AKIA|ASIA|ABIA|ACCA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|APKA)[A-Z2-7]{16}', 4),
  token('github-token', '(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}', (secret) => secret.indexOf('_') + (secret.startsWith('github_pat_') ? 5 : 1)),
  token('gitlab-token', 'glpat-[A-Za-z0-9_-]{20,64}', 6, { end: '(?![A-Za-z0-9_-])' }),
  token('slack-webhook', 'https://hooks\\.slack\\.com/services/[A-Z0-9]{8,12}/[A-Z0-9]{8,12}/[A-Za-z0-9]{24}', 33),
  token('slack-token', 'xox[abposr]-[A-Za-z0-9-]{10,250}', 5, { end: '(?![A-Za-z0-9-])' }),
  token('stripe-key', '(?:sk|rk)_live_[A-Za-z0-9]{24,247}', 8),
  token('google-api-key', 'AIza[A-Za-z0-9_-]{35}', 4, { end: '(?![A-Za-z0-9_-])' }),
  token('openai-key', 'sk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,250}|sk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}', (secret) => secret.lastIndexOf('-', 12) + 1, {
    end: '(?![A-Za-z0-9_-])',
  }),
  token('npm-token', 'npm_[A-Za-z0-9]{36}', 4),
  token('pypi-token', 'pypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,1000}', 5, { end: '(?![A-Za-z0-9_-])' }),
  token('sendgrid-key', 'SG\\.[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}', 3, { end: '(?![A-Za-z0-9_-])' }),
  {
    kind: 'jwt',
    pattern: /(^|[^A-Za-z0-9_-])(eyJ[A-Za-z0-9_-]{8,4000}\.eyJ[A-Za-z0-9_-]{8,16000}\.[A-Za-z0-9_-]{16,4000})(?![A-Za-z0-9_-])/g,
    group: 2,
    keep: 3,
    tail: true,
    check: (secret) => (isJwtHeader(secret.slice(0, secret.indexOf('.'))) ? high(secret) : null),
  },
  {
    kind: 'azure-storage-key',
    pattern: /(^|[;\s"'])(AccountKey\s{0,4}=\s{0,4})([A-Za-z0-9+/]{86}==)/gi,
    group: 3,
    keep: 0,
    tail: false,
    check: high,
  },
  {
    kind: 'url-credentials',
    // `scheme://user:password@`: the password, up to the `@`.
    pattern: /((?:^|[^A-Za-z0-9+.-])[A-Za-z][A-Za-z0-9+.-]{1,30}:\/\/[^\s:/?#@]{0,256}:)([^\s/?#@]{1,256})(?=@)/g,
    group: 2,
    keep: 0,
    tail: false,
    check: (secret) => (looksSecret(secret, 0) ? high(secret) : null),
  },
  {
    kind: 'connection-string',
    // `;Password=...` in an ADO.NET or ODBC connection string.
    pattern: /(;\s{0,4}(?:password|pwd)\s{0,4}=\s{0,4})([^;'"\s]{1,256})/gi,
    group: 2,
    keep: 0,
    tail: false,
    check: (secret) => (looksSecret(secret, 0) ? high(secret) : null),
  },
  token('twilio-key', 'SK[0-9a-fA-F]{32}', 2, { confidence: 'medium' }),
  {
    kind: 'card-number',
    // Grouped 4-6-5 (American Express), in fours (with a short group after), or not grouped.
    pattern: /(^|[^0-9A-Za-z])(\d{4}[ -]\d{6}[ -]\d{5}|\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,4})?|\d{13,19})(?![0-9])/g,
    group: 2,
    keep: 0,
    tail: true,
    check: card,
    retry: true,
  },
  {
    kind: 'iban',
    pattern: /(^|[^A-Za-z0-9])([A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,40})(?![A-Za-z0-9])/g,
    group: 2,
    keep: 2,
    tail: true,
    check: iban,
    retry: true,
  },
  {
    kind: 'generic-secret',
    pattern: ASSIGNMENT,
    group: 4,
    keep: 0,
    tail: false,
    check: (secret, match) => {
      const name = match[3] as string;
      // An AWS secret key: 40 characters of base64, named for both.
      if (/^[A-Za-z0-9/+]{40}$/.test(secret) && /aws/i.test(name) && /secret/i.test(name)) {
        return { kind: 'aws-secret-access-key', confidence: 'medium', length: secret.length };
      }
      return SECRET_NAME.test(name) && looksSecret(secret, 3) ? medium(secret) : null;
    },
  },
];

/** `-----BEGIN ... PRIVATE KEY-----`, through its `END` line (or the end of the text, when cut off). */
export const PRIVATE_KEY = /-----BEGIN (?:[A-Z0-9]{1,16} ){0,3}PRIVATE KEY(?: BLOCK)?-----/g;
