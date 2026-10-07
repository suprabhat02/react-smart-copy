import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createCopyError, describePasteError } from '../src/core/errors';
import { createPasteMachine } from '../src/core/paste-machine';
import { canAcceptDrag, resolvePasteReadOptions, type DataTransferLike, type PasteAccept } from '../src/core/paste-reader';
import { PasteField, usePaste, type UsePasteOptions } from '../src';
import { fakeDataTransfer, pngFile } from './fixtures';
import { flush } from './helpers';

/* ---------------------------------------------------------------- fixtures */

const accepting = (...accept: PasteAccept[]) => resolvePasteReadOptions({ accept });

/** A drag in progress: item kinds and types only, data unreadable. */
const dragOf = (items: readonly { kind: string; type: string }[]): DataTransferLike => ({
  types: [],
  getData: () => '',
  items,
});

function fakeDropEvent(dataTransfer: DataTransferLike | null) {
  let prevented = false;
  return {
    dataTransfer,
    preventDefault: () => {
      prevented = true;
    },
    get prevented() {
      return prevented;
    },
  };
}

/** What a real drop carries: the data plus the item list. */
function dropData(data: Record<string, string>, files: readonly File[] = []): DataTransferLike {
  return {
    ...fakeDataTransfer(data, files),
    items: [
      ...Object.keys(data).map((type) => ({ kind: 'string', type })),
      ...files.map((file) => ({ kind: 'file', type: file.type })),
    ],
  };
}

/* ============================================================ canAcceptDrag */

describe('canAcceptDrag', () => {
  it('matches item kinds and types against accept', () => {
    const imageFile = dragOf([{ kind: 'file', type: 'image/png' }]);
    expect(canAcceptDrag(imageFile, accepting('image'))).toBe(true);
    expect(canAcceptDrag(imageFile, accepting('text'))).toBe(false);
    expect(canAcceptDrag(dragOf([{ kind: 'string', type: 'text/plain' }]), accepting('text'))).toBe(true);
  });

  it('treats untyped files as application/octet-stream', () => {
    const untyped = dragOf([{ kind: 'file', type: '' }]);
    expect(canAcceptDrag(untyped, accepting('any'))).toBe(true);
    expect(canAcceptDrag(untyped, accepting('image'))).toBe(false);
  });

  it('ignores binary string items and malformed types, as paste events do', () => {
    expect(canAcceptDrag(dragOf([{ kind: 'string', type: 'image/png' }]), accepting('any'))).toBe(false);
    expect(canAcceptDrag(dragOf([{ kind: 'string', type: 'not a type' }]), accepting('any'))).toBe(false);
  });

  it('falls back to `types` when no item list is exposed, with files as untyped', () => {
    const files: DataTransferLike = { types: ['Files'], getData: () => '' };
    expect(canAcceptDrag(files, accepting('text'))).toBe(false);
    expect(canAcceptDrag(files, accepting('image'))).toBe(false);
    expect(canAcceptDrag(files, accepting('any'))).toBe(true);
    expect(canAcceptDrag({ ...files, items: null }, accepting('any'))).toBe(true);
    expect(canAcceptDrag({ types: ['text/plain'], getData: () => '' }, accepting('text'))).toBe(true);
    expect(canAcceptDrag({ types: ['text/html', '???'], getData: () => '' }, accepting('text'))).toBe(false);
  });
});

/* ============================================================ machine.dropEvent */

