// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { prepareRich, richTransform } from '../../src/rich';

describe('react-smart-copy/rich on the server', () => {
  it('says that reading HTML text needs a DOM, with a typed error', () => {
    expect(typeof document).toBe('undefined');
    expect(() => prepareRich('<p>x</p>')).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'unsupported' }) }));
    expect(richTransform()({ kind: 'copy', text: 'x', html: null, fragment: null, field: null, editable: false })).toBeUndefined();
  });
});
