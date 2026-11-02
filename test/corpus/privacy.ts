import { scanSecrets } from '../../src/secrets';
import type { Capture } from './schema';

/** Addresses at these domains are reserved for examples (RFC 2606, RFC 6761): safe to publish. */
const RESERVED = /(^|\.)(example|example\.com|example\.net|example\.org|test|invalid|localhost)$/;
const ADDRESS = /[\p{L}\p{N}._%+-]+@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)/gu;

/**
 * Everything in a capture that must not be published: credentials, and e-mail addresses
 * at real domains. Captures are public test data; copy from documents made for the purpose.
 */
export function privacyProblems(capture: Capture): string[] {
  const problems: string[] = [];
  for (const [mime, data] of Object.entries(capture.types)) {
    for (const finding of scanSecrets(data).findings) problems.push(`${mime} holds a ${finding.kind} (a secret)`);
    for (const match of data.matchAll(ADDRESS)) {
      if (!RESERVED.test((match[1] as string).toLowerCase())) problems.push(`${mime} holds an address at a real domain: ${(match[0]).replace(/^.{2}/, '**')}`);
    }
  }
  return problems;
}
