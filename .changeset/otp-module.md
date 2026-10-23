---
"react-smart-copy": minor
---

`react-smart-copy/otp` and `useOtpField`: one-time codes, pasted and autofilled the way people expect.

- `useOtpField` (React entry) and `createOtpField` (framework-agnostic) wire a row of single-character boxes:
  - typing moves to the next box; Backspace, Delete, the arrow keys, Home and End work as people expect;
  - pasting a code, or a whole SMS holding one, into any box fills them all;
  - SMS autofill on iOS and Android, through `autocomplete="one-time-code"` on the first box;
  - the WebOTP API with `webOtp: true`, cancelled when the boxes are detached or the code is typed;
  - an accessible name on every box, the numeric keyboard for numeric codes, and no autocorrect.
- `extractOtp(text)` finds the code in an SMS or an e-mail: a code on its own, an origin-bound line (`@example.com #482913`, refused for another `domain`), or a number next to a word that names it, in twenty languages and with digits of any script. Prices, dates, times, phone numbers, order numbers and anything in a URL or an e-mail address are left alone. Linear time, first 100,000 characters.
- `normalizeOtpText` reads digits of any script, and full-width characters, as ASCII.
