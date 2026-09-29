# Changelog

## 1.2.0

Copied names become absolute paths, and the file tree follows the sidebar.

- **Removed the reference tray** added in 1.1.0; the composer keeps its own
  reference chips, and nothing extra is drawn above it.
- **Copy resolves to absolute paths** — copying a selection that names a file
  (from the draft or from a sent message) now puts its absolute path on the
  clipboard. The composer is a Lexical rich editor, so the listener reads the DOM
  selection as well as textarea offsets; the textarea-only selector of 1.0/1.1
  never matched the composer at all.
- **Resolution order** widened to cover names copied out of messages: exact
  inserted token → absolute spelling → workspace-relative drag memory →
  `data-files-root` + relative path → basename index (drag memory + the rows the
  file panel has loaded). Anything unresolvable is copied unchanged.
- **The file tree follows the sidebar** — the active right-sidebar tab's
  `dsh-resource://file/…` address is polled, resolved against the workspace root,
  and revealed row by row (expand, scroll, flash).
- New config key `reveal`; `tray` is gone. Copy resolution no longer depends on
  `[data-composer-card] textarea`, which the shipped composer does not render.

## 1.1.1

Dragging a file no longer opens DSH's `@` candidate menu.

- Every payload now carries one trailing space. `ui-input-trigger` treats an `@`
  token ending at the caret as a live completion (`(?:^|\s)(@([^\s]*))$`), so a
  drop used to pop the menu and ask which candidate to pick. The reference text
  itself is unchanged.
- The dock bridge inserts through `inputActions.captureInsertion()` +
  `insertText()` — revision-guarded, one undo step, reference chips preserved —
  and falls back to `setDraft` only when unavailable.

## 1.1.0

Absolute paths become first-class: a reference already sitting in the draft can
be copied out without retyping it.

- **Reference tray** — every resolvable reference in the draft renders as a chip
  above the composer (file name + parent directory, full path on hover). Clicking
  a chip copies the **absolute path**; the chip confirms with `已复制`.
- **Alt + drag** — holding `Alt` while starting a drag inserts the absolute path
  instead of `@relative`, for pasting straight into a shell or file manager.
- **Copy rewrite** — `Ctrl+C` inside the composer turns resolvable references in
  the selection into absolute paths. Selections naming nothing resolvable are
  copied byte-identically.
- Resolution order: exact inserted text → workspace-relative path →
  `data-files-root` + relative path. Cancelled drags record nothing.
- Windows drive and UNC paths are normalized to backslashes; POSIX paths are left
  alone.
- New config keys: `altFormat`, `tray`, `rewriteCopy` (all optional, defaults keep
  the behaviour above). Implementation detail moved to `docs/DESIGN.md`.

## 1.0.0

Initial release.

- Marks every row of the built-in workspace file panel (`[data-files-path]`)
  draggable, including rows rendered later, via a `MutationObserver`.
- Derives the workspace-relative path of a row from its absolute
  `data-files-path` and the surrounding `data-files-root`.
- Publishes the formatted reference on `dragstart` using `text/plain` plus a
  private `application/x-dsh-files-drag` type.
- Dropping on the composer keeps the browser's native caret insertion; dropping
  anywhere else appends through the `conversation.input.dock` slot actions.
- Directories insert a trailing-slash path; the reference template is
  configurable through the row's `config.format`.
