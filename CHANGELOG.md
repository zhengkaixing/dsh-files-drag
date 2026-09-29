# Changelog

## 1.0.1

Trims the plugin back to its 1.0 behaviour plus the `@` menu fix.

- One trailing space now ends every payload: `ui-input-trigger` treats an `@`
  token ending at the caret as a live completion (`(?:^|\s)(@([^\s]*))$`), so a
  drop used to open its candidate menu and ask which entry to pick.
- No tray, no copy rewrite, no tree reveal. The module marks the built-in
  panel's rows draggable, publishes the reference and inserts it — nothing else.
- The 1.1 / 1.2 line remains available as the `v1.1.0`, `v1.1.1` and `v1.2.0`
  tags.

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
