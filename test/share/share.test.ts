import { describe, expect, it, vi } from 'vitest';
import type { ClipboardAdapter } from '../../src/core/clipboard-adapter';
import { CopyFailure, createCopyError } from '../../src/core/errors';
import type { CopyPayload } from '../../src/core/payload';
import { describeShareError, shareMethod, shareOrCopy, type ShareEnvironment } from '../../src/share';

const typed = (type: string): unknown => expect.objectContaining({ type });

function clipboard(fail?: unknown) {
  const writes: CopyPayload[] = [];
  const adapter: ClipboardAdapter = {
    write: (payload) => {
      writes.push(payload);
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- platforms reject with DOMExceptions and other values
      return fail === undefined ? Promise.resolve() : Promise.reject(fail);
    },
  };
  return { adapter, writes };
}

function device(options: { touch?: boolean; share?: (data: ShareData) => Promise<void>; canShare?: ((data: ShareData) => boolean) | null } = {}) {
  const share = vi.fn(options.share ?? (() => Promise.resolve()));
  const environment: ShareEnvironment = {
    navigator: { share, ...(options.canShare === null ? {} : { canShare: options.canShare ?? (() => true) }) },
    matchMedia: (query) => ({ matches: options.touch !== false && query.includes('coarse') }),
  };
  return { environment, share };
}

const domError = (name: string) => new DOMException(name, name);
const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

describe('shareOrCopy: the share sheet', () => {
  it('opens the share sheet on a phone, with clean data', async () => {
    const { environment, share } = device();
    const { adapter, writes } = clipboard();
    const outcome = await shareOrCopy(
      { url: 'https://u:p@example.com/a?utm_source=x&id=1', title: ' Release\u202E notes ', text: 'Look at this', files: [file] },
      { environment, adapter, clean: true },
    );
    expect(share).toHaveBeenCalledWith({ url: 'https://example.com/a?id=1', title: 'Release notes', text: 'Look at this', files: [file] });
    expect(outcome).toEqual({ status: 'shared', method: 'native', content: { url: 'https://example.com/a?id=1', title: 'Release notes', text: 'Look at this', files: [file] } });
    expect(writes).toEqual([]);
  });

  it('sends only the fields that are set', async () => {
    const { environment, share } = device();
    await shareOrCopy({ text: 'Just a message', title: '  ' }, { environment });
    expect(share).toHaveBeenCalledWith({ text: 'Just a message' });
  });

  it('reports a closed share sheet as cancelled, never as an error or a copy', async () => {
    const { environment } = device({ share: () => Promise.reject(domError('AbortError')) });
    const { adapter, writes } = clipboard();
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment, adapter })).toEqual({ status: 'cancelled', method: 'native' });
    expect(writes).toEqual([]);
  });

  it('copies instead when the share sheet fails, unless fallback is off', async () => {
    const { environment } = device({ share: () => Promise.reject(domError('NotAllowedError')) });
    const { adapter, writes } = clipboard();
    expect(await shareOrCopy({ url: 'https://example.com', title: 'Example' }, { environment, adapter })).toMatchObject({ status: 'copied', method: 'copy', reason: 'fallback' });
    expect(writes[0]).toMatchObject({ kind: 'html', html: '<a href="https://example.com/">Example</a>', text: 'https://example.com/' });
    for (const [name, type] of [['NotAllowedError', 'permission-denied'], ['InvalidStateError', 'unknown'], ['DataError', 'unsupported-format'], ['TypeError', 'unsupported-format'], ['TimeoutError', 'timeout']] as const) {
      const failing = device({ share: () => Promise.reject(domError(name)) });
      expect(await shareOrCopy({ url: 'https://example.com' }, { environment: failing.environment, fallback: false })).toEqual({ status: 'error', method: 'native', error: typed(type) });
    }
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a non-Error rejection must still be classified
    const odd = device({ share: () => Promise.reject('nope') });
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment: odd.environment, fallback: false })).toMatchObject({ status: 'error', error: typed('unknown') });
  });

  it('uses the share sheet on desktop too with mode "native"', async () => {
    const { environment, share } = device({ touch: false });
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment, mode: 'native' })).toMatchObject({ status: 'shared' });
    expect(share).toHaveBeenCalledOnce();
  });
});

