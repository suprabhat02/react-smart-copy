/**
 * `react-smart-copy/share`
 *
 * Share with the device's share sheet where people expect one, and copy a titled
 * link everywhere else, with one call and honest, typed outcomes.
 *
 * - {@link shareOrCopy}: share or copy, with typed outcomes. Never rejects.
 * - {@link shareMethod}: how a share would happen right now.
 *
 * For React, `useShare` from `react-smart-copy` adds state for the button and
 * `method` to label it ("Share…" or "Copy link"). Framework-agnostic otherwise.
 *
 * Links are validated like everything in `react-smart-copy/link`: allowed schemes
 * only (never `javascript:`), credentials removed, titles cleaned.
 *
 * @module
 */

export {
  describeShareError,
  shareMethod,
  shareOrCopy,
  type CopyReason,
  type ResolvedShare,
  type ShareContent,
  type ShareEnvironment,
  type ShareMethod,
  type ShareMode,
  type ShareOptions,
  type ShareOutcome,
} from './share';
