import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { redactSecrets, scanSecrets, SECRET_KINDS } from '../../src/secrets';
import { runs } from '../property';
import { FAKES } from './fixtures';

/** Text made of the characters secrets are made of, and the punctuation around them. */
const noisy = fc.string({
  unit: fc.constantFrom(...'aAkKiI0189 -_.:=;@/"\'\n\t{}[]eyJSGxobpghAKIA'.split(''), 'AKIA', 'ghp_', 'eyJ', 'sk_live_', '://', 'Password=', '-----BEGIN ', 'PRIVATE KEY-----', '4242 '),
  maxLength: 400,
});

/** Ordinary prose: words, numbers and punctuation, with no secret in it. */
const prose = fc
  .array(fc.oneof(fc.constantFrom('the', 'build', 'failed', 'on', 'line', 'see', 'logs', 'ok', 'deploy', 'v1.2.3', '2026-10-22', '42', '(x)', '-', ':'), fc.stringMatching(/^[a-z]{1,8}$/)), { maxLength: 30 })
  .map((words) => words.join(' '));

const fakes = Object.entries(FAKES).filter(([name]) => !['awsSecretAccessKey', 'azureStorageKey'].includes(name));

describe('scanSecrets, for any text', () => {
  it('never throws, and reports findings in order, apart, inside the text, masked', () => {
    fc.assert(
      fc.property(fc.oneof(noisy, fc.string({ maxLength: 300 }), fc.string({ unit: 'binary', maxLength: 200 })), (text) => {
        const { findings } = scanSecrets(text);
        let reached = 0;
        for (const finding of findings) {
          expect(SECRET_KINDS).toContain(finding.kind);
          expect(finding.start).toBeGreaterThanOrEqual(reached);
          expect(finding.end).toBeGreaterThan(finding.start);
          expect(finding.end).toBeLessThanOrEqual(text.length);
          const secret = text.slice(finding.start, finding.end);
          // A private key's preview is a fixed text; every other preview shows at most a prefix and 4 characters.
          if (secret.length >= 24 && finding.kind !== 'private-key') expect(finding.masked).not.toContain(secret.slice(secret.length / 2 - 4, secret.length / 2 + 4));
          reached = finding.end;
        }
      }),
      runs(500),
    );
  });

  it('finds a secret wherever it is put in prose, exactly', () => {
    fc.assert(
      fc.property(prose, fc.constantFrom(...fakes), prose, fc.constantFrom(' ', '\n', ': ', ' (', '\t'), (before, [, secret], after, separator) => {
        const text = `${before}${separator}${secret}${separator === ' (' ? ')' : ' '}${after}`;
        const at = before.length + separator.length;
        const hit = scanSecrets(text).findings.find((finding) => finding.start === at);
        expect(hit, `${secret} in ${JSON.stringify(text)}`).toBeDefined();
        expect(hit?.end).toBe(at + secret.length);
      }),
      runs(300),
    );
  });

  it('finds nothing in prose', () => {
    fc.assert(
      fc.property(prose, (text) => {
        expect(scanSecrets(text).findings).toEqual([]);
      }),
      runs(300),
    );
  });
});

describe('redactSecrets, for any text with secrets', () => {
  it('leaves none of them behind, and nothing new to find', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(prose, fc.constantFrom(...fakes)), { maxLength: 6 }), prose, (parts, tail) => {
        const text = `${parts.map(([words, [, secret]]) => `${words} ${secret} `).join('')}${tail}`;
        const redacted = redactSecrets(text);
        for (const [, [, secret]] of parts) expect(redacted.text).not.toContain(secret);
        expect(scanSecrets(redacted.text).findings).toEqual([]);
        expect(redactSecrets(redacted.text).text).toBe(redacted.text);
      }),
      runs(200),
    );
  });
});