describe('shareOrCopy: copying', () => {
  it('copies a titled link on desktop in auto mode', async () => {
    const { environment, share } = device({ touch: false });
    const { adapter, writes } = clipboard();
    const outcome = await shareOrCopy({ url: 'https://example.com/x', title: 'X', text: 'ignored when there is a link' }, { environment, adapter });
    expect(outcome).toMatchObject({ status: 'copied', method: 'copy', reason: 'preferred', payload: { kind: 'html', text: 'https://example.com/x' } });
    expect(share).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
  });

  it('copies text when there is no link, and the URL alone when there is no title', async () => {
    const { adapter, writes } = clipboard();
    await shareOrCopy({ text: 'Hello' }, { mode: 'copy', adapter });
    await shareOrCopy({ url: 'https://example.com/' }, { mode: 'copy', adapter });
    expect(writes).toEqual([{ kind: 'text', value: 'Hello' }, expect.objectContaining({ kind: 'html', html: '<a href="https://example.com/">https://example.com/</a>' })]);
  });

  it('copies what `copy` returns', async () => {
    const { adapter, writes } = clipboard();
    const outcome = await shareOrCopy({ url: 'https://example.com/', text: 'Hi' }, { mode: 'copy', adapter, copy: (content) => `${content.text ?? ''} ${content.url ?? ''}` });
    expect(outcome).toMatchObject({ status: 'copied', payload: { kind: 'text', value: 'Hi https://example.com/' } });
    expect(writes).toHaveLength(1);
    expect(await shareOrCopy({ text: 'x' }, { mode: 'copy', adapter, copy: () => '' })).toMatchObject({ status: 'error', method: 'copy', error: typed('invalid-payload') });
    expect(
      await shareOrCopy({ text: 'x' }, {
        mode: 'copy',
        adapter,
        copy: () => {
          throw new Error('boom');
        },
      }),
    ).toMatchObject({ status: 'error', error: typed('unknown') });
  });

  it('copies when there is no share sheet, or it cannot take the content', async () => {
    const { adapter } = clipboard();
    const none: ShareEnvironment = { matchMedia: () => ({ matches: true }) };
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment: none, adapter })).toMatchObject({ status: 'copied', reason: 'unsupported' });
    const refuses = device({ canShare: () => false });
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment: refuses.environment, adapter })).toMatchObject({ status: 'copied', reason: 'unsupported' });
    expect(refuses.share).not.toHaveBeenCalled();
    // Older Safari: share without canShare takes links and text, not files.
    const old = device({ canShare: null });
    expect(await shareOrCopy({ url: 'https://example.com' }, { environment: old.environment, adapter })).toMatchObject({ status: 'shared' });
    expect(await shareOrCopy({ url: 'https://example.com', files: [file] }, { environment: old.environment, adapter })).toMatchObject({ status: 'copied', reason: 'unsupported' });
  });

  it('cannot copy files alone', async () => {
    const { adapter, writes } = clipboard();
    expect(await shareOrCopy({ files: [file] }, { mode: 'copy', adapter })).toMatchObject({ status: 'error', method: 'copy', error: typed('unsupported-format') });
    expect(writes).toEqual([]);
  });

  it('reports a failed copy as a typed error', async () => {
    const denied = clipboard(new CopyFailure(createCopyError('permission-denied', 'no')));
    expect(await shareOrCopy({ text: 'x' }, { mode: 'copy', adapter: denied.adapter })).toMatchObject({ status: 'error', method: 'copy', error: typed('permission-denied') });
    const raw = clipboard(domError('NotAllowedError'));
    expect(await shareOrCopy({ text: 'x' }, { mode: 'copy', adapter: raw.adapter })).toMatchObject({ error: typed('permission-denied') });
  });

  it('stops before copying when the signal is aborted, and passes the signal on', async () => {
    const { adapter, writes } = clipboard();
    const aborted = new AbortController();
    aborted.abort();
    expect(await shareOrCopy({ text: 'x' }, { mode: 'copy', adapter, signal: aborted.signal })).toMatchObject({ status: 'error', error: typed('aborted') });
    expect(writes).toEqual([]);
    const live = new AbortController();
    const write = vi.spyOn(adapter, 'write');
    await shareOrCopy({ text: 'x' }, { mode: 'copy', adapter, signal: live.signal });
    expect(write).toHaveBeenCalledWith({ kind: 'text', value: 'x' }, { signal: live.signal });
  });

  it('uses the browser clipboard by default', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      expect(await shareOrCopy({ text: 'default' }, { mode: 'copy' })).toMatchObject({ status: 'copied' });
      expect(writeText).toHaveBeenCalledWith('default');
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});

