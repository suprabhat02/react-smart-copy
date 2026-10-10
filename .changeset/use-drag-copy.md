---
"react-smart-copy": minor
---

Add `useDragCopy` — a headless React hook that makes any element draggable and populates its `DataTransfer` with structured data on `dragstart`.

**Features:**

- **Structured payloads** — `text`, `html` (with plain-text fallback), `json`, and `multi` (arbitrary MIME types).
- **Zero Clipboard API** — works in every browser that supports HTML5 drag-and-drop.
- **Always-fresh source** — the `source` callback reads the latest props/state on every drag, never stale closures.
- **`enabled` prop** — remove `draggable` and the listener without unmounting; status resets to `idle`.
- **`effectAllowed`** — controls the browser drag cursor and permitted drop effects.
- **`onDragStart` prop path** — stable callback for use inside render-prop components or when the native listener alone isn't enough.
- **SSR-safe** — no DOM access during server rendering; `draggable` is never set on the server.
- **Framework-agnostic core** — `applyDragCopy` and `registerDragCopy` are also exported from `react-smart-copy/core`.

```tsx
const { ref } = useDragCopy({
  source: () => ({ kind: 'html', html: '<b>Hello</b>', text: 'Hello' }),
  effectAllowed: 'copy',
});
return <div ref={ref}>Drag me</div>;
```
