import { copyFailure } from '../core/errors';

/** Bounds-checked reads over a byte array: out-of-range reads return `null`, never garbage. */
export class Bytes {
  readonly data: Uint8Array;
  readonly length: number;

  constructor(data: Uint8Array) {
    this.data = data;
    this.length = data.length;
  }

  u8(at: number): number | null {
    return at >= 0 && at < this.length ? (this.data[at] as number) : null;
  }

  u16(at: number, littleEndian: boolean): number | null {
    if (at < 0 || at + 2 > this.length) return null;
    const a = this.data[at] as number;
    const b = this.data[at + 1] as number;
    return littleEndian ? a | (b << 8) : (a << 8) | b;
  }

  u24le(at: number): number | null {
    if (at < 0 || at + 3 > this.length) return null;
    return (this.data[at] as number) | ((this.data[at + 1] as number) << 8) | ((this.data[at + 2] as number) << 16);
  }

  u32(at: number, littleEndian: boolean): number | null {
    if (at < 0 || at + 4 > this.length) return null;
    const a = this.data[at] as number;
    const b = this.data[at + 1] as number;
    const c = this.data[at + 2] as number;
    const d = this.data[at + 3] as number;
    // `>>> 0` keeps the result unsigned.
    return (littleEndian ? a | (b << 8) | (c << 16) | (d << 24) : (a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  }

  /** `length` bytes as Latin-1 text (four-character codes, signatures), or `null` past the end. */
  ascii(at: number, length: number): string | null {
    if (at < 0 || at + length > this.length) return null;
    return String.fromCharCode(...this.data.subarray(at, at + length));
  }

  startsWith(at: number, signature: string): boolean {
    return this.ascii(at, signature.length) === signature;
  }

  /** The same bytes, ending at `end`: reads of a box or chunk then can't run into the next one. Offsets don't change. */
  until(end: number): Bytes {
    return end >= this.length ? this : new Bytes(this.data.subarray(0, end));
  }

  slice(start: number, end: number): Uint8Array {
    return this.data.subarray(Math.max(0, start), Math.min(this.length, end));
  }
}

export const DEFAULT_IMAGE_MAX_INPUT_BYTES = 100 * 1024 * 1024;

/** Reads a Blob into memory, refusing anything larger than `maxBytes`. */
export async function readBlob(blob: Blob, maxBytes: number): Promise<Bytes> {
  const candidate: unknown = blob; // Plain-JS callers can pass anything.
  if (typeof candidate !== 'object' || candidate === null || typeof (candidate as { size?: unknown }).size !== 'number') {
    throw copyFailure('invalid-payload', 'Expected an image Blob or File.');
  }
  if (blob.size > maxBytes) {
    throw copyFailure('too-large', `The image is ${String(blob.size)} bytes; maxInputBytes is ${String(maxBytes)}.`);
  }
  return new Bytes(new Uint8Array(await blob.arrayBuffer()));
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function u32be(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

export function u32le(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

export const latin1 = (text: string): Uint8Array => Uint8Array.from(text, (char) => char.charCodeAt(0));

/** A Blob (or a File with the same name and date, when the input was one) holding `parts`. */
export function outputBlob(parts: readonly Uint8Array[], type: string, like: Blob): Blob {
  const data = concat(parts);
  const file = like as Partial<File>;
  if (typeof File === 'function' && typeof file.name === 'string') {
    return new File([data as BlobPart], file.name, { type, lastModified: file.lastModified ?? Date.now() });
  }
  return new Blob([data as BlobPart], { type });
}
