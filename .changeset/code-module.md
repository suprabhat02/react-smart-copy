---
"react-smart-copy": minor
---

Add `react-smart-copy/code`: copy code the way developers expect, paste it safely.

- `codePayload(source, options?)`: a copy payload for a string or a rendered, highlighted code block. It holds plain text for editors and terminals, plus monospaced HTML with the block's syntax colours for Google Docs, Word, Slack, Teams and mail. Line-number gutters, `user-select: none` and `aria-hidden` parts, hidden parts, buttons and `data-copy-ignore` are left out. `codeFromElement` returns just the text.
- Terminal and REPL sessions copy as their commands (`prompt: 'auto'`): bash/zsh, PowerShell, cmd, Python, IPython and Node prompts, or your own pattern. Continued commands stay whole (a trailing backslash, a heredoc, an open quote), and output is dropped. `diff: 'after' | 'before'` copies one side of a unified diff, and `lineNumbers: true` removes typed line numbers that count up. Shared indentation and trailing whitespace are removed and line endings normalised. `normalizeCode` exposes all of this, and also works on the server.
- `pasteAsCode(event, options?)`: a paste handler for code fields. It fixes curly quotes, dashes, no-break spaces and invisible characters, dedents, and indents each line to the cursor. The browser's undo stays intact. `onPaste` sees every finding and can cancel. `pasteToCode(result)` serves `usePaste`, CodeMirror and Monaco.
- `inspectCode(text)` finds code that runs differently from how it reads, with line, column and Unicode name: Trojan Source bidi overrides (CVE-2021-42574), invisible identifiers (Hangul fillers), hidden tag characters, runs of variation selectors, Cyrillic and Greek lookalikes in Latin words, control characters, unusual spaces and typographic punctuation. Joiners in Arabic, Persian, Indic and emoji, and full-width punctuation in CJK text, are left alone. `cleanCode(text)` applies safe replacements until nothing fixable is left, and never guesses a letter.
- Pasted code is never cut: past `maxLength` it is a `too-large` error, or a native paste with `pasteAsCode`. HTML is parsed inertly.

`insertText` now lives in one shared module and is exported from both `/markdown` and `/code`.
