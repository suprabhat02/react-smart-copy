import { describe, expectTypeOf, it } from 'vitest';
import { useOtpField, type OtpInputProps, type UseOtpFieldResult } from '../../src';
import { createOtpField, extractOtp, normalizeOtpText, type OtpField, type OtpMatch, type OtpSnapshot, type OtpSource, type WebOtpStatus } from '../../src/otp';

describe('otp types', () => {
  it('extracts codes', () => {
    expectTypeOf(extractOtp('x', { length: { min: 4, max: 6 }, alphabet: 'alphanumeric', domain: 'example.com' })).toEqualTypeOf<OtpMatch | null>();
    expectTypeOf<OtpMatch['source']>().toEqualTypeOf<OtpSource>();
    expectTypeOf<OtpMatch['confidence']>().toEqualTypeOf<'high' | 'medium'>();
    expectTypeOf(normalizeOtpText('x', 'numeric')).toEqualTypeOf<string>();
    // @ts-expect-error: not an alphabet
    void extractOtp('x', { alphabet: 'hex' });
    // @ts-expect-error: a length range has a min and a max
    void extractOtp('x', { length: { min: 4 } });
  });

  it('makes a field', () => {
    const field = createOtpField({ length: 6, onComplete: (code) => expectTypeOf(code).toEqualTypeOf<string>() });
    expectTypeOf(field).toEqualTypeOf<OtpField>();
    expectTypeOf(field.getSnapshot()).toEqualTypeOf<OtpSnapshot>();
    expectTypeOf<OtpSnapshot['webOtp']>().toEqualTypeOf<WebOtpStatus>();
    expectTypeOf(field.attach).parameter(0).toEqualTypeOf<readonly HTMLInputElement[]>();
    // @ts-expect-error: snapshots are read-only
    field.getSnapshot().value = 'x';
  });

  it('gives React props for each box', () => {
    const otp = useOtpField({ length: 4, webOtp: true });
    expectTypeOf(otp).toEqualTypeOf<UseOtpFieldResult>();
    expectTypeOf(otp.getInputProps(0)).toEqualTypeOf<OtpInputProps>();
    expectTypeOf(otp.value).toEqualTypeOf<string>();
    expectTypeOf<OtpInputProps['autoComplete']>().toEqualTypeOf<'one-time-code' | 'off'>();
  });
});
