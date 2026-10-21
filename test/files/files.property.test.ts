import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hasHiddenCharacters } from '../../src/files/name';
import { acceptFiles, detectFileType, FILE_RISKS, FILE_TYPES, inspectFile, safeFileName } from '../../src/files';
import { runs } from '../property';
import { bytes, SAMPLES } from './fixtures';

/** Names as people and attackers make them: any Unicode, path separators, dots, reserved names, controls. */
const names = fc.oneof(
  fc.string({ unit: 'binary', maxLength: 80 }),
  fc
    .array(
      fc.constantFrom('a', 'Z', '.', ' ', '/', '\\', ':', '*', '?', '"', '<', '>', '|', 'CON', 'nul', 'com1', 'pdf', 'exe', '\u00E9', '\u0301', '\u202E', '\u200B', '\u0000', '\t', '\u{1F600}', '\u5831'),
      { maxLength: 40 },
    )
    .map((parts) => parts.join('')),
);

const encoder = new TextEncoder();

describe('safeFileName, for any name', () => {
  it('is safe to show and store on any operating system, and idempotent', () => {
    fc.assert(
      fc.property(names, fc.integer({ min: 1, max: 300 }), (name, maxBytes) => {
        const safe = safeFileName(name, { maxBytes });
        expect(safe.length).toBeGreaterThan(0);
        expect(safe).not.toMatch(/[<>:"/\\|?*]/);
        expect(hasHiddenCharacters(safe)).toBe(false);
        expect(safe).not.toMatch(/^[\s.]|[\s.]$/u);
        expect(safe).toBe(safe.normalize('NFC'));
        expect(safe.split('.')[0]?.trim()).not.toMatch(/^(?:con|prn|aux|nul|com\d|lpt\d)$/i);
        expect(encoder.encode(safe).length).toBeLessThanOrEqual(Math.max(16, maxBytes));
        expect(safeFileName(safe, { maxBytes })).toBe(safe);
      }),
      runs(400),
    );
  });
});

/** Types recognised by a signature, whose type extra bytes after the header cannot change. */
const BINARY = Object.keys(SAMPLES).filter((key) => !['script', 'html', 'xml', 'json', 'svg', 'text', 'rtf', 'tar', 'mp3', 'webm', 'mkv'].includes(key));

describe('detectFileType, for any bytes', () => {
  it('never throws, and is deterministic', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 600 }), (data) => {
        const type = detectFileType(data);
        expect(detectFileType(data)).toBe(type);
        if (type !== null) expect(Object.values(FILE_TYPES)).toContain(type);
      }),
      runs(500),
    );
  });

  it('keeps a signature type whatever follows the header', () => {
    fc.assert(
      fc.property(fc.constantFrom(...BINARY), fc.uint8Array({ maxLength: 300 }), (key, tail) => {
        expect(detectFileType(bytes(SAMPLES[key] as Uint8Array, tail))).toBe(FILE_TYPES[key as keyof typeof FILE_TYPES]);
      }),
      runs(300),
    );
  });
});

describe('inspectFile and acceptFiles, for any files', () => {
  const files = fc.array(
    fc.record({
      name: names,
      data: fc.oneof(fc.uint8Array({ maxLength: 64 }), fc.constantFrom(...Object.values(SAMPLES))),
    }),
    { maxLength: 8 },
  );

  it('inspects any file: risks in order, the safe name, a type', async () => {
    await fc.assert(
      fc.asyncProperty(names, fc.uint8Array({ maxLength: 64 }), async (name, data) => {
        const inspection = await inspectFile(new Blob([data]), { name });
        expect(inspection.safeName).toBe(safeFileName(name));
        expect(FILE_RISKS.filter((risk) => inspection.risks.includes(risk))).toEqual(inspection.risks);
        expect(inspection.type).toBe(inspection.detected === null ? 'application/octet-stream' : inspection.type);
        expect(inspection.risks.includes('type-mismatch')).toBe(inspection.mismatch);
      }),
      runs(200),
    );
  });

  it('accounts for every file, accepts none with a blocked risk, and adds up the bytes', async () => {
    await fc.assert(
      fc.asyncProperty(files, fc.subarray([...FILE_RISKS]), async (list, block) => {
        const blobs = list.map(({ name, data }) => new File([data as BlobPart], name));
        const result = await acceptFiles(blobs, { block });
        expect(result.accepted.length + result.rejected.length).toBe(list.length);
        expect(result.truncated).toBe(false);
        for (const item of result.accepted) {
          expect(item.inspection.risks.some((risk) => block.includes(risk))).toBe(false);
          expect(item.name).toBe(safeFileName(item.name));
          expect(item.upload.size).toBe(item.size);
        }
        expect(result.totalBytes).toBe(result.accepted.reduce((total, item) => total + item.size, 0));
      }),
      runs(150),
    );
  });
});