describe('shareOrCopy: validation', () => {
  it('rejects unsafe links and invalid content as typed errors, before anything opens', async () => {
    const { environment, share } = device();
    const cases: unknown[] = [
      { url: 'javascript:alert(1)' },
      {},
      { text: '   ' },
      null,
      'https://example.com',
      { url: 'https://x', title: 1 },
      { url: 'https://x', text: 1 },
      { url: 'https://x', files: ['not a file'] },
      { url: 'https://x', files: file },
    ];
    for (const content of cases) {
      expect(await shareOrCopy(content as never, { environment })).toMatchObject({ status: 'error', method: 'copy', error: typed('invalid-payload') });
    }
    expect(await shareOrCopy({ url: 'https://x' }, { environment, mode: 'sheet' as never })).toMatchObject({ error: typed('invalid-payload') });
    expect(share).not.toHaveBeenCalled();
  });

  it('accepts a null url when there is text', async () => {
    const { environment, share } = device();
    await shareOrCopy({ url: null as never, text: 'hi' }, { environment });
    expect(share).toHaveBeenCalledWith({ text: 'hi' });
  });
});

describe('shareMethod', () => {
  it('says how a share would happen', () => {
    const phone = device().environment;
    const desktop = device({ touch: false }).environment;
    expect(shareMethod({ environment: phone })).toBe('native');
    expect(shareMethod({ environment: desktop })).toBe('copy');
    expect(shareMethod({ environment: desktop, mode: 'native' })).toBe('native');
    expect(shareMethod({ environment: phone, mode: 'copy' })).toBe('copy');
    expect(shareMethod({ environment: phone, mode: 'nope' as never })).toBe('copy');
    expect(shareMethod({ environment: {} })).toBe('copy');
    expect(shareMethod({ environment: device({ canShare: () => false }).environment }, { files: [file] })).toBe('copy');
    expect(shareMethod({ environment: phone }, { files: [file] })).toBe('native');
    expect(shareMethod({ environment: phone }, { url: 'javascript:x' })).toBe('copy');
    expect(shareMethod()).toBe('copy'); // jsdom: no share sheet.
  });
});

describe('describeShareError', () => {
  it('describes a share sheet failure as sharing and a failed copy as copying', () => {
    expect(describeShareError(createCopyError('permission-denied', 'x'), 'native')).toBe("Sharing isn't allowed here.");
    expect(describeShareError(createCopyError('permission-denied', 'x'), 'copy')).toBe('Clipboard access was blocked. Allow it and try again.');
    expect(describeShareError(createCopyError('timeout', 'x'), 'native')).toBe('Sharing took too long. Try again.');
    expect(describeShareError(createCopyError('unknown', 'x'), 'native')).toBe("Couldn't share. Try again.");
  });
});
