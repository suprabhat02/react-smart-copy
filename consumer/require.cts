// A CommonJS consumer: resolves the `require` conditions and their .d.cts declarations.
import code = require('react-smart-copy/code');
import core = require('react-smart-copy/core');
import image = require('react-smart-copy/image');

export const danger: boolean = code.inspectCode('x').danger;
export const kinds: readonly string[] = code.CODE_FINDING_KINDS;
export const error = core.createCopyError('unknown', 'x');
export const kinds2: readonly string[] = image.METADATA_KINDS;
