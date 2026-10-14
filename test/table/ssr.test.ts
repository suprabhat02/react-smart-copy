// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fromRows, parseTable, tablePayload, toRecords } from '../../src/table';

describe('react-smart-copy/table on the server', () => {
  it('has no DOM to rely on here', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof DOMParser).toBe('undefined');
  });

  it('builds payloads without a DOM', () => {
    const payload = tablePayload(fromRows([{ a: 'x', n: 1 }], [{ header: 'A', value: 'a' }, { header: 'N', value: 'n' }]));
    expect(payload).toMatchObject({ kind: 'html', text: 'A\tN\r\nx\t1' });
    expect(payload.html).toContain('<table>');
  });

  it('parses: HTML needs a DOM, so it falls back to the text flavour', () => {
    const table = parseTable({ html: '<table><tr><td>from html</td></tr></table>', text: 'from\ttext' });
    expect(table).toMatchObject({ source: 'text', rows: [['from', 'text']] });
    expect(parseTable({ html: '<table><tr><td>x</td></tr></table>', text: null })).toBeNull();
  });

  it('maps records without a DOM', () => {
    expect(toRecords(parseTable('a\tb\n1\t2', { headers: true })!, { a: { parse: Number } }).records).toEqual([{ a: 1 }]);
  });
});
