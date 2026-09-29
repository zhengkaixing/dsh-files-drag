# dsh-files-drag — design notes

Maintainer detail behind [README.md](../README.md). User-facing behaviour lives there; this file records the contracts the code depends on.

## Why a DOM integration

`@deepseek-ai/dsh-client-ui-sidebar-files` renders one row per entry:

```html
<li data-files-entry="file|directory|other" data-files-path="<absolute path>">
  <button class="row" aria-expanded="…">…</button>
</li>
```

inside a container carrying `data-files-root="<workspace root>"`. The rows have **no** drag handler and no client service exposes the tree, so the module marks them itself: a `MutationObserver` on `document.body` sets `draggable` on every `[data-files-path]` element, including rows rendered later. Both attributes are internal to the shipped plugin: a rename silently stops the drag.

## Path resolution

| Fact | Consequence |
|---|---|
| `data-files-path` is absolute (`childPath` joins onto the session root with `/`) | the module trims `data-files-root` to get the workspace-relative path |
| a sound token for a shell or Explorer needs a native spelling | `normalizeAbsolute` turns `/` into `\` for `^[A-Za-z]:` paths, leaves POSIX alone |
| the tree mixes separators (`C:\ws` + `/src`), and Windows ignores case | `comparable` folds separators, trailing slashes and drive case before any path comparison |

Resolution order for a name in copied text: exact inserted token → absolute spelling → workspace-relative drag memory → `data-files-root` + relative path (only when the name carries a separator) → basename index. A name nothing resolves is copied byte-identically, so ordinary copying is never rewritten.

The basename index is built per copy gesture from two sources: this session's drags (`byRel`) and the file-tree rows the panel has loaded. A bare name that neither covers is not resolvable from the browser — the file panel would have to list its directory for it to appear.

`byToken` / `byRel` are filled on **drop**, not on dragstart, so a cancelled drag teaches the module nothing.

## Drop branches

| Drop target | Behaviour |
|---|---|
| inside `[data-composer-card]` | no interception: the DSH editor inserts `text/plain` at the drop point |
| anywhere else | `preventDefault` + the dock slot's `inputActions` insert the reference |

Only drags carrying `application/x-dsh-files-drag` are touched, so OS file drags, tab drags and other plugins' payloads pass through untouched.

## Keeping DSH's `@` menu closed

`ui-reference` registers the shipped `@` trigger source and `ui-input-trigger` opens its candidate menu whenever a token ends **at the caret** — its `activeAtToken` matches `(?:^|\s)(@([^\s]*))$` against the text before the caret. A drop that leaves the caret right after `@path` therefore opens the menu and asks the user to choose.

Every payload carries one trailing space for that reason. A template that already ends in whitespace keeps its own ending.

## Copy rewrite

The composer is a Lexical rich editor, not a textarea, so a selection can live in the DOM (`document.getSelection()`) or, for the queue's inline editor and any future textarea, in `selectionStart/selectionEnd`. `selectedText` checks both before rewriting.

The listener is a capture-phase `copy` on `document`: it rewrites the selection, then sets `clipboardData['text/plain']` itself through `preventDefault`. Nothing else changes, so a selection with no resolvable name copies verbatim.

## Tree reveal

`ui-sidebar-right` exposes `sidebarRight.active()` → a tab record whose `contentId` is the opened address. The module polls it (600 ms), parses `dsh-resource://file/<session|absolute>/<path>` (`session` resolves against `data-files-root`), and walks the tree: one `waitForRow` per path segment, clicking an `aria-expanded="false"` directory button to load the next level, then `scrollIntoView` + a transient `dshfd-flash` class.

Nothing else drives the tree, so the walk is bounded (12 × 150 ms per level) and simply stops when a row never appears — for instance while the Files tab is unmounted.

## Config keys

| Key | Default | Meaning |
|---|---|---|
| `format` | `@{path}` | drag payload template |
| `altFormat` | `{abs}` | payload template while `Alt` is held at dragstart |
| `rewriteCopy` | `true` | copied names resolve to absolute paths |
| `reveal` | `true` | the file tree follows the sidebar's active file |

If a DSH release stops passing a client-only row's config, the defaults above apply; change `DEFAULT_FORMAT` / `DEFAULT_ALT_FORMAT` in `client.js` instead.

## Cleanup

Everything the module adds is registered inside `ctx.effect`: the style element, the observer, the reveal interval, the five document listeners, the `draggable` markers and the flash class. Uninstalling the bundle restores the page.
