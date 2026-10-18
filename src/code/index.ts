/**
 * `react-smart-copy/code`
 *
 * Copy and paste code the way developers expect, and safely. Framework-agnostic
 * and free of dependencies: use it with `useCopy`, `CopyField` and `usePaste`, or
 * on its own.
 *
 * - Copy: {@link codePayload} turns a string or a rendered, highlighted code block
 *   into plain text plus monospaced HTML with its colours. Terminal and REPL
 *   sessions copy as their commands, diffs as one side of the change, and
 *   line-number gutters and Copy buttons are left out.
 * - Paste: {@link pasteAsCode} is a ready paste handler that cleans the code,
 *   dedents it and indents it to the cursor, with undo intact;
 *   {@link pasteToCode} does the same for custom flows.
 * - Security: {@link inspectCode} finds Trojan Source bidi overrides, invisible
 *   identifiers, hidden tag characters and lookalike letters; {@link cleanCode}
 *   removes or replaces them.
 *
 * @module
 */

export {
  CODE_FINDING_KINDS,
  DEFAULT_CODE_MAX_FINDINGS,
  cleanCode,
  inspectCode,
  type CleanCode,
  type CleanCodeOptions,
  type CodeFinding,
  type CodeFindingKind,
  type CodeFindingSeverity,
  type CodeInspection,
  type InspectCodeOptions,
} from './inspect';
export { PROMPT_STYLES, normalizeCode, type CodeTextOptions, type PromptPattern, type PromptStyle } from './normalize';
export { codeFromElement, codePayload, type CodeFromElementOptions, type CodePayloadOptions, type CodeSource } from './payload';
export {
  DEFAULT_CODE_MAX_LENGTH,
  pasteAsCode,
  pasteToCode,
  type CodePasteEvent,
  type CodePasteSource,
  type PasteAsCodeOptions,
  type PasteCode,
  type PasteToCodeOptions,
} from './paste';
export { insertText } from '../core/text-field';
