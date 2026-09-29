# Changelog

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
