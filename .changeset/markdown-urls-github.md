---
'react-smart-copy': patch
---

Markdown: URLs in pasted text no longer turn into broken links on GitHub. GitHub links a bare URL and keeps the backslash escapes inside it, so text such as `https://example.com/my_page` came out as `https://example.com/my\_page`, a link to the wrong address. Plain `http(s)` addresses are now written as autolinks (`<https://example.com/my_page>`), which every renderer follows exactly, and a link whose text is its own address is written the same way. URL-like text that is not a plain address is kept from being linked at all. Escaping is also tighter, matching CommonMark: underscores inside words (`snake_case`), `0.75`, `#hashtag`, `-5 °C` and `= a` stay as written, while a line such as `:-` that GitHub reads as a table delimiter row is now escaped. The property tests now check every output with GitHub's reference parser (micromark with GFM) as well as markdown-it. The `markdown` entry grows by about 0.5 kB.