describe('createPasteMachine().dropEvent', () => {
  it('reads accepted content with source "drop" and claims the event', async () => {
    const onPaste = vi.fn();
    const machine = createPasteMachine({ onPaste });
    const event = fakeDropEvent(dropData({ 'text/plain': 'dragged' }));
    const outcome = await machine.dropEvent(event);
    expect(outcome).toMatchObject({ status: 'read', result: { source: 'drop', text: 'dragged' } });
    expect(event.prevented).toBe(true);
    expect(onPaste).toHaveBeenCalledOnce();
  });

  it('keeps file names and verifies images, like paste events', async () => {
    const machine = createPasteMachine({ accept: ['image'] });
    const file = pngFile('drop.png');
    const outcome = await machine.dropEvent(fakeDropEvent(dropData({}, [file])));
    if (outcome.status !== 'read') throw new Error(`expected a read, got ${outcome.status}`);
    expect(outcome.result.imageFiles).toEqual([file]);
  });

  it('claims drops it ignores, so the browser does not open the file', async () => {
    const machine = createPasteMachine();
    const empty = fakeDropEvent(null);
    expect(await machine.dropEvent(empty)).toEqual({ status: 'ignored', reason: 'no-accepted-content' });
    expect(empty.prevented).toBe(true);

    const rejected = fakeDropEvent(dropData({}, [pngFile()]));
    expect(await machine.dropEvent(rejected)).toEqual({ status: 'ignored', reason: 'no-accepted-content' });
    expect(rejected.prevented).toBe(true);
    expect(machine.getSnapshot().status).toBe('idle');
  });

  it('leaves the event alone with preventDefault: false', async () => {
    const machine = createPasteMachine({ preventDefault: false });
    const event = fakeDropEvent(dropData({ 'text/plain': 'x' }));
    expect((await machine.dropEvent(event)).status).toBe('read');
    expect(event.prevented).toBe(false);
  });

  it('records drop failures with source "drop", which retry() cannot repeat', async () => {
    const machine = createPasteMachine({ maxBytes: 3 });
    const outcome = await machine.dropEvent(fakeDropEvent(dropData({ 'text/plain': 'too long' })));
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'too-large' } });
    expect(machine.getSnapshot()).toMatchObject({ status: 'error', source: 'drop', retryCount: 0 });
    expect(await machine.retry()).toEqual({ status: 'ignored', reason: 'not-retryable' });
  });

  it('reports invalid options as a drop error without a reading frame', async () => {
    const machine = createPasteMachine({ accept: ['not a type' as PasteAccept] });
    const statuses: string[] = [];
    machine.subscribe(() => statuses.push(machine.getSnapshot().status));
    const outcome = await machine.dropEvent(fakeDropEvent(dropData({ 'text/plain': 'x' })));
    expect(outcome).toMatchObject({ status: 'error', error: { type: 'invalid-payload' } });
    expect(machine.getSnapshot()).toMatchObject({ source: 'drop' });
    expect(statuses).toEqual(['error']);
  });

  it('supersedes a clipboard read in flight', async () => {
    const onCancel = vi.fn();
    const machine = createPasteMachine({ adapter: { read: () => new Promise(() => undefined) }, onCancel });
    void machine.paste();
    expect((await machine.dropEvent(fakeDropEvent(dropData({ 'text/plain': 'x' })))).status).toBe('read');
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('superseded');
  });
});

/* ======================================================= describePasteError */

describe('describePasteError for drops', () => {
  it('words drop failures as drops and falls back to the paste wording', () => {
    const tooLarge = createCopyError('too-large', 'x');
    expect(describePasteError(tooLarge)).toBe('The clipboard content is too large to paste.');
    expect(describePasteError(tooLarge, 'event')).toBe('The clipboard content is too large to paste.');
    expect(describePasteError(tooLarge, 'drop')).toBe('The dropped content is too large.');
    expect(describePasteError(createCopyError('timeout', 'x'), 'drop')).toBe('Pasting took too long. Try again.');
  });
});

/* ======================================================== usePaste drop props */

function DropTarget(options: UsePasteOptions) {
  const { dropTargetProps, isDragOver, result, error } = usePaste(options);
  return (
    <div data-testid="target" data-over={isDragOver ? 'yes' : 'no'} {...dropTargetProps}>
      <span data-testid="child">{result?.text ?? error?.type ?? 'empty'}</span>
    </div>
  );
}

const over = (): string | null => screen.getByTestId('target').getAttribute('data-over');

