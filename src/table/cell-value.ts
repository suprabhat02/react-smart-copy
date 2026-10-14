import type { TableCell } from './serialize';

function isDate(value: unknown): value is Date {
  return value instanceof Date || Object.prototype.toString.call(value) === '[object Date]';
}

function json(value: unknown): string {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === 'string' ? encoded : '';
  } catch {
    // Circular structures and BigInt inside objects.
    return Object.prototype.toString.call(value);
  }
}

/** One list item as text. Nested lists and objects become JSON: no recursion, so cycles are safe. */
function itemText(value: unknown): string {
  if (value === null || value === undefined) return '';
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    case 'function':
    case 'symbol':
      return '';
  }
  if (isDate(value)) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return json(value);
}

/**
 * Turns whatever a grid holds into a cell: primitives and dates as they are, arrays as
 * a comma-separated list, other objects as JSON. Never throws, so one odd value can't
 * break a copy of thousands of rows.
 */
export function toCellValue(value: unknown): TableCell {
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'undefined':
      return value;
    case 'function':
    case 'symbol':
      return '';
  }
  if (value === null) return null;
  if (isDate(value)) return Number.isNaN(value.getTime()) ? '' : value;
  if (Array.isArray(value)) return value.map(itemText).join(', ');
  return json(value);
}
