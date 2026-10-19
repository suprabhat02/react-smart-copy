// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shareMethod, shareOrCopy } from '../../src/share';

describe('react-smart-copy/share on the server', () => {
  it('has no window, so it never opens a share sheet and reports copying as unsupported', async () => {
    expect(typeof window).toBe('undefined');
    expect(shareMethod({ mode: 'native' })).toBe('copy');
    expect(await shareOrCopy({ url: 'https://example.com' }, { mode: 'native' })).toMatchObject({
      status: 'error',
      method: 'copy',
      error: { type: 'unsupported' },
    });
  });

  it('validates links without a page to resolve them against', async () => {
    expect(await shareOrCopy({ url: '/relative' })).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
  });
});