describe('usePaste().dropTargetProps', () => {
  it('tracks an accepted drag across children without flickering', () => {
    render(<DropTarget />);
    const target = screen.getByTestId('target');
    const dataTransfer = dropData({ 'text/plain': 'x' });

    fireEvent.dragEnter(target, { dataTransfer });
    expect(over()).toBe('yes');
    fireEvent.dragEnter(screen.getByTestId('child'), { dataTransfer });
    fireEvent.dragLeave(target, { dataTransfer });
    expect(over()).toBe('yes');
    fireEvent.dragLeave(screen.getByTestId('child'), { dataTransfer });
    expect(over()).toBe('no');
    // A stray leave never drives the count negative.
    fireEvent.dragLeave(target, { dataTransfer });
    fireEvent.dragEnter(target, { dataTransfer });
    expect(over()).toBe('yes');
  });

  it('only allows a drop for accepted drags', () => {
    render(<DropTarget accept={['image']} />);
    const target = screen.getByTestId('target');
    const text = dropData({ 'text/plain': 'x' });
    fireEvent.dragEnter(target, { dataTransfer: text });
    expect(over()).toBe('no');
    // fireEvent returns false when the handler called preventDefault().
    expect(fireEvent.dragOver(target, { dataTransfer: text })).toBe(true);

    const image = { ...dropData({}, [pngFile()]), dropEffect: 'none' };
    expect(fireEvent.dragOver(target, { dataTransfer: image })).toBe(false);
    expect(image.dropEffect).toBe('copy');
  });

  it('reads the drop and clears the drag-over state', async () => {
    const onPaste = vi.fn();
    render(<DropTarget onPaste={onPaste} />);
    const target = screen.getByTestId('target');
    const dataTransfer = dropData({ 'text/plain': 'dropped text' });
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    expect(over()).toBe('no');
    await act(flush);
    expect(screen.getByTestId('child').textContent).toBe('dropped text');
    expect(onPaste).toHaveBeenCalledWith(expect.objectContaining({ source: 'drop' }));
  });

  it('lets drops through with invalid options so the error is reported', async () => {
    render(<DropTarget accept={['not a type' as PasteAccept]} />);
    const target = screen.getByTestId('target');
    const dataTransfer = dropData({ 'text/plain': 'x' });
    expect(fireEvent.dragOver(target, { dataTransfer })).toBe(false);
    fireEvent.drop(target, { dataTransfer });
    await act(flush);
    expect(screen.getByTestId('child').textContent).toBe('invalid-payload');
  });
});

/* =========================================================== PasteField.Zone */

const announced = (): string | null | undefined => document.querySelector('[role="status"]')?.textContent;

describe('PasteField.Zone drops', () => {
  it('accepts drops by default, marks data-drag-over and announces the drop', async () => {
    render(
      <PasteField.Root label="Notes">
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    const zone = screen.getByTestId('zone');
    const dataTransfer = dropData({ 'text/plain': 'hi' });
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(zone.hasAttribute('data-drag-over')).toBe(true);
    fireEvent.drop(zone, { dataTransfer });
    expect(zone.hasAttribute('data-drag-over')).toBe(false);
    await act(flush);
    expect(zone.getAttribute('data-state')).toBe('read');
    expect(announced()).toBe('Dropped content added');
  });

  it('uses a custom dropped message and words drop errors as drops', async () => {
    const { unmount } = render(
      <PasteField.Root label="Notes" messages={{ dropped: (result) => `Dropped ${String(result.text)}` }}>
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    fireEvent.drop(screen.getByTestId('zone'), { dataTransfer: dropData({ 'text/plain': 'notes' }) });
    await act(flush);
    expect(announced()).toBe('Dropped notes');
    unmount();

    render(
      <PasteField.Root label="Notes" pasteOptions={{ maxBytes: 1 }}>
        <PasteField.Zone data-testid="zone" />
      </PasteField.Root>,
    );
    fireEvent.drop(screen.getByTestId('zone'), { dataTransfer: dropData({ 'text/plain': 'notes' }) });
    await act(flush);
    expect(announced()).toBe('The dropped content is too large.');
  });

  it('runs consumer drag handlers first and lets them take over', async () => {
    const onDragOver = vi.fn((event: { preventDefault(): void }) => {
      event.preventDefault();
    });
    const onDrop = vi.fn();
    const onDragEnter = vi.fn();
    const onDragLeave = vi.fn();
    render(
      <PasteField.Root label="Notes">
        <PasteField.Zone data-testid="zone" {...{ onDragOver, onDrop, onDragEnter, onDragLeave }} />
      </PasteField.Root>,
    );
    const zone = screen.getByTestId('zone');
    const dataTransfer = dropData({ 'text/plain': 'x' });
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.dragLeave(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });
    await act(flush);
    expect([onDragEnter, onDragOver, onDragLeave, onDrop].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(zone.getAttribute('data-state')).toBe('read');
  });

  it('keeps native drag behaviour with droppable={false}, still calling consumer handlers', async () => {
    const onDrop = vi.fn();
    render(
      <PasteField.Root label="Notes">
        <PasteField.Zone data-testid="zone" droppable={false} onDrop={onDrop} />
      </PasteField.Root>,
    );
    const zone = screen.getByTestId('zone');
    const dataTransfer = dropData({ 'text/plain': 'x' });
    fireEvent.dragEnter(zone, { dataTransfer });
    expect(zone.hasAttribute('data-drag-over')).toBe(false);
    expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(true);
    fireEvent.drop(zone, { dataTransfer });
    await act(flush);
    expect(onDrop).toHaveBeenCalledOnce();
    expect(zone.getAttribute('data-state')).toBe('idle');
  });
});
