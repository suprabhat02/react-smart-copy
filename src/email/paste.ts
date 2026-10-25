import { asTextField, insertText } from '../core/text-field';
import { parseAddresses, type AddressList, type ParseAddressesOptions } from './parse';

/** What {@link pasteAddresses} did. */
export type AddressPasteOutcome =
  /** The paste held addresses (or tried to): `onAddresses` was called with them. */
  | 'parsed'
  /** No `@` in the paste (a name being searched for, say), or no text: left to the browser. */
  | 'ignored';

export interface PasteAddressesOptions extends ParseAddressesOptions {
  /** Called with what the paste held: add `addresses` as recipients, show `invalid`. */
  readonly onAddresses: (list: AddressList) => void;
  /**
   * Put the entries that were not addresses into the field, so people can correct them.
   * Default `true`. Works on `<textarea>`s and text `<input>`s, with undo intact.
   */
  readonly keepInvalid?: boolean;
}

/** Structural paste event: a DOM `ClipboardEvent` and React's `onPaste` event both fit. */
export interface AddressPasteEvent {
  readonly clipboardData: { getData(format: string): string } | null;
  readonly currentTarget: EventTarget | null;
  readonly target: EventTarget | null;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/**
 * A paste handler for recipient fields: To and Cc boxes, invite and share dialogs. A list
 * copied from Outlook, Gmail or a spreadsheet becomes addresses for your chips; what was not
 * an address stays in the field to be corrected. Typing and pasting a name are left alone.
 *
 * @example
 * <input
 *   type="email"
 *   multiple
 *   onPaste={(event) => pasteAddresses(event, { onAddresses: ({ addresses }) => addRecipients(addresses) })}
 * />
 */
export function pasteAddresses(event: AddressPasteEvent, options: PasteAddressesOptions): AddressPasteOutcome {
  if (event.defaultPrevented || event.clipboardData === null) return 'ignored';
  const text = event.clipboardData.getData('text/plain');
  if (!/[@\uFF20]/.test(text)) return 'ignored';
  event.preventDefault();
  const list = parseAddresses(text, options);
  options.onAddresses(list);
  if (options.keepInvalid !== false && list.invalid.length > 0) {
    const field = asTextField(event.currentTarget) ?? asTextField(event.target);
    if (field !== null) insertText(field, list.invalid.map((entry) => entry.text).join(', '));
  }
  return 'parsed';
}
