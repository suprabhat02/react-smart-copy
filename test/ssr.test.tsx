// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { getDefaultCaptureEnvironment } from '../src/capture/environment';
import { createBrowserClipboardAdapter } from '../src/core/clipboard-adapter';
import { IDLE_STATE, createCopyMachine } from '../src/core/copy-machine';
import { createBrowserPasteAdapter } from '../src/core/paste-adapter';
import { PASTE_IDLE_STATE, createPasteMachine } from '../src/core/paste-machine';
import { resolvePasteReadOptions } from '../src/core/paste-reader';
import { CopyField } from '../src/react/CopyField';
import { CopyGroup } from '../src/react/CopyGroup';
import { LiveRegion } from '../src/react/LiveRegion';
import { useCopy } from '../src/react/useCopy';
import { useDisplayStatus } from '../src/react/useDisplayStatus';
import { useMediaQuery } from '../src/react/useMediaQuery';
import { usePaste } from '../src/react/usePaste';
import { useRevealOnInteraction } from '../src/react/useRevealOnInteraction';

function PasteStatus() {
  const { status } = usePaste({ listenOnDocument: true });
  return <output>{status}</output>;
}

function Media() {
  return <output>{String(useMediaQuery('(hover: none)'))}</output>;
}

function CopyStatus() {
  const { status, canRetry } = useCopy();
  return (
    <output>
      {status}-{String(canRetry)}
    </output>
  );
}

function DisplayStatus() {
  const display = useDisplayStatus('idle');
  return <output>{display}</output>;
}

function RevealTest() {
  const { visible, reason, targetProps } = useRevealOnInteraction();
  return (
    <div {...targetProps}>
      <output>
        {String(visible)}-{String(reason)}
      </output>
    </div>
  );
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

  it('useCopy renders idle on the server with canRetry=false', () => {
    const html = renderToString(<CopyStatus />);
    expect(html).toContain('idle');
    expect(html).toContain('false');
  });

  it('useDisplayStatus renders idle on the server', () => {
    const html = renderToString(<DisplayStatus />);
    expect(html).toContain('idle');
  });

  it('useRevealOnInteraction renders hidden with null reason on the server', () => {
    const html = renderToString(<RevealTest />);
    expect(html).toContain('false');
    expect(html).toContain('null');
  });

  it('LiveRegion renders an empty announcer span on the server', () => {
    const html = renderToString(<LiveRegion message="Copied!" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    // Must NOT contain the message text — imperatively written after mount only
    expect(html).not.toContain('Copied!');
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

  it('core machines start at idle without touching window', () => {
    const copyMachine = createCopyMachine();
    expect(copyMachine.getSnapshot()).toBe(IDLE_STATE);
    expect(copyMachine.getSnapshot().status).toBe('idle');

    const pasteMachine = createPasteMachine();
    expect(pasteMachine.getSnapshot()).toBe(PASTE_IDLE_STATE);
    expect(pasteMachine.getSnapshot().status).toBe('idle');
  });

  it('core machine subscribe/unsubscribe works in Node', () => {
    const machine = createCopyMachine();
    let called = false;
    const unsub = machine.subscribe(() => {
      called = true;
    });
    machine.reset(); // idle → idle is a no-op so listener should NOT fire
    expect(called).toBe(false);
    unsub();
  });

  it('CopyGroup wrapping multiple CopyField.Root renders without errors', () => {
    const html = renderToString(
      <CopyGroup>
        <CopyField.Root value="first" label="A">
          <CopyField.Value />
          <CopyField.Trigger />
        </CopyField.Root>
        <CopyField.Root value="second" label="B">
          <CopyField.Value />
          <CopyField.Trigger />
        </CopyField.Root>
      </CopyGroup>,
    );
    expect(html).toContain('first');
    expect(html).toContain('second');
    // Both should render in idle state
    const idleCount = (html.match(/data-state="idle"/g) ?? []).length;
    expect(idleCount).toBeGreaterThanOrEqual(2);
  });

  it('usePaste with all options renders idle on the server', () => {
    function PasteAllOptions() {
      const { status, result, error } = usePaste({
        listenOnDocument: true,
        accept: ['text/plain'],
        maxBytes: 1024,
        maxItems: 5,
      });
      return (
        <output>
          {status}-{result === null ? 'null' : 'set'}-{error === null ? 'null' : 'set'}
        </output>
      );
    }
    const html = renderToString(<PasteAllOptions />);
    expect(html).toContain('idle');
    // result and error are both null on idle
    const nullCount = (html.match(/null/g) ?? []).length;
    expect(nullCount).toBeGreaterThanOrEqual(2);
  });
});
