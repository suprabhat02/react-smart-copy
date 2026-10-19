import { version } from 'react';
import { version as domVersion } from 'react-dom';
import { describe, expect, it } from 'vitest';

describe('the React these tests run on', () => {
  it('is the one the compatibility job asked for, for react and react-dom alike', () => {
    const major = process.env['REACT_VERSION'] ?? '19';
    expect(version.split('.')[0]).toBe(major);
    expect(domVersion).toBe(version);
  });
});
