---
"react-smart-copy": minor
---

`react-smart-copy/email`: lists of e-mail recipients, pasted and copied the way mail programs do.

- `parseAddresses(text)` reads the lists people paste from Outlook, Gmail, Apple Mail, contact cards and spreadsheets:
  - entries separated by commas, semicolons, line breaks or tabs;
  - bare addresses, `Name <address>`, quoted names with escapes, Outlook's unquoted `Lima, Ana <ana@example.com>`, `address (Name)`, `mailto:` links, and names in the spreadsheet cells around an address.
- Each address is checked:
  - its local part, a domain that can exist, and length limits;
  - invisible and direction-changing characters are turned away;
  - domains that mix Latin with Cyrillic or Greek letters are flagged `lookalike`.
- Duplicates are dropped, without case, and invalid entries come back with a reason. International domains are given in ASCII for storing and in Unicode for showing. `domains` restricts a list to the domains you allow.
- `pasteAddresses(event, { onAddresses })` is a paste handler for recipient fields; what was not an address stays in the field to be corrected.
- `parseAddress`, `formatAddress` and `addressesPayload` handle one address and write lists back. Names are quoted as mail needs, and can never end a mail header.
