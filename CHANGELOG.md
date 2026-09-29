# Changelog

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
