// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { colorPayload, contrastRatio, formatColor, readColor } from '../../src/color';

describe('react-smart-copy/color on the server', () => {
  it('parses, converts, checks contrast and builds payloads without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(formatColor('rebeccapurple', 'oklch')).toBe('oklch(44.03% 0.1603 303.37)');
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 10);
    expect(colorPayload('#fff', { swatch: false })).toEqual({ kind: 'text', value: '#ffffff' });
    expect(readColor('color: red;')).not.toBeNull();
  });
});
