// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CopyToClipboard } from '../../src/compat';

describe('react-smart-copy/compat on the server', () => {
  it('renders the child alone, touching no browser API', () => {
    expect(typeof window).toBe('undefined');
    const html = renderToString(
      <CopyToClipboard text="x" {...({ className: 'copy' } as object)}>
        <button type="button">Copy</button>
      </CopyToClipboard>,
    );
    expect(html).toBe('<button type="button" class="copy">Copy</button>');
  });
});
