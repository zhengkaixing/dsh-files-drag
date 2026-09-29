# dsh-files-drag

> Drag files straight out of DeepSeek Harness's **built-in** workspace file panel
> into the composer — no extra panel, no floating popup.

[中文](README.zh.md) | English

The shipped file panel (`@deepseek-ai/dsh-client-ui-sidebar-files`) renders every
tree row as `<li data-files-path="…">` and attaches **no drag behaviour at all**,
so a row cannot be dragged anywhere and no "receiver" plugin can help. This
bundle adds what is missing: drag any file row into the composer and its
workspace-relative path is inserted as a reference.

## Features

- Drag directly in the **built-in** panel — not in a second, plugin-owned panel.
- Drop **on the composer** → inserted at the caret by the browser.
  Drop **anywhere else** on the page → appended to the draft.
- Directories are draggable too (`@docs/`).
- **`Alt` + drag** — insert the absolute path instead of `@relative`.
- **Copy yields absolute paths** — copying a selection that names a file, from
  the draft or from a sent message, puts its absolute path on the clipboard.
- **The file tree follows the sidebar** — opening a file (preview tab, chat
  mention, tool card) expands the built-in file panel to it and flashes the row.
- The absolute path the tree reports is trimmed to a workspace-relative one.
- Composer gets a dashed highlight while a row is being dragged.
- Configurable reference format (`{path}` / `{abs}`).
- Zero dependencies, one browser module; uninstalling removes every listener,
  style and `draggable` marker it added.

## Install

```sh
# dsh web / other CLI-launched profiles
dsh plugin --profile web add github:zhengkaixing/dsh-files-drag

# Gitee mirror (handy from mainland China)
dsh plugin --profile web add git+https://gitee.com/zhengkaixing/dsh-files-drag.git

# pin a release
dsh plugin --profile web add github:zhengkaixing/dsh-files-drag#v1.2.0
```

Then restart DSH and hard-refresh the page (`Ctrl+F5` / `Cmd+Shift+R`).

### Desktop application (`desktop` profile)

The CLI refuses to touch the profile the Electron application owns:

```
error: profile "desktop" is managed exclusively by the Electron application
```

Install it from the application's own plugins page, or wire it up by hand:

1. Put this package somewhere stable, e.g. `%USERPROFILE%\.dsh\plugins\dsh-files-drag`.
2. In `%USERPROFILE%\.dsh\profiles\desktop\package.json`, add the dependency and
   the bundle row:

   ```json
   {
     "dependencies": { "dsh-files-drag": "link:C:/Users/<you>/.dsh/plugins/dsh-files-drag" },
     "dsh": { "profile": { "bundles": ["…", "dsh-files-drag"] } }
   }
   ```

3. Run `pnpm install` in that profile directory with the application's own
   runtime (`%USERPROFILE%\.dsh\dsh-runtimes\…\dependencies\pnpm`), then restart
   the application.

## Usage

1. Open the built-in workspace file panel on the right and expand a directory.
2. Drag a file row into the composer and release.
   - released **on the input box** → the reference lands at your caret;
   - released **elsewhere on the page** → the reference is appended to the draft
     (through the official `conversation.input.dock` actions);
   - `Esc` / releasing outside the window cancels, as usual.

By default a file row inserts `@<workspace-relative path>` and a directory row
`@<path>/`. Pick the files up in your message as usual, e.g.
`review @src/client/main.ts`.

Once a reference sits in the draft:

- `Alt` + drag inserts the absolute path directly;
- `Ctrl+C` on a selection that names a file — the draft or a sent message — puts
  its absolute path on the clipboard;
- opening a file anywhere (preview tab, chat mention, tool card) expands the file
  panel to that file and flashes its row.

Every drop ends with one trailing space, which keeps DSH's own `@` candidate menu
closed (its trigger only fires while an `@` token ends at the caret).

## Configuration

Override the reference template on the plugin's row in the profile's
`cordis.patch.yml`:

```yaml
- id: files-drag
  config:
    format: '@{path}'    # drag payload (default); also '[file: {path}]', '{path}', …
    altFormat: '{abs}'   # payload while Alt is held at dragstart
    rewriteCopy: true    # copied file names resolve to absolute paths
    reveal: true         # the file tree follows the sidebar's active file
```

Placeholders: `{path}` — workspace-relative path, forward slashes, trailing `/`
for directories; `{abs}` — absolute path, backslashes on Windows. If a DSH version
does not pass the row config to a client-only row, change `DEFAULT_FORMAT` /
`DEFAULT_ALT_FORMAT` at the top of `client.js` instead.

## How it works

| Step | Mechanism |
|---|---|
| Rows become draggable | A `MutationObserver` marks every `[data-files-path]` row `draggable`, including rows rendered later |
| Relative path | The row's absolute `data-files-path` is trimmed against the surrounding `data-files-root` |
| Drag payload | `dragstart` writes the reference into `text/plain` plus a private `application/x-dsh-files-drag` type, so drags this plugin does not own are left alone |
| Drop on the composer | Left to the browser, which inserts the text at the caret |
| Drop elsewhere | Inserted through the `conversation.input.dock` slot's `inputActions.setDraft` |
| Absolute path | Resolution order: inserted token → absolute spelling → drag memory → `data-files-root` + relative path → basename index (drag memory + the rows the panel loaded). Recorded on drop, so a cancelled drag teaches nothing |
| `Alt` + drag | `dragstart` swaps the template to `altFormat` before publishing the payload |
| Copy | A capture-phase `copy` listener rewrites resolvable names in the selection — DOM selection or textarea offsets — to absolute paths |
| Tree reveal | The active right-sidebar tab's `dsh-resource://file/…` address is polled, resolved against `data-files-root`, then the tree is expanded row by row and flashed |

Internals — DOM and slot contracts, every flow and config key — live in
[`docs/DESIGN.md`](docs/DESIGN.md).

## Compatibility and known limits

- Integration is DOM-level by design: it keys on the built-in panel's
  `data-files-path` / `data-files-root` attributes, which its source sets
  explicitly. A DSH upgrade that renames them silently disables the drag (rows
  simply stop being draggable — no error, nothing else affected).
- Files and directories are draggable individually. The built-in panel has no
  multi-select, so there is no batch drag.
- `rewriteCopy` only changes a copy whose selection names a resolvable file; set
  it to `false` to copy verbatim.
- A copied bare name resolves through the drag memory or the rows the file panel
  has loaded. A name the panel never listed and this session never dragged is
  copied unchanged — resolving it would need a host-side workspace search.
- Tree reveal needs `data-files-root` and drives the shipped tree by clicking its
  directory rows; a collapsed or unmounted Files tab is simply skipped.
- The "drop on the composer" branch matches `[data-composer-card] textarea`. If a
  DSH version changes that structure, such a drop still works — it just falls
  back to appending at the end of the draft instead of the caret.
- Developed and verified on DSH `0.2.0-rc.1` (Windows desktop). Other releases
  are untested; the bundle pins no DSH version because it consumes no private API.

## Uninstall

Remove the dependency and the `dsh-files-drag` bundle row from the profile's
`package.json`, run `pnpm install` in the profile directory, restart, and
hard-refresh. Everything the module added is disposed with it.

## License

MIT
