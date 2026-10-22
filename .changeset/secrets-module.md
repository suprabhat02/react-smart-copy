---
"react-smart-copy": minor
---

`react-smart-copy/secrets`: keep API keys, tokens, private keys, passwords, card numbers and IBANs out of pastes and copies.

- `scanSecrets(text)` finds:
  - keys and tokens of AWS, GitHub, GitLab, Slack, Stripe, Google, OpenAI, npm, PyPI, SendGrid, Twilio and Azure, and JSON Web Tokens, by their documented formats;
  - PEM and OpenSSH private keys;
  - passwords in URLs and connection strings;
  - card numbers (Luhn and brand ranges) and IBANs (mod-97 and country lengths);
  - random-looking values assigned to secret names.
- Each finding has a kind, a confidence and a masked preview, never the secret. Every pattern runs in linear time.
- `redactSecrets(text)` replaces each secret, by default with `[redacted <label>]`.
- `pasteWithoutSecrets(event)` redacts (undo intact) or blocks pastes that hold secrets.
- `secretRedactor()` is a `useCopyInterceptor` transform that redacts secrets in what people copy from your page.
- Works on servers too.
