---
'react-smart-copy': minor
---

Consistent limits, and a way to test against real clipboards.

- `parseNumber`, `parseAddresses` and `extractOtp` take a `maxLength` option, like the other
  text parsers. Their limits are now named `DEFAULT_NUMBER_MAX_LENGTH`,
  `DEFAULT_ADDRESS_LIST_MAX_LENGTH` and `DEFAULT_OTP_MAX_LENGTH`; `NUMBER_MAX_LENGTH`,
  `ADDRESS_LIST_MAX_LENGTH` and `OTP_SCAN_LENGTH` stay as deprecated aliases until 2.0.
- `parseAddresses` now accepts `maxAddresses: Infinity`, as every other limit does.
- New docs: the Clipboard Inspector, which shows every format a paste holds and saves it as a
  capture for bug reports; the API conventions; and the proposal for a future 2.0.
- A corpus of real clipboard captures is now part of the test suite, so conversions are
  checked against what real apps put on the clipboard.
