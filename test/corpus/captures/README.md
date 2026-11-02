# Clipboard captures

Real clipboard contents from real apps, the input the converters are tested against.

## Add one

1. Open the **Clipboard Inspector** in the docs (`/guides/clipboard-inspector/`).
2. Copy something small from a real app: a table from Excel, a paragraph from Word, a thread
   from Outlook, a page from Notion. Use a document made for the purpose, with made-up
   names and `@example.com` addresses. These files are public.
3. Paste it into the Inspector and press **Download capture**. Fill in the app, its version,
   your OS and browser.
4. Save the file here as `<app>-<os>-<what>.capture.json` (lower-case words and hyphens).
5. Run `npm run corpus:accept`, open `../expected/<same-name>.json`, and check that what
   each converter made of it is what a person would expect. If it is not, that is a bug:
   open an issue with the capture attached.

Credentials and e-mail addresses at real domains are refused by the tests.
