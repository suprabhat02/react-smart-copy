# Clipboard captures

Real clipboard contents from real apps, the input the converters are tested against.

## Add one

1. Open the **Clipboard Inspector** in the docs (`/guides/clipboard-inspector/`).
2. Copy something small from a real app: a table from Excel, a paragraph from Word, a thread
   from Outlook, a page from Notion. Use a document made for the purpose, with made-up
   names and `@example.com` addresses. These files are public.
3. Paste it into the Inspector and press **Download capture**. Fill in the app, its version,
   your OS and browser. If you will send several captures from one app, say what each one is in
   **What did you copy?** (`pivot table`): it goes into the file name.
4. Move the file here under the name the Inspector gave it (`google-sheets-pivot-table-html.capture.json`).
   If you rename it, change the `"id"` inside it to the same name, or the tests refuse it.
5. Run `npm run corpus:accept`, open `../expected/<same-name>.json`, and check that what
   each converter made of it is what a person would expect. If it is not, that is a bug:
   open an issue with the capture attached.

Credentials and e-mail addresses at real domains are refused by the tests.

## Browser captures

`web-chromium-*` and `web-firefox-*` are what each engine puts on the clipboard when a person
selects part of an ordinary web page (`e2e/fixtures/corpus-source.html`) and presses Ctrl+C,
read back through a real paste. Regenerate them after a browser update with
`npm run corpus:browsers`, then `npm run corpus:accept` and review the diff.

There is no WebKit set: its Linux build does not put a native selection copy on the
clipboard, and Safari's macOS output differs anyway. A Safari capture comes from the
Inspector on a Mac.
