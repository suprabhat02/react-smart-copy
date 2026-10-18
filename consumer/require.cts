// A CommonJS consumer: resolves the `require` conditions and their .d.cts declarations.
import code = require('react-smart-copy/code');
import core = require('react-smart-copy/core');

export const danger: boolean = code.inspectCode('x').danger;
export const kinds: readonly string[] = code.CODE_FINDING_KINDS;
export const error = core.createCopyError('unknown', 'x');
