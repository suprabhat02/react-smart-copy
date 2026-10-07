---
"react-smart-copy": minor
---

**Drag-and-drop through the paste pipeline.**

- **New: drops are pastes.** A dropped file or text selection goes through the same `accept` list, `maxBytes` / `maxItems` limits and image byte-checks as a paste, and resolves with `result.source === 'drop'`. Dropped image files arrive in `result.imageFiles` with their names.
- **New: `PasteField.Zone` accepts drops by default.** It sets `data-drag-over` while an accepted drag is over it and announces `messages.dropped` ("Dropped content added"). If you override only `pasted`, for example to translate it, that message is used for drops too. Pass `droppable={false}` to keep the 1.3 behaviour. Your own `onDragEnter` / `onDragOver` / `onDragLeave` / `onDrop` handlers run first, and calling `preventDefault()` in one takes over.
- **New in `usePaste`:**
  - `dropTargetProps`: spread it onto one element.
  - `isDragOver`.
  - `dropEvent`.

  Drops are kept separate from `targetProps`, so a textarea that only spreads `targetProps` keeps its native text drop.
- **New in core:**
  - `machine.dropEvent(event)`.
  - `canAcceptDrag(dataTransfer, options)`: decides from the item kinds and types a browser exposes while dragging. A file whose type is hidden until the drop counts as a maybe.
  - The `PasteDropEventLike`, `DataTransferItemLike` and `PasteDropTargetProps` types.
- **Safe in real browsers:**
  - Every `dragover` on the target is claimed. Drags the field doesn't accept get `dropEffect: 'none'`, so a rejected file is cancelled instead of being opened in place of your page.
  - Drags aimed at an `<input>`, `<textarea>` or editable region nested inside the target keep their native behaviour. Inside a target that is itself editable, every drop is still checked against `accept` and the limits.
  - The drop effect respects the source's `effectAllowed`.
  - The drag-over state clears on any drop or `dragend`, and when the pointer leaves for an element outside the target, so it can't get stuck.
- **New: `describePasteError(error, source?)`.** Pass `state.source` to word drop failures as drops ("The dropped content is too large."). `messages.error` receives the source as its second argument.
- **Changed:** the developer-facing `no-content` message now says "content" instead of "clipboard", since it covers drops too.
- **Docs:** the README already said `PasteField.Zone` accepts drops, which wasn't true until this release.
- Tests: 459 at 100% coverage, with drag behaviour also checked in Chromium against the docs site.
- Size (brotli):

  | Bundle | 1.4.0 | 1.3.0 |
  |---|---|---|
  | `usePaste` | 4.29 kB | 3.79 kB |
  | `PasteField` | 7.03 kB | 6.37 kB |
  | core | 6.05 kB | 5.86 kB |
  | `useCopy`, `CopyField` + `CopyGroup`, capture | unchanged | |

**Heads-up for TypeScript users.** Everything is additive, but:

- **Exhaustive switches on the source.** `PasteSource` gains `'drop'`, so an exhaustive `switch` over `result.source` or `state.source` needs the new case.
- **Hand-built objects.** If you build these types by hand, for example in test mocks, add the new members:
  - `UsePasteResult` (and so `PasteFieldContextValue`) gains `dropEvent`, `dropTargetProps` and `isDragOver`.
  - `PasteMachine` gains `dropEvent`.
- **Messages.** `PasteFieldMessages` gains an optional `dropped`. `error` may receive a second `source` argument, and existing one-argument functions still fit.
