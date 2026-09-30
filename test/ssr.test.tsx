// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDefaultCaptureEnvironment } from '../src/capture/environment';
import { createBrowserClipboardAdapter } from '../src/core/clipboard-adapter';
import { createBrowserPasteAdapter } from '../src/core/paste-adapter';
import { resolvePasteReadOptions } from '../src/core/paste-reader';
import { CopyField } from '../src/react/CopyField';
import { CopyGroup } from '../src/react/CopyGroup';
import { useMediaQuery } from '../src/react/useMediaQuery';
import { usePaste } from '../src/react/usePaste';

function PasteStatus() {
  const { status } = usePaste({ listenOnDocument: true });
  return <output>{status}</output>;
}

function Media() {
  return <output>{String(useMediaQuery('(hover: none)'))}</output>;
}

describe('server rendering (no window)', () => {
  it('renders every React entry point to idle, hydration-safe markup', () => {
    const html = renderToString(
      <CopyGroup>
        <CopyField.Root value="shubh@example.com" label="Email">
          <CopyField.Label />
          <CopyField.Value />
          <CopyField.Trigger />
        </CopyField.Root>
        <PasteStatus />
        <Media />
      </CopyGroup>,
    );
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('shubh@example.com');
    expect(html).toContain('<output>idle</output>');
    expect(html).toContain('<output>false</output>');
  });

  it('default adapters fail honestly instead of touching globals', async () => {
    await expect(createBrowserClipboardAdapter().write({ kind: 'text', value: 'x' })).rejects.toMatchObject({
      copyError: { type: 'unsupported' },
    });
    await expect(createBrowserPasteAdapter().read(resolvePasteReadOptions())).rejects.toMatchObject({
      copyError: { type: 'unsupported' },
    });
    expect(getDefaultCaptureEnvironment()).toBeNull();
  });
});
