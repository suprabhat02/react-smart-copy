// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeOtpText } from '../../src/otp';
import { isOtpChar, otpChars } from '../../src/otp/normalize';
import { extractOtp, OTP_SCAN_LENGTH } from '../../src/otp';

const code = (text: string, options?: Parameters<typeof extractOtp>[1]) => extractOtp(text, options)?.code ?? null;

describe('extractOtp: messages as they arrive', () => {
  it.each([
    ['Your verification code is 482913. Do not share it with anyone.', '482913'],
    ['482913 is your login code.', '482913'],
    ['G-482913 is your verification code.', '482913'],
    ['Use 482 913 to sign in.', '482913'],
    ['Your one-time password: 4829-13', '482913'],
    ['OTP for your transaction of Rs. 2,500.00 is 482913. Valid for 10 mins.', '482913'],
    ['Pay \u20B91500 with OTP 4829.', '4829'],
    ['Call +91 98765 43210 for help. Code: 4829', '4829'],
    ['Login at 10:30 on 23/10/2026. Code 482913', '482913'],
    ['Deliver to PIN code 201301. Your OTP is 4829', '4829'],
    ['Your order 123456 is on its way. Verification code: 9921', '9921'],
    ['Your 2FA token: 55 21 90', '552190'],
    ['\u0906\u092A\u0915\u093E \u0913\u091F\u0940\u092A\u0940 \u096A\u096E\u0968\u096F\u0967\u0969 \u0939\u0948\u0964', '482913'],
    ['\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642: \u0664\u0668\u0662\u0669\u0661\u0663', '482913'],
    ['\u3010\u94F6\u884C\u3011\u9A8C\u8BC1\u7801\uFF1A482913\uFF0C5\u5206\u949F\u5185\u6709\u6548\u3002', '482913'],
    ['\u8A8D\u8A3C\u30B3\u30FC\u30C9\uFF1A\uFF14\uFF18\uFF12\uFF19\uFF11\uFF13', '482913'],
    ['[\uC778\uC99D\uBC88\uD638] 482913', '482913'],
    ['\u0412\u0430\u0448 \u043A\u043E\u0434: 482913', '482913'],
    ['Tu c\u00F3digo es 482913', '482913'],
    ['Votre code de v\u00E9rification : 482913', '482913'],
  ])('%s', (text, expected) => {
    expect(code(text)).toBe(expected);
    expect(extractOtp(text)).toMatchObject({ confidence: 'high', domain: null });
  });

  it('takes a pasted code as it is', () => {
    expect(extractOtp('  482913 \n')).toEqual({ code: '482913', source: 'whole-text', confidence: 'high', domain: null });
    expect(code('482-913')).toBe('482913');
    expect(code('48 29 13')).toBe('482913');
    expect(code('\uFF14\uFF18\uFF12\uFF19')).toBe('4829');
    expect(code('482913', { length: 4 })).toBeNull();
    expect(code('abc')).toBeNull();
  });

  it('takes the only plausible number, with medium confidence', () => {
    expect(extractOtp('Hi! 482913')).toEqual({ code: '482913', source: 'only-candidate', confidence: 'medium', domain: null });
    // The same number twice is one candidate.
    expect(extractOtp('482913 again: 482913')?.source).toBe('only-candidate');
  });

  it('never guesses between numbers no word points at', () => {
    expect(code('Numbers 123456 and 654321.')).toBeNull();
    expect(code('Order #123456 shipped.')).toBeNull();
    expect(code('Total: $4829.50')).toBeNull();
    expect(code('Room 4829, flight 7731')).toBeNull();
    expect(code('Discount 4829% today')).toBeNull();
    expect(code('It costs 4829 INR')).toBeNull();
    expect(code('Visit https://example.com/verify/482913 with this code')).toBeNull();
    expect(code('Write to user482913@example.com')).toBeNull();
    expect(code('Track it at example.com/t/48291.')).toBeNull();
    expect(code('Your order 48291 of $1,249.00 ships on 24/10. Track it at example.com/t/48291.')).toBeNull();
    expect(code('See t.co/4829 or b\u00FCcher.de/4829 for the code')).toBeNull();
    // A sentence that runs on without a space is no link.
    expect(code('Your code is 482913.Thanks')).toBe('482913');
    expect(code('Mail me at 482913@example.com, code')).toBeNull();
    expect(code('Server 192.168.1.4829 is up')).toBeNull();
    expect(code('spinning 4829 and 1234')).toBeNull();
    // Parts of longer numbers, and thousands.
    expect(code('Code 12345 678901')).toBeNull();
    expect(code('Code 1234,567')).toBeNull();
    expect(code('Code 1,234', { length: 3 })).toBeNull();
    expect(code('')).toBeNull();
  });

  it('reads the origin-bound format, and refuses a code bound to another site', () => {
    const sms = 'Your code is 482913.\n\n@example.com #482913';
    expect(extractOtp(sms, { domain: 'example.com' })).toEqual({ code: '482913', source: 'origin-bound', confidence: 'high', domain: 'example.com' });
    expect(extractOtp(sms, { domain: 'EXAMPLE.com' })?.source).toBe('origin-bound');
    expect(extractOtp(sms, { domain: 'evil.example' })).toBeNull();
    expect(extractOtp('@top.example #AB12 @embedded.example', { alphabet: 'alphanumeric' })).toMatchObject({ code: 'AB12', domain: 'top.example' });
    expect(extractOtp('@example.com:8443 #4829')).toMatchObject({ domain: 'example.com:8443' });
    // A bound code of the wrong length is no code, but the text may still hold one.
    expect(code('Code 4829\n@example.com #12', { length: 4 })).toBe('4829');
  });

  it('reads alphanumeric codes, in capitals, with a digit', () => {
    expect(code('Your code: AB12-CD34', { alphabet: 'alphanumeric' })).toBe('AB12CD34');
    expect(code('ab12cd', { alphabet: 'alphanumeric' })).toBe('AB12CD');
    expect(code('Your code is K7Q2ZP', { alphabet: 'alphanumeric' })).toBe('K7Q2ZP');
    expect(code('Code: HELLO and WORLD', { alphabet: 'alphanumeric' })).toBeNull();
    expect(code('Code: ab12 cd34', { alphabet: 'numeric' })).toBeNull();
  });

  it('takes a length or a range, and refuses invalid ones', () => {
    expect(code('Code 12345678', { length: { min: 8, max: 8 } })).toBe('12345678');
    expect(code('Code 123', { length: 3 })).toBe('123');
    for (const length of [0, 33, 1.5, Number.NaN, { min: 6, max: 4 }, { min: 0, max: 4 }]) {
      expect(() => extractOtp('x', { length })).toThrow(expect.objectContaining({ copyError: expect.objectContaining({ type: 'invalid-payload' }) }));
    }
  });

  it('reads only the start of a very long text', () => {
    expect(code(`${'word '.repeat(OTP_SCAN_LENGTH / 5)}code 482913`)).toBeNull();
    expect(code(`code 482913 ${'word '.repeat(OTP_SCAN_LENGTH / 5)}`)).toBe('482913');
  });

  it('runs in linear time on hostile text', () => {
    const size = OTP_SCAN_LENGTH;
    const hostile = [
      '1'.repeat(size),
      '12 '.repeat(size / 3),
      '1234-'.repeat(size / 5),
      'code 1234 '.repeat(size / 10),
      'a@b.c '.repeat(size / 6),
      'x'.repeat(size),
      ' '.repeat(size),
      '$1 '.repeat(size / 3),
      'A1-'.repeat(size / 3),
    ];
    for (const text of hostile) {
      for (const alphabet of ['numeric', 'alphanumeric'] as const) {
        const started = performance.now();
        extractOtp(text, { alphabet });
        expect(performance.now() - started, `${alphabet}: ${text.slice(0, 12)}`).toBeLessThan(2000);
      }
    }
  });

  it('takes the number nearest a keyword', () => {
    expect(code('Code: these words come first, 1111, then code 4829')).toBe('4829');
  });

  it('keeps positions right in text whose lower case is longer', () => {
    expect(code('\u0130stanbul giri\u015F kodu: 4829')).toBe('4829');
  });

  it('ignores a keyword inside the code itself', () => {
    expect(code('Use OTP4KX2', { alphabet: 'alphanumeric' })).toBe('OTP4KX2');
  });

  it('prefers the number a keyword points at, before one after it', () => {
    expect(code('Your code 482913, reference 7731 code')).toBe('482913');
    expect(code('Ref 7731. Your verification code is 482913')).toBe('482913');
  });
});

