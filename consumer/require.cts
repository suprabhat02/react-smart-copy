// A CommonJS consumer: resolves the `require` conditions and their .d.cts declarations.
import code = require('react-smart-copy/code');
import core = require('react-smart-copy/core');
import image = require('react-smart-copy/image');
import link = require('react-smart-copy/link');
import share = require('react-smart-copy/share');
import color = require('react-smart-copy/color');
import rich = require('react-smart-copy/rich');
import files = require('react-smart-copy/files');

export const danger: boolean = code.inspectCode('x').danger;
export const kinds: readonly string[] = code.CODE_FINDING_KINDS;
export const error = core.createCopyError('unknown', 'x');
export const kinds2: readonly string[] = image.METADATA_KINDS;
export const protocols: readonly string[] = link.DEFAULT_LINK_PROTOCOLS;
export const method: 'native' | 'copy' = share.shareMethod({ mode: 'copy' });
export const formats: readonly string[] = color.COLOR_FORMATS;
export const richText: string = rich.plainText(document.body);
export const richPasted: string = rich.pasteToRich({ text: 'x' })?.html ?? '';
export const safeName: string = files.safeFileName('../a.txt');
export const risks: readonly string[] = files.FILE_RISKS;
