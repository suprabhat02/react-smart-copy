---
'react-smart-copy': minor
---

Copy a page as Markdown, cleanly. `htmlToMarkdown` leaves out heading permalinks: the `#`, `¶` or "Section titled" link that Starlight, Docusaurus, VitePress, MkDocs, Sphinx and GitHub put inside or beside every heading, so a copied page or a pasted docs section no longer reads `## Options¶`. A heading whose whole text is a link keeps it. A new `ignore` option (a CSS selector) leaves out demos, ads or widgets, and `[data-copy-ignore]` is now always left out, as it is in the rest of the library. The Markdown guide has a tested "Copy a page as Markdown" recipe, and the docs site has the button on every page.
