import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCopyCoordinator } from '../src/core/copy-coordinator';
import { createCopyMachine } from '../src/core/copy-machine';
import { createControllableAdapter, flush, permissionDenied } from './helpers';

afterEach(() => {
  vi.useRealTimers();
});

describe('createCopyCoordinator', () => {
  it('releases the previous member when another activates, and tracks the active one', () => {
    const coordinator = createCopyCoordinator();
    const a = { release: vi.fn() };
    const b = { release: vi.fn() };
    expect(coordinator.getActive()).toBeNull();

    coordinator.activate(a);
    coordinator.activate(a); // re-activating yourself never releases yourself
    expect(a.release).not.toHaveBeenCalled();

    coordinator.activate(b);
    expect(a.release).toHaveBeenCalledOnce();
    expect(coordinator.getActive()).toBe(b);

    coordinator.deactivate(a); // not active: no effect
    expect(coordinator.getActive()).toBe(b);
    coordinator.deactivate(b);
    expect(coordinator.getActive()).toBeNull();
  });
});

describe('copy machines sharing a coordinator', () => {
  const pair = () => {
    const coordinator = createCopyCoordinator();
    const a = createCopyMachine({ coordinator, adapter: { write: () => Promise.resolve() } });
    const b = createCopyMachine({ coordinator, adapter: { write: () => Promise.resolve() } });
    return { coordinator, a, b };
  };

  it('only one member shows copied at a time', async () => {
    const { a, b } = pair();
    await a.copy('a');
    expect(a.getSnapshot().status).toBe('copied');
    await b.copy('b');
    expect(a.getSnapshot().status).toBe('idle');
    expect(b.getSnapshot().status).toBe('copied');
  });

  it('a failed copy does not release the member that still owns the clipboard', async () => {
    const coordinator = createCopyCoordinator();
    const a = createCopyMachine({ coordinator, adapter: { write: () => Promise.resolve() } });
    const failing = createControllableAdapter();
    const b = createCopyMachine({ coordinator, adapter: failing.adapter });
    await a.copy('a');
    const outcome = b.copy('b');
    failing.reject(permissionDenied);
    await outcome;
    expect(a.getSnapshot().status).toBe('copied');
    expect(b.getSnapshot().status).toBe('error');
  });

  it('release is a no-op for members that are not copied (e.g. still copying)', async () => {
    const coordinator = createCopyCoordinator();
    const slow = createControllableAdapter();
    const a = createCopyMachine({ coordinator, adapter: slow.adapter });
    const b = createCopyMachine({ coordinator, adapter: { write: () => Promise.resolve() } });
    await b.copy('b');
    void a.copy('a');
    coordinator.getActive()?.release(); // b released…
    expect(b.getSnapshot().status).toBe('idle');
    coordinator.activate({ release: vi.fn() });
    expect(a.getSnapshot().status).toBe('copying'); // …but a in-flight copy is never touched
    slow.resolve();
    await flush();
    expect(a.getSnapshot().status).toBe('copied');
  });

  it('leaving copied on its own (auto-reset, reset, re-copy) deactivates the member', async () => {
    vi.useFakeTimers();
    const { coordinator, a } = pair();
    await a.copy('a');
    expect(coordinator.getActive()).not.toBeNull();
    vi.advanceTimersByTime(2000);
    expect(a.getSnapshot().status).toBe('idle');
    expect(coordinator.getActive()).toBeNull();

    await a.copy('again');
    a.reset();
    expect(coordinator.getActive()).toBeNull();
  });

  it('re-copying from copied keeps exactly one active member', async () => {
    const { coordinator, a, b } = pair();
    await a.copy('1');
    await a.copy('2');
    expect(a.getSnapshot().status).toBe('copied');
    await b.copy('3');
    expect(a.getSnapshot().status).toBe('idle');
    expect(coordinator.getActive()).not.toBeNull();
  });

  it('machines without a coordinator (or with null) are unaffected', async () => {
    const coordinator = createCopyCoordinator();
    const grouped = createCopyMachine({ coordinator, adapter: { write: () => Promise.resolve() } });
    const loner = createCopyMachine({ coordinator: null, adapter: { write: () => Promise.resolve() } });
    await loner.copy('x');
    await grouped.copy('y');
    expect(loner.getSnapshot().status).toBe('copied');
    expect(grouped.getSnapshot().status).toBe('copied');
  });
});
