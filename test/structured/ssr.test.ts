// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { clipAccept, clipPayload, defineClipFormat, readClip, readClipSync } from '../../src/structured';

describe('react-smart-copy/structured on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof DOMParser).toBe('undefined');
  });

  it('defines formats, builds payloads and reads every carrier without a DOM', async () => {
    const Notes = defineClipFormat({ id: 'acme.notes', schema: (data: unknown) => data as string[] });
    const payload = clipPayload(Notes, ['ünïcödé', '🧾']);
    for (const item of payload.items) {
      const source = { items: [{ type: item.mimeType, data: item.data }] };
      if (item.mimeType === 'text/plain') {
        expect(readClipSync(source, Notes)).toEqual({ status: 'absent' });
      } else {
        expect(await readClip(source, Notes)).toMatchObject({ status: 'ok', value: ['ünïcödé', '🧾'] });
      }
    }
    expect(clipAccept(Notes)).toHaveLength(3);
  });
});
