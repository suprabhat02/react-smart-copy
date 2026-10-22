/**
 * Kinds of secrets {@link scanSecrets} finds.
 *
 * - Keys and tokens of services, by their documented formats: `private-key` (PEM and
 *   OpenSSH), `aws-access-key-id`, `aws-secret-access-key`, `github-token`, `gitlab-token`,
 *   `slack-token`, `slack-webhook`, `stripe-key` (live keys), `google-api-key`,
 *   `npm-token`, `pypi-token`, `sendgrid-key`, `twilio-key`, `azure-storage-key`, `jwt`.
 * - Credentials inside other text: `url-credentials` (the password in
 *   `postgres://user:password@host`), `connection-string` (`Password=` in a connection string).
 * - Financial data, by checksum: `card-number` (Luhn and card brand), `iban` (mod-97 and length).
 * - `generic-secret`: a random-looking value assigned to a name such as `password`, `token`
 *   or `api_key` (`API_KEY="..."`, `"password": "..."`).
 */
export type SecretKind =
  | 'private-key'
  | 'aws-access-key-id'
  | 'aws-secret-access-key'
  | 'github-token'
  | 'gitlab-token'
  | 'slack-token'
  | 'slack-webhook'
  | 'stripe-key'
  | 'google-api-key'
  | 'npm-token'
  | 'pypi-token'
  | 'sendgrid-key'
  | 'twilio-key'
  | 'azure-storage-key'
  | 'jwt'
  | 'url-credentials'
  | 'connection-string'
  | 'card-number'
  | 'iban'
  | 'generic-secret';

/** People-facing names of the kinds, for messages and redaction marks. */
export const SECRET_LABELS: Readonly<Record<SecretKind, string>> = Object.freeze({
  'private-key': 'private key',
  'aws-access-key-id': 'AWS access key ID',
  'aws-secret-access-key': 'AWS secret access key',
  'github-token': 'GitHub token',
  'gitlab-token': 'GitLab token',
  'slack-token': 'Slack token',
  'slack-webhook': 'Slack webhook URL',
  'stripe-key': 'Stripe live key',
  'google-api-key': 'Google API key',
  'npm-token': 'npm token',
  'pypi-token': 'PyPI token',
  'sendgrid-key': 'SendGrid API key',
  'twilio-key': 'Twilio API key',
  'azure-storage-key': 'Azure storage key',
  jwt: 'JSON Web Token',
  'url-credentials': 'password in a URL',
  'connection-string': 'password in a connection string',
  'card-number': 'card number',
  iban: 'IBAN',
  'generic-secret': 'secret',
});

/** Every kind, in a stable order. */
export const SECRET_KINDS: readonly SecretKind[] = Object.freeze(Object.keys(SECRET_LABELS) as SecretKind[]);

/**
 * How sure a finding is.
 *
 * - `high`: the documented format of a service, a valid checksum (cards, IBANs), or a
 *   structure that only credentials have (a PEM private key, a password in a URL).
 * - `medium`: the shape fits, but other data has it too: an AWS secret key next to its name,
 *   a Twilio key, a value assigned to a secret-sounding name.
 */
export type SecretConfidence = 'high' | 'medium';

export interface SecretFinding {
  readonly kind: SecretKind;
  /** {@link SECRET_LABELS} for the kind. */
  readonly label: string;
  readonly confidence: SecretConfidence;
  /** Where the secret is in the scanned text: `text.slice(start, end)` is the secret. */
  readonly start: number;
  readonly end: number;
  /**
   * A preview safe to show and log: at most a known prefix and the last 4 characters
   * (`ghp_` and `a1B2` around an ellipsis; the last 4 digits of a card). Findings never hold the secret.
   */
  readonly masked: string;
}
