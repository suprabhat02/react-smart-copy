// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addressesPayload, parseAddresses } from '../../src/email';

describe('react-smart-copy/email on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
  });

  it('checks recipients anywhere: imports, invitations, webhooks', () => {
    const list = parseAddresses('Lima, Ana <ana@b\u00FCcher.de>; bo@ex\u0430mple.com; nobody', { domains: ['b\u00FCcher.de', 'xn--exmple-4nf.com'] });
    expect(list.addresses.map((one) => [one.address, one.lookalike])).toEqual([
      ['ana@xn--bcher-kva.de', false],
      ['bo@xn--exmple-4nf.com', true],
    ]);
    expect(list.invalid).toEqual([{ text: 'nobody', reason: 'syntax' }]);
    expect(addressesPayload(list.addresses).value).toBe('"Lima, Ana" <ana@xn--bcher-kva.de>, bo@xn--exmple-4nf.com');
  });
});