describe('normalizeOtpText', () => {
  it('reads digits of many scripts and full-width characters as ASCII', () => {
    expect(normalizeOtpText('\u0664\u06F8\u0968\u09EF\u0A67\u0AE9', 'numeric')).toBe('482913');
    expect(normalizeOtpText('\u0B6A\u0BEB\u0C6C\u0CEF\u0D67\u0E52\u0ED3\u0F24\u1045\u17E6', 'numeric')).toBe('4569123456');
    expect(normalizeOtpText('\uFF21\uFF42\uFF11', 'alphanumeric')).toBe('AB1');
    expect(normalizeOtpText('ab1', 'numeric')).toBe('ab1');
    expect(normalizeOtpText('\u00E9', 'numeric')).toBe('\u00E9');
  });

  it('knows which characters a code can have', () => {
    expect(isOtpChar('7', 'numeric')).toBe(true);
    expect(isOtpChar('A', 'numeric')).toBe(false);
    expect(isOtpChar('A', 'alphanumeric')).toBe(true);
    expect(isOtpChar('a', 'alphanumeric')).toBe(false);
    expect(isOtpChar('77', 'numeric')).toBe(false);
    expect(otpChars('4-8 a\u0967', 'numeric')).toEqual(['4', '8', '1']);
    expect(otpChars('4-8 a', 'alphanumeric')).toEqual(['4', '8', 'A']);
  });
});
