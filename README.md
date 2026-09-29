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
- The absolute path the tree reports is trimmed to a workspace-relative one.
- Composer gets a dashed highlight while a row is being dragged.
- Configurable reference format (`{path}` / `{abs}`).
- Zero dependencies, one browser module; uninstalling removes every listener,
  style and `draggable` marker it added.

## Install

```sh
# dsh web / other CLI-launched profiles
dsh plugin --profile web add git+https://gitee.com/zhengkaixing/dsh-files-drag.git
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

## Configuration

Override the reference template on the plugin's row in the profile's
`cordis.patch.yml`:

```yaml
- id: files-drag
  config:
    format: '[file: {path}]' # '@{path}' (default) | '{path}' | '{abs}' | …
```

Placeholders: `{path}` — workspace-relative path, forward slashes, trailing `/`
for directories; `{abs}` — the absolute path the tree reported. If a DSH version
does not pass the row config to a client-only row, change `DEFAULT_FORMAT` at the
top of `client.js` instead.

## How it works

| Step | Mechanism |
|---|---|
| Rows become draggable | A `MutationObserver` marks every `[data-files-path]` row `draggable`, including rows rendered later |
| Relative path | The row's absolute `data-files-path` is trimmed against the surrounding `data-files-root` |
| Drag payload | `dragstart` writes the reference into `text/plain` plus a private `application/x-dsh-files-drag` type, so drags this plugin does not own are left alone |
| Drop on the composer | Left to the browser, which inserts the text at the caret |
| Drop elsewhere | Inserted through the `conversation.input.dock` slot's `inputActions.setDraft` |

## Compatibility and known limits

- Integration is DOM-level by design: it keys on the built-in panel's
  `data-files-path` / `data-files-root` attributes, which its source sets
  explicitly. A DSH upgrade that renames them silently disables the drag (rows
  simply stop being draggable — no error, nothing else affected).
- Files and directories are draggable individually. The built-in panel has no
  multi-select, so there is no batch drag.
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
