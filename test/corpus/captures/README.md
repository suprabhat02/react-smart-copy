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

Credentials, e-mail addresses at real domains and account names in file paths
(`file:///C:/Users/<name>/...`, which Office puts on the clipboard) are refused by the tests.
The Inspector writes such a name as `user` itself.

## Desktop apps

| Capture | What it holds, and what it found |
| --- | --- |
| `microsoft-excel-table-html` | A 4×4 range with an empty cell, rupee amounts and quotes in a cell; HTML, text, RTF and an image. |
| `microsoft-outlook-recipients-text` | The To field: text only, one recipient written as a name and an address with no angle brackets. |
| `microsoft-outlook-email-body-html` | Bold italic text, a bulleted list and a link, as Word's HTML and RTF. |
| `slack-message-html` | An emoji, a link and inline code. Slack marks its line breaks `aria-hidden`, which `rich` used to drop, joining the lines. |
| `visual-studio-code-function-html` | A function, with VS Code's own formats. `markdown` keeps it as plain text, by design (`codeAsText`). |

## Browser captures

`web-chromium-*` and `web-firefox-*` are what each engine puts on the clipboard when a person
selects part of an ordinary web page (`e2e/fixtures/corpus-source.html`) and presses Ctrl+C,
read back through a real paste. Regenerate them after a browser update with
`npm run corpus:browsers`, then `npm run corpus:accept` and review the diff.

There is no WebKit set: its Linux build does not put a native selection copy on the
clipboard, and Safari's macOS output differs anyway. A Safari capture comes from the
Inspector on a Mac.
