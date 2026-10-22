// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { entropy, isCardNumber, isIban, isJwtHeader, looksSecret, luhn } from '../../src/secrets/checks';
import { DEFAULT_SECRET_SCAN_LENGTH, SECRET_KINDS, SECRET_LABELS, scanSecrets, type SecretKind } from '../../src/secrets';
import { FAKES, random } from './fixtures';

/** The kinds found in `text`, with the text each finding covers. */
const found = (text: string, options?: Parameters<typeof scanSecrets>[1]) =>
  scanSecrets(text, options).findings.map((finding) => [finding.kind, text.slice(finding.start, finding.end)]);

describe('scanSecrets', () => {
  it.each([
    ['aws-access-key-id', FAKES.awsAccessKeyId],
    ['github-token', FAKES.githubToken],
    ['github-token', FAKES.githubFineGrained],
    ['gitlab-token', FAKES.gitlabToken],
    ['slack-token', FAKES.slackToken],
    ['slack-webhook', FAKES.slackWebhook],
    ['stripe-key', FAKES.stripeKey],
    ['google-api-key', FAKES.googleApiKey],
    ['openai-key', FAKES.openaiKey],
    ['openai-key', FAKES.openaiLegacy],
    ['npm-token', FAKES.npmToken],
    ['pypi-token', FAKES.pypiToken],
    ['sendgrid-key', FAKES.sendgridKey],
    ['twilio-key', FAKES.twilioKey],
    ['jwt', FAKES.jwt],
    ['private-key', FAKES.privateKey],
    ['card-number', FAKES.visa],
    ['card-number', FAKES.visaPlain],
    ['card-number', FAKES.amex],
    ['card-number', FAKES.mastercard],
    ['iban', FAKES.iban],
    ['iban', FAKES.ibanCompact],
  ] as const)('finds a %s, exactly where it is', (kind, secret) => {
    expect(found(`Here: ${secret}.`)).toEqual([[kind, secret]]);
    expect(found(secret)).toEqual([[kind, secret]]);
  });

  it('finds secrets inside other text: URLs, connection strings, assignments', () => {
    expect(found('DATABASE_URL=postgres://app:S3cr3tPa55w0rd@db.internal:5432/app')).toEqual([['url-credentials', 'S3cr3tPa55w0rd']]);
    expect(found('redis://:Zq8hT2vLp9@cache:6379')).toEqual([['url-credentials', 'Zq8hT2vLp9']]);
    expect(found('Server=db;Database=app;User Id=sa;Password=Hunter2xyz;Encrypt=true')).toEqual([['connection-string', 'Hunter2xyz']]);
    expect(found(`DefaultEndpointsProtocol=https;AccountName=acme;AccountKey=${FAKES.azureStorageKey};EndpointSuffix=core.windows.net`)).toEqual([
      ['azure-storage-key', FAKES.azureStorageKey],
    ]);
    expect(found('API_KEY="Zk3p9QmX7vL2tR8w"')).toEqual([['generic-secret', 'Zk3p9QmX7vL2tR8w']]);
    expect(found('{"client_secret": "q8Jv2LmP0xR7tZ4n"}')).toEqual([['generic-secret', 'q8Jv2LmP0xR7tZ4n']]);
    expect(found("db.password => 'Wq9#zL4!pX2v'")).toEqual([['generic-secret', 'Wq9#zL4!pX2v']]);
    expect(found(`aws_secret_access_key = ${FAKES.awsSecretAccessKey}`)).toEqual([['aws-secret-access-key', FAKES.awsSecretAccessKey]]);
  });

  it('leaves placeholders, references and ordinary text alone', () => {
    for (const text of [
      'password: changeme',
      'password = "********"',
      'API_KEY=<your-api-key>',
      'token: ${GITHUB_TOKEN}',
      'secret = {{ vault.secret }}',
      'token = process.env.GITHUB_TOKEN',
      'API_KEY=$API_KEY',
      'api_key: "your_api_key_here"',
      'password = "aaaaaaaaaaaa"',
      'tokenizer = "words"',
      'postgres://app:@db/app',
      'postgres://app:%PASSWORD%@db/app',
      'Server=db;Password=;',
      'Server=db;Password=changeme;',
      'eyJAAAAAAAAAAA.eyJAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAA',
      'Call me at +91 78920 08290 or order 4242 4242 4242 4241.',
      'Order 1234567890123456 shipped.',
      'DE89 3704 0044 0532 0130 01',
      'eyJhbGciOi.eyJzdWIiOi.notarealsignaturehere',
      'The AKIA prefix marks AWS keys.',
      'Visit https://example.com/a:b@c and see.',
    ]) {
      expect(found(text), text).toEqual([]);
    }
  });

  it('keeps a card number or IBAN apart from what follows it', () => {
    expect(found(`${FAKES.visa} 12/26`)).toEqual([['card-number', FAKES.visa]]);
    expect(found(`IBAN ${FAKES.iban} BIC COBADEFFXXX`)).toEqual([['iban', FAKES.iban]]);
    expect(found(`${FAKES.visa} 2026-10-22`)).toEqual([['card-number', FAKES.visa]]);
    // A candidate that runs into the next secret does not hide it.
    expect(found(`${FAKES.ibanCompact} 42 ${FAKES.iban}`)).toEqual([['iban', FAKES.ibanCompact], ['iban', FAKES.iban]]);
    expect(found(`XX00 ${FAKES.iban}`)).toEqual([['iban', FAKES.iban]]);
    expect(found(`${FAKES.visa} 4242 4242`)).toEqual([['card-number', FAKES.visa]]);
    expect(found('4242 4242 4242 4241 12')).toEqual([]);
  });

  it('rates its confidence, and leaves out guesses with minConfidence: high', () => {
    const text = `${FAKES.githubToken} ${FAKES.twilioKey} ${FAKES.visaPlain} ${FAKES.visa} API_KEY="Zk3p9QmX7vL2tR8w"`;
    expect(scanSecrets(text).findings.map((finding) => [finding.kind, finding.confidence])).toEqual([
      ['github-token', 'high'],
      ['twilio-key', 'medium'],
      ['card-number', 'medium'],
      ['card-number', 'high'],
      ['generic-secret', 'medium'],
    ]);
    expect(scanSecrets(text, { minConfidence: 'high' }).findings.map((finding) => finding.kind)).toEqual(['github-token', 'card-number']);
  });

  it('keeps the most specific finding where two overlap', () => {
    expect(found(`GITHUB_TOKEN=${FAKES.githubToken}`)).toEqual([['github-token', FAKES.githubToken]]);
    expect(found(`token: "${FAKES.jwt}"`)).toEqual([['jwt', FAKES.jwt]]);
    // A low-confidence finding left out does not hide a high one under it.
    expect(scanSecrets(`password=${FAKES.githubToken}`, { kinds: ['generic-secret'] }).findings.map((finding) => finding.kind)).toEqual(['generic-secret']);
  });

  it('looks only for the kinds asked for', () => {
    const text = `${FAKES.githubToken} ${FAKES.visa} aws_secret_key=${FAKES.awsSecretAccessKey} ${FAKES.privateKey}`;
    expect(found(text, { kinds: ['card-number'] })).toEqual([['card-number', FAKES.visa]]);
    expect(found(text, { kinds: ['aws-secret-access-key'] })).toEqual([['aws-secret-access-key', FAKES.awsSecretAccessKey]]);
    expect(found(text, { kinds: ['generic-secret'] })).toEqual([]);
    expect(found(text, { kinds: ['private-key'] })).toEqual([['private-key', FAKES.privateKey]]);
    expect(found(text, { kinds: [] })).toEqual([]);
  });

  it('masks every preview, never showing a secret', () => {
    const text = Object.values(FAKES).join('\n');
    const all = `${text}\npostgres://u:S3cr3tPa55w0rd@h/db\nAPI_KEY="Zk3p9QmX7vL2tR8w"`;
    const { findings } = scanSecrets(all);
    expect(findings.length).toBeGreaterThan(20);
    for (const finding of findings) {
      expect(finding.label).toBe(SECRET_LABELS[finding.kind]);
      expect(finding.masked.length).toBeLessThan(45);
      const secret = all.slice(finding.start, finding.end);
      // The middle of a secret is never in its preview.
      if (secret.length >= 24) expect(finding.masked).not.toContain(secret.slice(secret.length / 2 - 4, secret.length / 2 + 4));
    }
    // The first finding of each kind.
    const masked = Object.fromEntries([...findings].reverse().map((finding) => [finding.kind, finding.masked]));
    expect(masked).toMatchObject({
      'github-token': `ghp_\u2026${FAKES.githubToken.slice(-4)}`,
      'card-number': '\u2022\u2022\u2022\u2022 4242',
      iban: `DE\u2026${FAKES.iban.replace(/ /g, '').slice(-4)}`,
      'private-key': '-----BEGIN \u2026 PRIVATE KEY-----',
      'url-credentials': '\u2022'.repeat(8),
      'generic-secret': '\u2022'.repeat(8),
    });
    expect(scanSecrets(FAKES.githubFineGrained).findings[0]?.masked).toBe(`github_pat_\u2026${FAKES.githubFineGrained.slice(-4)}`);
    expect(scanSecrets(FAKES.openaiKey).findings[0]?.masked).toBe(`sk-proj-\u2026${FAKES.openaiKey.slice(-4)}`);
    expect(scanSecrets(FAKES.openaiLegacy).findings[0]?.masked).toBe(`sk-\u2026${FAKES.openaiLegacy.slice(-4)}`);
    // Short secrets show only their prefix.
    expect(scanSecrets('xoxb-1234567890').findings[0]?.masked).toBe('xoxb-\u2026');
    expect(scanSecrets(FAKES.awsAccessKeyId).findings[0]?.masked).toBe(`AKIA\u2026${FAKES.awsAccessKeyId.slice(-4)}`);
  });

  it('reads a private key to its END line, or to the end of the text when cut off', () => {
    const cut = FAKES.privateKey.slice(0, 80);
    expect(found(`key:\n${cut}`)).toEqual([['private-key', cut]]);
    expect(found(`${FAKES.privateKey}\nafter`)).toEqual([['private-key', FAKES.privateKey]]);
    expect(found('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----')).toHaveLength(1);
    expect(found('-----BEGIN ENCRYPTED PRIVATE KEY-----')).toHaveLength(1);
    expect(found('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----')).toEqual([]);
  });

  it('scans up to maxLength, and says when it stopped', () => {
    const text = `${'a '.repeat(10)}${FAKES.githubToken}`;
    expect(scanSecrets(text, { maxLength: 10 })).toEqual({ findings: [], truncated: true });
    expect(scanSecrets(text).truncated).toBe(false);
    expect(DEFAULT_SECRET_SCAN_LENGTH).toBe(1_000_000);
  });

  it('refuses unknown kinds and negative lengths', () => {
    expect(() => scanSecrets('x', { kinds: ['password' as SecretKind] })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    expect(() => scanSecrets('x', { maxLength: -1 })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
  });

  it('lists every kind with a label', () => {
    expect(SECRET_KINDS).toHaveLength(21);
    expect(Object.keys(SECRET_LABELS)).toEqual(SECRET_KINDS);
    expect(Object.isFrozen(SECRET_KINDS) && Object.isFrozen(SECRET_LABELS)).toBe(true);
  });

  it('runs in linear time on hostile text', () => {
    const hostile = [
      'a'.repeat(200_000),
      'AKIA'.repeat(50_000),
      '1-'.repeat(100_000),
      'DE00 '.repeat(40_000),
      `x://${':'.repeat(100_000)}`,
      `x://${'a:'.repeat(100_000)}`,
      `${'eyJ'.repeat(30_000)}.eyJ.`,
      '-----BEGIN '.repeat(20_000),
      'password='.repeat(20_000),
      '"a": '.repeat(40_000),
      `${'eyJ'.repeat(20_000)}.eyJAAAAAAAAAA.${'A'.repeat(20)}`,
      'GB82 '.repeat(40_000),
      ';Password='.repeat(20_000),
      random(200_000),
    ];
    for (const text of hostile) {
      const started = performance.now();
      scanSecrets(text);
      expect(performance.now() - started, text.slice(0, 20)).toBeLessThan(2000);
    }
  });
});

describe('the checks', () => {
  it('computes Luhn checksums', () => {
    expect(luhn('4242424242424242')).toBe(true);
    expect(luhn('4242424242424241')).toBe(false);
    expect(luhn('79927398713')).toBe(true);
  });

  it('knows card numbers by brand, length, checksum and grouping', () => {
    expect(isCardNumber('4242424242424242')).toBe(true);
    expect(isCardNumber('4242 4242 4242 4242')).toBe(true);
    expect(isCardNumber('4242-4242-4242-4242')).toBe(true);
    expect(isCardNumber('3782 822463 10005')).toBe(true);
    expect(isCardNumber('2223000048400011')).toBe(true);
    expect(isCardNumber('6011111111111117')).toBe(true);
    expect(isCardNumber('3530111333300000')).toBe(true);
    expect(isCardNumber('36227206271667')).toBe(true);
    expect(isCardNumber('6200000000000005')).toBe(true);
    expect(isCardNumber('4242 4242-4242 4242')).toBe(false);
    expect(isCardNumber('42 4242 4242 424242')).toBe(false);
    expect(isCardNumber('0000000000000000')).toBe(false);
    expect(isCardNumber('9242424242424242')).toBe(false);
    expect(isCardNumber('424242424242424')).toBe(false);
  });

  it('knows IBANs by country length and mod-97', () => {
    expect(isIban('DE89370400440532013000')).toBe(true);
    expect(isIban('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isIban('NO9386011117947')).toBe(true);
    expect(isIban('DE89370400440532013001')).toBe(false);
    expect(isIban('DE8937040044053201300')).toBe(false);
    expect(isIban('ZZ89370400440532013000')).toBe(false);
  });

  it('measures randomness, and tells placeholders and references from secrets', () => {
    expect(entropy('aaaa')).toBe(0);
    expect(entropy('abcd')).toBe(2);
    expect(looksSecret('Zk3p9QmX7vL2tR8w', 3)).toBe(true);
    for (const value of ['changeme', 'xxxxxxxx', '<token>', '${TOKEN}', '{{ token }}', '%TOKEN%', '$TOKEN', 'your_token_here', 'my-secret-token', 'example-key-123', 'process.env.TOKEN', 'REDACTED']) {
      expect(looksSecret(value, 0), value).toBe(false);
    }
    expect(looksSecret('aaaaaaaaaaaa', 3)).toBe(false);
  });

  it('reads JWT headers, and trusts the shape where there is no atob', () => {
    expect(isJwtHeader(Buffer.from('{"alg":"none"}').toString('base64url'))).toBe(true);
    expect(isJwtHeader(Buffer.from('{"typ":"JWT"}').toString('base64url'))).toBe(false);
    expect(isJwtHeader(Buffer.from('[1]').toString('base64url'))).toBe(false);
    expect(isJwtHeader(Buffer.from('null').toString('base64url'))).toBe(false);
    expect(isJwtHeader('eyJ!!!')).toBe(false);
    vi.stubGlobal('atob', undefined);
    try {
      expect(isJwtHeader('eyJanything')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
