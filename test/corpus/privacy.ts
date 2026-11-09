import { scanSecrets } from '../../src/secrets';
import type { Capture } from './schema';

/** Addresses at these domains are reserved for examples (RFC 2606, RFC 6761): safe to publish. */
const RESERVED = /(^|\.)(example|example\.com|example\.net|example\.org|test|invalid|localhost)$/;
const ADDRESS = /[\p{L}\p{N}._%+-]+@([\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+)/gu;
/** An image's pixel-density suffix, as in Slack's `2705@2x.png`: a file name, not an address. */
const DENSITY = /^\d+(?:\.\d+)?x\./;
/**
 * A path into someone's home folder, which names their account: Office puts one on the
 * clipboard (`file:///C:/Users/<name>/AppData/Local/Temp/msohtmlclip1/...`). The Inspector
 * writes the name as `user`, the only one allowed here.
 */
const HOME_PATH = /(?:[A-Za-z]:[\\/]+Users[\\/]+|file:\/\/\/?(?:Users|home)\/)([^\\/"'<>\s]+)/g;

/**
 * Everything in a capture that must not be published: credentials, e-mail addresses at real
 * domains, and account names in file paths. Captures are public test data; copy from
 * documents made for the purpose.
 */
export function privacyProblems(capture: Capture): string[] {
  const problems: string[] = [];
  for (const [mime, data] of Object.entries(capture.types)) {
    for (const finding of scanSecrets(data).findings) problems.push(`${mime} holds a ${finding.kind} (a secret)`);
    for (const match of data.matchAll(ADDRESS)) {
      const domain = (match[1] as string).toLowerCase();
      if (!RESERVED.test(domain) && !DENSITY.test(domain)) problems.push(`${mime} holds an address at a real domain: ${(match[0]).replace(/^.{2}/, '**')}`);
    }
    for (const match of data.matchAll(HOME_PATH)) {
      if (match[1] !== 'user') {
        problems.push(`${mime} holds a path into a home folder, which names its account: write the name as "user"`);
        break;
      }
    }
  }
  return problems;
}
