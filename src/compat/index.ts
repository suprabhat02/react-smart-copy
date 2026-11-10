/**
 * Drop-in replacements for other clipboard libraries' APIs, so moving to this one is a change of
 * import. Each keeps the API it replaces; where behaviour differs, the docs say how and why.
 */
import { CopyToClipboard } from './CopyToClipboard';

export { CopyToClipboard, compatPayload } from './CopyToClipboard';
export type { CopyFinishedOutcome, CopyToClipboardOptions, CopyToClipboardProps } from './CopyToClipboard';
/** `import CopyToClipboard from "react-copy-to-clipboard"` keeps working with this import too. */
export default CopyToClipboard;
