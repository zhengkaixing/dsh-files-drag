# dsh-files-drag — design notes

Maintainer detail behind [README.md](../README.md). User-facing behaviour lives there; this file records the contracts the code depends on.

## Why a DOM integration

`@deepseek-ai/dsh-client-ui-sidebar-files` renders one row per entry:

```html
<li data-files-entry="file|directory|other" data-files-path="<absolute path>">
  <button class="row">…</button>
</li>
```

inside a container carrying `data-files-root="<workspace root>"`. The rows have **no** drag handler, and no client service exposes the tree, so the module marks the rows itself: a `MutationObserver` on `document.body` sets `draggable` on every `[data-files-path]` element, including rows rendered later.

Both attributes are internal to the shipped plugin. A rename silently stops the drag (rows simply stay non-draggable) — that is the accepted cost of living inside the built-in panel.

## Path resolution

| Fact | Consequence |
|---|---|
| `data-files-path` is absolute (`childPath` joins onto the session root with `/`) | the module trims `data-files-root` to get the workspace-relative path |
| the drive/UNC prefix must survive a paste into Explorer | `normalizeAbsolute` turns `/` into `\` for `^[A-Za-z]:` paths, leaves POSIX alone |
| a draft may name an absolute path directly (`Alt` drag, hand edit) | `isAbsolutePath` short-circuits resolution |

Resolution order for a token in the draft: exact inserted text → workspace-relative path → `data-files-root` + relative → unresolved (the token contributes no chip, and a copy of it is left byte-identical).

`byToken` / `byRel` are filled on **drop**, not on dragstart, so a cancelled drag teaches the module nothing.

## Drop branches

| Drop target | Behaviour |
|---|---|
| `[data-composer-card] textarea` | no interception: the browser inserts `text/plain` at the caret |
| anywhere else | `preventDefault` + `conversation.input.dock` actions `setDraft(draft + '\n' + text)` |

Only drags carrying `application/x-dsh-files-drag` are touched, so OS file drags, tab drags and other plugins' payloads pass through untouched.

## Slot contract

`conversation.input.dock` is a `list` slot with `scope: 'session'`; its props are `SessionStandardProps` — `useInput` (snapshot hook, gives `draft`) and `inputActions` (`setDraft`). It exposes **no** session or workspace root, which is why the root is read from the DOM.

The occupant renders the reference tray and captures `inputActions` into a module variable for the drop branch. `{path}` / `{abs}` templates are filled from the row's relative/absolute path.

## Copy rewrite

A capture-phase `copy` listener scoped to the composer textarea rewrites resolvable tokens to absolute paths and sets `clipboardData['text/plain']` itself. Text without a resolvable token is left alone, so ordinary copying is unchanged. `rewriteCopy: false` disables the listener's effect entirely.

## Config keys

| Key | Default | Meaning |
|---|---|---|
| `format` | `@{path}` | drag payload template |
| `altFormat` | `{abs}` | payload template while `Alt` is held at dragstart |
| `tray` | `true` | reference chips above the composer |
| `rewriteCopy` | `true` | copy inside the composer yields absolute paths |

If a DSH release stops passing a client-only row's config, the defaults above apply; change `DEFAULT_FORMAT` / `DEFAULT_ALT_FORMAT` in `client.js` instead.

## Cleanup

Everything the module adds is registered inside `ctx.effect`: the style element, the observer, the five document listeners, the `draggable` markers and any copied state. Uninstalling the bundle restores the page.
