---
"react-smart-copy": minor
---

`react-smart-copy/number`: numbers and amounts, pasted and copied exactly in any locale's format.

- `parseNumber(text, { locale })` reads one number from pasted text:
  - group separators `,` `.` `'` and spaces (no-break and narrow ones too), in groups of three or lakh and crore grouping; wrong grouping gives `null`;
  - the decimal separator the text shows is one; only a lone `1,234` or `1.234` is settled by `locale`, and flagged `ambiguous`;
  - `-`, `+`, `−`, a trailing minus and accounting brackets; currency symbols and ISO codes before or after; `%` and `‰`; scientific notation; digits of any script.
  - It gives `value`, and `exact` as a decimal string with every digit as written, for money.
- `pasteAsNumber(event)` inserts the number the way the field takes it: `exact` in `<input type="number">`, the locale's format in text fields with undo intact. Pastes that are not numbers are turned away.
- `formatNumber` and `numberPayload` write a number, bigint or exact decimal string for any locale, grouped or not, rounded to `fractionDigits` without float error.
- `numberSymbols(locale)` gives a locale's separators and grouping.
