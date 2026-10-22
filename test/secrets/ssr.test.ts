// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { redactSecrets, scanSecrets } from '../../src/secrets';
import { FAKES } from './fixtures';

describe('react-smart-copy/secrets on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
  });

  it('scans and redacts anywhere: logs, tickets, uploads', () => {
    const log = `2026-10-22T10:00:00Z deploy ok key=${FAKES.awsAccessKeyId} jwt=${FAKES.jwt}`;
    expect(scanSecrets(log).findings.map((finding) => finding.kind)).toEqual(['aws-access-key-id', 'jwt']);
    expect(redactSecrets(log).text).toBe('2026-10-22T10:00:00Z deploy ok key=[redacted AWS access key ID] jwt=[redacted JSON Web Token]');
  });
});
