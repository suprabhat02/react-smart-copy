---
title: "Roadmap"
description: "What has shipped, version by version, and what is next."
---

What has shipped, and what is planned next.

- ~~**0.2** `usePaste`, `<CopyGroup>`, SVG/DOM capture~~ shipped
- ~~**1.0** Frozen API, SSR / security / accessibility audit~~ shipped
- ~~**1.1** `PasteField`~~ shipped
- ~~**1.2** Paste `retry()`, cancellation with `AbortSignal`, `PasteField.Preview`~~ shipped
- ~~**1.3** `onReset` / `onCancel` callbacks, UTF-8 `maxBytes` on every paste path, `PasteResult.imageFiles`~~ shipped
- ~~**1.4** Drag-and-drop through the paste pipeline: `dropTargetProps`, `isDragOver`, droppable `PasteField.Zone`~~ shipped
- ~~**1.6** `react-smart-copy/testing` — mock adapters and result builders so consumer tests stay green across releases~~ shipped
- ~~**1.7** `useCopyInterceptor` / `registerCopyInterceptor` — attribution, redaction and no-copy zones for native Ctrl/⌘+C~~ shipped
- ~~**1.8** `useDragCopy` / `registerDragCopy` — populate `DataTransfer` on drag-start; no Clipboard API needed~~ shipped
- ~~**1.9** `react-smart-copy/table` — Excel- and Sheets-ready copy and paste, AG Grid and TanStack Table adapters, typed record import~~ shipped
- ~~**1.10** `react-smart-copy/structured` — typed, versioned, validated application data on the clipboard~~ shipped
- ~~**1.11** `react-smart-copy/markdown` — paste rich content as Markdown, with undo intact~~ shipped
- ~~**1.12** `react-smart-copy/code` — copy code blocks and sessions cleanly, paste code safely, detect Trojan Source and homoglyphs~~ shipped
- ~~**1.13** `react-smart-copy/image` — pasted images without location or camera metadata, fitted to size and byte limits~~ shipped
- ~~**1.14** `react-smart-copy/link` — links that paste well everywhere, links to a passage, tracking parameters removed, paste a URL over text to make a link~~ shipped
- ~~**1.15** `react-smart-copy/share` — the share sheet on phones, a copied titled link everywhere else, with honest outcomes~~ shipped
- ~~**1.16** `react-smart-copy/color` — copy and paste colours in every CSS format, CSS gamut mapping, WCAG contrast~~ shipped
- ~~**1.17** `react-smart-copy/rich` — styled content that pastes as it looks in mail, Docs, Word and Slack, for buttons and Ctrl/⌘+C~~ shipped
- ~~**1.18** One shared copy of the core across entry points: smaller bundles when you use several modules, and one `CopyFailure` class~~ shipped
- ~~**1.19** `react-smart-copy/rich`, paste side: paste from Word, Google Docs and web pages into rich-text editors as clean, safe HTML~~ shipped
- ~~**1.20** `react-smart-copy/files` — take pasted and dropped files and folders safely: types from content, risky files rejected, safe names, limits~~ shipped

Full history: [CHANGELOG.md](/react-smart-copy/project/releases/) or the [Releases page](/react-smart-copy/project/releases/).
