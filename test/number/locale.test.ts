// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { numberSymbols } from '../../src/number';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('numberSymbols', () => {
  it('reads each locale\'s separators and grouping', () => {
    expect(numberSymbols('en-US')).toEqual({ decimal: '.', group: ',', primary: 3, secondary: 3 });
    expect(numberSymbols('de-DE')).toEqual({ decimal: ',', group: '.', primary: 3, secondary: 3 });
    expect(numberSymbols('en-IN')).toEqual({ decimal: '.', group: ',', primary: 3, secondary: 2 });
    expect(numberSymbols('fr-FR')).toMatchObject({ decimal: ',', group: '\u202F' });
    // ICU versions differ: a straight or a curly apostrophe.
    expect(numberSymbols('de-CH')).toMatchObject({ decimal: '.', group: expect.stringMatching(/^['\u2019]$/) });
    // Arabic writes its own digits and separators; in Latin digits, it uses these.
    expect(numberSymbols('ar-EG').decimal).toBe('.');
  });

  it('caches a few locales, and forgets them when there are too many', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat');
    numberSymbols('es-ES');
    numberSymbols('es-ES');
    expect(spy).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 40; index += 1) numberSymbols(`en-u-nu-latn-x-${String(index).padStart(3, '0')}`);
    spy.mockClear();
    numberSymbols('es-ES');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('has no group separator for a locale that writes none', () => {
    const parts = [{ type: 'integer', value: '123456789012' }, { type: 'decimal', value: '.' }, { type: 'fraction', value: '5' }];
    vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (this: unknown) {
      return { formatToParts: () => parts } as unknown as Intl.NumberFormat;
    });
    expect(numberSymbols('x-ungrouped')).toEqual({ decimal: '.', group: '', primary: 12, secondary: 12 });
  });
});
