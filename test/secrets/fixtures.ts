/**
 * Fake secrets for the tests, built at run time: no string in this repository looks like a
 * real credential to secret scanners, and none of these grant access to anything.
 */

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** `length` characters from `alphabet`, the same every run (a small linear congruential generator). */
export function random(length: number, alphabet = ALNUM, seed = 7): string {
  let state = seed;
  let out = '';
  for (let index = 0; index < length; index += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out += alphabet.charAt((state >>> 16) % alphabet.length);
  }
  return out;
}

const join = (...parts: readonly string[]): string => parts.join('');
const UPPER32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const HEX = '0123456789abcdef';
const BASE64 = `${ALNUM}+/`;
const URLSAFE = `${ALNUM}_-`;

const base64url = (text: string): string => Buffer.from(text).toString('base64url');

/** One fake of each kind (by kind name), as it appears in the wild. */
export const FAKES = {
  awsAccessKeyId: join('AK', 'IA', random(16, UPPER32, 1)),
  awsSecretAccessKey: random(40, BASE64, 2),
  githubToken: join('gh', 'p_', random(36, ALNUM, 3)),
  githubFineGrained: join('github', '_pat_', random(22, ALNUM, 4), '_', random(59, ALNUM, 5)),
  gitlabToken: join('gl', 'pat-', random(20, URLSAFE, 6)),
  slackToken: join('xo', 'xb-', random(12, '0123456789', 7), '-', random(12, '0123456789', 8), '-', random(24, ALNUM, 9)),
  slackWebhook: join('https://hooks.', 'slack.com/services/T', random(8, UPPER32, 10), '/B', random(8, UPPER32, 11), '/', random(24, ALNUM, 12)),
  stripeKey: join('sk', '_live_', random(24, ALNUM, 13)),
  googleApiKey: join('AI', 'za', random(35, URLSAFE, 14)),
  npmToken: join('np', 'm_', random(36, ALNUM, 18)),
  pypiToken: join('py', 'pi-AgEIcHlwaS5vcmc', random(60, URLSAFE, 19)),
  sendgridKey: join('S', 'G.', random(22, URLSAFE, 20), '.', random(43, URLSAFE, 21)),
  twilioKey: join('S', 'K', random(32, HEX, 22)),
  azureStorageKey: `${random(86, BASE64, 23)}==`,
  jwt: join(base64url('{"alg":"HS256","typ":"JWT"}'), '.', base64url('{"sub":"1234567890","name":"Test"}'), '.', random(43, URLSAFE, 24)),
  privateKey: join('-----BEGIN RSA PRIV', 'ATE KEY-----\n', random(64, BASE64, 25), '\n', random(64, BASE64, 26), '\n-----END RSA PRIV', 'ATE KEY-----'),
  // Card brands' published test numbers: valid checksums, never real cards.
  visa: '4242 4242 4242 4242',
  visaPlain: '4111111111111111',
  amex: '3782 822463 10005',
  mastercard: '5555-5555-5555-4444',
  iban: 'DE89 3704 0044 0532 0130 00',
  ibanCompact: 'GB82WEST12345698765432',
} as const;
