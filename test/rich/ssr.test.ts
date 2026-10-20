// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pasteToRich, prepareRich, richTransform } from '../../src/rich';

describe('react-smart-copy/rich on the server', () => {
  it('says that reading HTML text needs a DOM, with a typed error', () => {
    expect(typeof document).toBe('undefined');
    expect(() => prepareRich('<p>x</p>')).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'unsupported' }) }));
    expect(richTransform()({ kind: 'copy', text: 'x', html: null, fragment: null, field: null, editable: false })).toBeUndefined();
  });

  it('pastes plain text without a DOM: HTML needs one, so the text is used', () => {
    expect(pasteToRich({ html: '<p><b>x</b></p>', text: 'x\ny' })).toEqual({ html: '<p>x<br>y</p>', text: 'x\ny', removed: [], truncated: false, source: 'text' });
    expect(pasteToRich({ html: '<p>x</p>' })).toBeNull();
  });
});
