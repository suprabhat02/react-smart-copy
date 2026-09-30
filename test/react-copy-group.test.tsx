import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ClipboardAdapter } from '../src/core/clipboard-adapter';
import { createCopyCoordinator } from '../src/core/copy-coordinator';
import { CopyField } from '../src/react/CopyField';
import { CopyGroup, useCopyGroup } from '../src/react/CopyGroup';
import { useCopy, type UseCopyOptions } from '../src/react/useCopy';

const instant: ClipboardAdapter = { write: () => Promise.resolve() };

function Row({ id, options }: { readonly id: string; readonly options?: UseCopyOptions }) {
  const { copy, status } = useCopy({ adapter: instant, ...options });
  return (
    <button type="button" data-testid={id} data-status={status} onClick={() => void copy(id)}>
      {id}
    </button>
  );
}

const status = (id: string): string | null => screen.getByTestId(id).getAttribute('data-status');

async function click(id: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByTestId(id));
    await Promise.resolve();
  });
}

describe('<CopyGroup>', () => {
  it('shows "copied" on one row at a time', async () => {
    render(
      <CopyGroup>
        <Row id="a" />
        <Row id="b" />
      </CopyGroup>,
    );
    await click('a');
    expect(status('a')).toBe('copied');
    await click('b');
    expect(status('a')).toBe('idle');
    expect(status('b')).toBe('copied');
  });

  it('works with CopyField out of the box', async () => {
    render(
      <CopyGroup>
        {['email', 'phone'].map((label) => (
          <CopyField.Root key={label} value={label} label={label} copyOptions={{ adapter: instant }} data-testid={label}>
            <CopyField.Trigger>{label}</CopyField.Trigger>
          </CopyField.Root>
        ))}
      </CopyGroup>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('email'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('phone'));
      await Promise.resolve();
    });
    expect(screen.getByTestId('email').getAttribute('data-state')).toBe('idle');
    expect(screen.getByTestId('phone').getAttribute('data-state')).toBe('copied');
  });

  it('lets a member opt out with coordinator: null', async () => {
    render(
      <CopyGroup>
        <Row id="a" options={{ coordinator: null }} />
        <Row id="b" />
      </CopyGroup>,
    );
    await click('a');
    await click('b');
    expect(status('a')).toBe('copied');
  });

  it('shares an external coordinator across separate groups', async () => {
    const coordinator = createCopyCoordinator();
    render(
      <>
        <CopyGroup coordinator={coordinator}>
          <Row id="a" />
        </CopyGroup>
        <CopyGroup coordinator={coordinator}>
          <Row id="b" />
        </CopyGroup>
      </>,
    );
    await click('a');
    await click('b');
    expect(status('a')).toBe('idle');
  });

  it('isolates separate groups and ungrouped hooks', async () => {
    render(
      <>
        <CopyGroup>
          <Row id="a" />
        </CopyGroup>
        <CopyGroup>
          <Row id="b" />
        </CopyGroup>
        <Row id="c" />
      </>,
    );
    await click('a');
    await click('b');
    await click('c');
    expect([status('a'), status('b'), status('c')]).toEqual(['copied', 'copied', 'copied']);
  });

  it('useCopyGroup returns null outside a group', () => {
    let seen: unknown = 'unset';
    function Probe() {
      seen = useCopyGroup();
      return null;
    }
    render(<Probe />);
    expect(seen).toBeNull();
  });
});
