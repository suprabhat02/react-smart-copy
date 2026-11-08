/**
 * Fields rendered into another window (`window.open` plus a portal: pop-out chats, detached
 * panels, trading terminals). Each window's clipboard only works while its own document has
 * focus, and the click happened in the other window, so the field must use that window's.
 * A same-origin iframe stands in for the pop-out: it has its own window, navigator and document.
 */
import { act, fireEvent, render } from '@testing-library/react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyField, PasteField } from '../src';
import type { ClipboardAdapter } from '../src/core';
import { windowOf } from '../src/react/utils';

function popout() {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const win = frame.contentWindow as Window & typeof globalThis;
  const writeText = vi.fn((_text: string) => Promise.resolve());
  const readText = vi.fn(() => Promise.resolve('from the pop-out clipboard'));
  Object.defineProperty(win.navigator, 'clipboard', { value: { writeText, readText }, configurable: true });
  return { win, body: win.document.body, writeText, readText };
}

function openerClipboard() {
  const writeText = vi.fn((_text: string) => Promise.resolve());
  const readText = vi.fn(() => Promise.resolve('from the opener clipboard'));
  Object.defineProperty(navigator, 'clipboard', { value: { writeText, readText }, configurable: true });
  return { writeText, readText };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  document.body.replaceChildren();
});

describe('fields in a pop-out window', () => {
  it("CopyField writes through the pop-out's clipboard, not the opener's", async () => {
    const opener = openerClipboard();
    const pop = popout();
    render(
      createPortal(
        <CopyField.Root value="INV-29018" label="Invoice">
          <CopyField.Trigger>Copy</CopyField.Trigger>
        </CopyField.Root>,
        pop.body,
      ),
    );
    await act(async () => {
      fireEvent.click(pop.body.querySelector('button') as HTMLButtonElement);
      await Promise.resolve();
    });
    expect(pop.writeText).toHaveBeenCalledWith('INV-29018');
    expect(opener.writeText).not.toHaveBeenCalled();
  });

  it('PasteField reads through the pop-out clipboard', async () => {
    const opener = openerClipboard();
    const pop = popout();
    const onPaste = vi.fn();
    render(
      createPortal(
        <PasteField.Root label="Notes" pasteOptions={{ onPaste }}>
          <PasteField.Trigger>Paste</PasteField.Trigger>
        </PasteField.Root>,
        pop.body,
      ),
    );
    await act(async () => {
      fireEvent.click(pop.body.querySelector('button') as HTMLButtonElement);
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
    });
    expect(pop.readText).toHaveBeenCalled();
    expect(opener.readText).not.toHaveBeenCalled();
    expect(onPaste).toHaveBeenCalledWith(expect.objectContaining({ text: 'from the pop-out clipboard' }));
  });

  it('an adapter you pass still wins', async () => {
    const pop = popout();
    const write = vi.fn(() => Promise.resolve());
    const adapter: ClipboardAdapter = { write };
    render(
      createPortal(
        <CopyField.Root value="x" label="X" copyOptions={{ adapter }}>
          <CopyField.Trigger>Copy</CopyField.Trigger>
        </CopyField.Root>,
        pop.body,
      ),
    );
    await act(async () => {
      fireEvent.click(pop.body.querySelector('button') as HTMLButtonElement);
      await Promise.resolve();
    });
    expect(write).toHaveBeenCalled();
    expect(pop.writeText).not.toHaveBeenCalled();
  });
});

describe('windowOf', () => {
  it("is an element's own window, else the global one, else nothing on the server", () => {
    const pop = popout();
    expect(windowOf(pop.body)).toBe(pop.win);
    expect(windowOf(null)).toBe(window);
    vi.stubGlobal('window', undefined);
    try {
      expect(windowOf(null)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
