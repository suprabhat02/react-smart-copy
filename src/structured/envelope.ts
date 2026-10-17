import { copyFailure } from '../core/errors';
import type { ClipFormatInfo } from './format';

/**
 * The wire format every carrier holds: `{"rsc":1,"id":…,"v":…,"data":…}`.
 * `rsc` is the envelope spec version; unknown extra keys are ignored for forward compatibility.
 */
export interface ClipEnvelope {
  readonly id: string;
  readonly version: number;
  readonly data: unknown;
}

const ENVELOPE_SPEC = 1;

/** The HTML attribute holding `id;base64url(envelope)`. Exported for documentation and tests. */
export const CLIP_HTML_ATTRIBUTE = 'data-rsc-clip';

function describeKey(key: string): string {
  return key === '' ? 'The data' : `"${key}"`;
}

/**
 * Rejects what `JSON.stringify` would silently change or drop, so the value that
 * is pasted is the value that was copied. `undefined` object properties are allowed
 * (they are simply absent, which schemas treat as optional).
 */
function strictReplacer(key: string, value: unknown): unknown {
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`${describeKey(key)} is ${String(value)}, which JSON turns into null.`);
      return value;
    case 'bigint':
      throw new TypeError(`${describeKey(key)} is a BigInt, which JSON cannot represent: encode it as a string.`);
    case 'function':
    case 'symbol':
      throw new TypeError(`${describeKey(key)} is a ${typeof value}, which JSON drops.`);
    case 'object':
      if (value instanceof Map || value instanceof Set || value instanceof WeakMap || value instanceof WeakSet) {
        throw new TypeError(`${describeKey(key)} is a ${value.constructor.name}, which JSON turns into {}: encode it as an array or object.`);
      }
      return value;
    default:
      return value;
  }
}

/** Serialises `data` into an envelope. Throws a classified `invalid-payload` failure. */
export function serializeEnvelope(format: ClipFormatInfo, data: unknown): string {
  let json: unknown;
  try {
    json = JSON.stringify(data, strictReplacer);
  } catch (cause) {
    const reason = cause instanceof TypeError ? cause.message : 'it could not be serialised (circular reference?).';
    throw copyFailure('invalid-payload', `Clip "${format.id}" data is not JSON-safe: ${reason}`, cause);
  }
  if (typeof json !== 'string') {
    throw copyFailure('invalid-payload', `Clip "${format.id}" data serialised to nothing (undefined, a function or a symbol).`);
  }
  // `id` matches /^[a-z0-9.-]+$/ (checked by defineClipFormat), so it needs no JSON escaping.
  return `{"rsc":${String(ENVELOPE_SPEC)},"id":"${format.id}","v":${String(format.version)},"data":${json}}`;
}

/** Own `__proto__` keys are dropped while parsing, so merging pasted data can never swap a prototype. */
function dropProtoKeys(key: string, value: unknown): unknown {
  return key === '__proto__' ? undefined : value;
}

const hasOwn = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

/** Parses and checks an envelope. Throws a `TypeError` describing what is wrong. */
export function parseEnvelope(text: string): ClipEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text, dropProtoKeys);
  } catch {
    throw new TypeError('The clipboard data is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('The clipboard data is not a clip envelope.');
  }
  const envelope = parsed as Record<string, unknown>;
  if (envelope['rsc'] !== ENVELOPE_SPEC) throw new TypeError('The clip envelope has an unknown spec version.');
  const id = envelope['id'];
  const version = envelope['v'];
  if (typeof id !== 'string') throw new TypeError('The clip envelope has no format id.');
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw new TypeError('The clip envelope has an invalid version.');
  }
  if (!hasOwn(envelope, 'data')) throw new TypeError('The clip envelope has no data.');
  return { id, version, data: envelope['data'] };
}
