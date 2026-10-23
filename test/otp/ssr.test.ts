// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createOtpField, extractOtp, normalizeOtpText } from '../../src/otp';

describe('react-smart-copy/otp on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof document).toBe('undefined');
  });

  it('reads codes anywhere: a webhook with an SMS, a mail parser', () => {
    expect(extractOtp('Your Example code is 482913. Do not share it.\n\n@example.com #482913', { domain: 'example.com' })).toEqual({
      code: '482913',
      source: 'origin-bound',
      confidence: 'high',
      domain: 'example.com',
    });
    expect(normalizeOtpText('\uFF14\uFF18\uFF12', 'numeric')).toBe('482');
  });

  it('makes a field that needs no DOM until it is attached', () => {
    const field = createOtpField({ length: 4, webOtp: true });
    field.setValue('4829');
    expect(field.getSnapshot()).toMatchObject({ value: '4829', complete: true, webOtp: 'idle' });
    field.clear();
    field.focus();
    expect(field.getSnapshot().value).toBe('');
  });
});
