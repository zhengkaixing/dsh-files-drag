/**
 * dsh-files-drag client half: built-in file-panel rows become draggable, every
 * resolvable file name resolves to an absolute path for the clipboard, and the
 * file tree follows the file the right sidebar opens.
 * Row/slot/service contracts and every config key: docs/DESIGN.md.
 */
window.__ModuleLoader__.load({
  id: 'dsh-files-drag',
  factory(require) {
    const React = require('react');
    const el = React.createElement;

    /** Drag payload type this module owns; drags without it are left untouched. */
    const MARKER = 'application/x-dsh-files-drag';
    /** `dsh-resource://file/<session|absolute>/<path>`, the address every file tab carries. */
    const FILE_ADDRESS = 'dsh-resource://file/';
    const DEFAULT_FORMAT = '@{path}';
    const DEFAULT_ALT_FORMAT = '{abs}';
    /** Trailing separator: a token ending at the caret opens DSH's `@` menu. */
    const REFERENCE_SUFFIX = ' ';
    const COPIED_MS = 1200;
    const REVEAL_INTERVAL_MS = 600;
    const REVEAL_STEP_MS = 150;
    const REVEAL_STEPS = 12;
    const FLASH_MS = 1600;
    const CSS = [
      '[data-files-path][data-dsh-files-drag] > button{cursor:grab}',
      '[data-files-path][data-dsh-files-drag] > button:active{cursor:grabbing}',
      '[data-files-path].dshfd-flash{background:var(--dsw-alias-interactive-bg-hover);outline:1px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:-1px;border-radius:4px}',
      'body[data-dsh-files-drag-active] [data-composer-card]{outline:2px dashed var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
    ].join('\n');

    /** Inserted reference text → absolute path; workspace-relative path → absolute path. */
    const byToken = new Map();
    const byRel = new Map();
    /** Composer bridge captured from the input dock slot. */
    let bridge = null;
    /** Row config, defaulted in apply. */
    const options = {
      format: DEFAULT_FORMAT,
      altFormat: DEFAULT_ALT_FORMAT,
      rewriteCopy: true,
      reveal: true,
    };

    /** Windows drive and UNC paths get backslashes; POSIX paths are left alone. */
    function normalizeAbsolute(path) {
      return /^[A-Za-z]:/.test(path) ? path.replace(/\//g, '\\') : path;
    }

    function isAbsolutePath(path) {
      return path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path);
    }

    /** Comparison spelling: unified separators, no trailing slash, case-folded on drives. */
    function comparable(path) {
      const unified = path.replace(/\\/g, '/').replace(/\/+$/, '');
      return /^[A-Za-z]:/.test(unified) ? unified.toLowerCase() : unified;
    }

    function basename(path) {
      const trimmed = path.replace(/[\\/]+$/, '');
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return cut === -1 ? trimmed : trimmed.slice(cut + 1);
    }

    /** Workspace root reported by the built-in panel, when it is mounted. */
    function workspaceRoot() {
      const host = document.querySelector('[data-files-root]');
      const root = host === null ? '' : host.getAttribute('data-files-root') || '';
      return root.replace(/[\\/]+$/, '');
    }

    /** The row's path relative to its workspace root, always forward-slashed. */
    function relativePath(row) {
      const absolute = row.getAttribute('data-files-path') || '';
      const host = row.closest('[data-files-root]');
      const root = host === null ? '' : host.getAttribute('data-files-root') || '';
      let relative = absolute;
      if (root !== '' && absolute.startsWith(root)) relative = absolute.slice(root.length);
      relative = relative.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      return relative === '' ? absolute.replace(/\\/g, '/') : relative;
    }

    /** Reference template → payload text; `{path}` relative, `{abs}` absolute. */
    function fillTemplate(template, relative, absolute) {
      return template.replace(/\{path\}/g, relative).replace(/\{abs\}/g, absolute);
    }

    /** Basename → absolute path, from this session's drags plus the loaded tree rows. */
    function nameIndex() {
      const index = new Map();
      const add = (absolute) => {
        const name = basename(absolute);
        if (name !== '' && !index.has(name)) index.set(name, normalizeAbsolute(absolute));
      };
      for (const absolute of byRel.values()) add(absolute);
      for (const row of document.querySelectorAll('[data-files-path]')) {
        const absolute = row.getAttribute('data-files-path') || '';
        if (absolute !== '') add(absolute);
      }
      return index;
    }

    /**
     * Candidates a selection may name, in text order: `@path`, `@"path"`,
     * `[file: path]`, or a bare path-like token carrying an extension.
     * Overlapping matches keep the earliest and longest.
     */
    function scanReferences(text) {
      const found = [];
      const push = (token, path, start) => {
        if (path !== '') found.push({ token, path, start });
      };
      let match;
      const at = /(?<=^|[\s([{`"'])@(?:"([^"\n]+)"|([^\s@"'`]+))/g;
      while ((match = at.exec(text)) !== null) push(match[0], match[1] ?? match[2], match.index);
      const tagged = /\[file:\s*([^\]\n]+?)\s*\]/g;
      while ((match = tagged.exec(text)) !== null) push(match[0], match[1], match.index);
      const bare =
        /(?<=^|[\s([{`"'(])([A-Za-z]:[\\/][^\s"'`)\]}]+|\/?(?:[\w.@+-]+[\\/])*[\w.@+-]+\.[A-Za-z0-9]{1,8})(?=$|[\s)\]}`"'.,;:!?])/g;
      while ((match = bare.exec(text)) !== null) push(match[0], match[1], match.index);
      found.sort((left, right) => left.start - right.start || right.token.length - left.token.length);
      const kept = [];
      for (const item of found) {
        const previous = kept[kept.length - 1];
        if (previous !== undefined && item.start < previous.start + previous.token.length) continue;
        kept.push(item);
      }
      return kept;
    }

    /** Absolute path behind one reference, or null when nothing can resolve it. */
    function absoluteOf(token, path) {
      const inserted = byToken.get(token);
      if (inserted !== undefined) return inserted;
      const raw = path.trim();
      if (raw === '') return null;
      if (isAbsolutePath(raw)) return normalizeAbsolute(raw);
      const known = byRel.get(raw.replace(/\/+$/, ''));
      if (known !== undefined) return known;
      if (raw.includes('/') || raw.includes('\\')) {
        const root = workspaceRoot();
        return root === '' ? null : normalizeAbsolute(root + '/' + raw.replace(/^[\\/]+/, ''));
      }
      return nameIndex().get(raw) ?? null;
    }

    /** Rewrite every resolvable name inside copied text to its absolute path. */
    function absolutize(text) {
      let rewritten = text;
      const found = scanReferences(text);
      for (let index = found.length - 1; index >= 0; index -= 1) {
        const item = found[index];
        const absolute = absoluteOf(item.token, item.path);
        if (absolute === null) continue;
        rewritten = rewritten.slice(0, item.start) + absolute + rewritten.slice(item.start + item.token.length);
      }
      return rewritten;
    }

    /** The selection a copy gesture carries: textarea offsets first, editor selection otherwise. */
    function selectedText(event) {
      const target = event.target instanceof Element ? event.target : null;
      const area = target === null ? null : target.closest('textarea');
      if (area !== null && typeof area.selectionStart === 'number' && area.selectionStart !== area.selectionEnd) {
        return area.value.slice(area.selectionStart, area.selectionEnd);
      }
      const selection = document.getSelection();
      return selection === null ? '' : selection.toString();
    }

    /** Clipboard write with a selection fallback for non-secure contexts. */
    function copyText(text) {
      if (navigator.clipboard !== undefined) {
        return navigator.clipboard.writeText(text).then(
          () => true,
          () => false,
        );
      }
      const scratch = document.createElement('textarea');
      scratch.value = text;
      scratch.setAttribute('readonly', '');
      scratch.style.position = 'fixed';
      scratch.style.opacity = '0';
      document.body.append(scratch);
      scratch.select();
      let copied = false;
      try {
        copied = document.execCommand('copy');
      } catch {
        copied = false;
      }
      scratch.remove();
      return Promise.resolve(copied);
    }

    /** The tree row naming one absolute path, whatever separator spelling it uses. */
    function rowFor(absolute) {
      const target = comparable(absolute);
      for (const row of document.querySelectorAll('[data-files-path]')) {
        const candidate = row.getAttribute('data-files-path') || '';
        if (candidate !== '' && comparable(candidate) === target) return row;
      }
      return null;
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    /** Wait for one path's row, which appears only after its parent directory lists. */
    async function waitForRow(absolute) {
      for (let step = 0; step < REVEAL_STEPS; step += 1) {
        const row = rowFor(absolute);
        if (row !== null) return row;
        await sleep(REVEAL_STEP_MS);
      }
      return null;
    }

    /** Expand a path's ancestor rows one directory at a time, then flash the row. */
    async function revealInTree(absolute) {
      const root = workspaceRoot();
      if (root === '') return;
      const target = comparable(absolute);
      const base = comparable(root);
      if (target !== base && !target.startsWith(`${base}/`)) return;
      const segments = absolute
        .slice(root.length)
        .split(/[\\/]+/)
        .filter((segment) => segment !== '');
      let current = root;
      for (let index = 0; index < segments.length; index += 1) {
        current = `${current.replace(/[\\/]+$/, '')}/${segments[index]}`;
        const row = await waitForRow(current);
        if (row === null) return;
        if (index === segments.length - 1) {
          row.scrollIntoView({ block: 'nearest' });
          row.classList.add('dshfd-flash');
          setTimeout(() => row.classList.remove('dshfd-flash'), FLASH_MS);
          return;
        }
        const button = row.querySelector('button');
        if (button !== null && button.getAttribute('aria-expanded') !== 'true') button.click();
      }
    }

    /** Absolute path named by one `dsh-resource://file/…` address, or null. */
    function absoluteForAddress(address) {
      if (!address.startsWith(FILE_ADDRESS)) return null;
      const parts = address.slice(FILE_ADDRESS.length).split('/');
      const scope = parts.shift() ?? '';
      const path = parts.map((segment) => decodeURIComponent(segment)).join('/');
      if (path === '') return null;
      if (scope === 'absolute') return normalizeAbsolute(path);
      if (scope !== 'session') return null;
      const root = workspaceRoot();
      return root === '' ? null : normalizeAbsolute(`${root}/${path}`);
    }

    /** Input dock occupant: captures the composer actions every insertion goes through. */
    function InputDock(props) {
      const actions = props.inputActions;
      const draftRef = React.useRef('');
      if (props.useInput !== undefined) draftRef.current = props.useInput((state) => state.draft);
      React.useEffect(() => {
        if (!actions) return undefined;
        bridge = {
          insert(text) {
            for (let attempt = 0; attempt < 2; attempt += 1) {
              const span = actions.captureInsertion?.();
              if (span === undefined || actions.insertText(text, span)) return;
            }
            const current = draftRef.current;
            const separator = current === '' || current.endsWith('\n') ? '' : '\n';
            actions.setDraft(current + separator + text);
          },
        };
        return () => {
          bridge = null;
        };
      }, [actions]);
      return null;
    }

    return {
      inject: ['slots'],
      apply(ctx, config) {
        const slots = ctx.get('slots') ?? ctx.slots;
        if (slots === undefined) return;
        if (config && typeof config.format === 'string' && config.format !== '') options.format = config.format;
        if (config && typeof config.altFormat === 'string' && config.altFormat !== '') options.altFormat = config.altFormat;
        if (config && typeof config.rewriteCopy === 'boolean') options.rewriteCopy = config.rewriteCopy;
        if (config && typeof config.reveal === 'boolean') options.reveal = config.reveal;

        /** Mark one subtree's rows draggable, idempotently. */
        const mark = (root) => {
          if (!(root instanceof Element)) return;
          const rows = [];
          if (root.matches('[data-files-path]')) rows.push(root);
          for (const row of root.querySelectorAll('[data-files-path]')) rows.push(row);
          for (const row of rows) {
            if (row.dataset.dshFilesDrag === '1') continue;
            row.dataset.dshFilesDrag = '1';
            row.draggable = true;
          }
        };

        const carriesMarker = (event) => {
          const transfer = event.dataTransfer;
          if (transfer == null) return false;
          return Array.from(transfer.types || []).indexOf(MARKER) >= 0;
        };

        const readPayload = (event) => {
          const raw = event.dataTransfer ? event.dataTransfer.getData(MARKER) : '';
          if (raw === '') return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.dshFilesDrag = '1';
          style.textContent = CSS;
          document.head.append(style);

          mark(document.body);
          const observer = new MutationObserver((records) => {
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (node.nodeType === 1) mark(node);
              }
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });

          const onDragStart = (event) => {
            const row = event.target instanceof Element ? event.target.closest('[data-files-path]') : null;
            if (row === null || event.dataTransfer == null) return;
            const absolute = normalizeAbsolute(row.getAttribute('data-files-path') || '');
            if (absolute === '') return;
            let relative = relativePath(row);
            if (row.getAttribute('data-files-entry') === 'directory' && !relative.endsWith('/')) relative += '/';
            const reference = fillTemplate(event.altKey ? options.altFormat : options.format, relative, absolute);
            const text = /\s$/.test(reference) ? reference : reference + REFERENCE_SUFFIX;
            event.dataTransfer.setData('text/plain', text);
            event.dataTransfer.setData(
              MARKER,
              JSON.stringify({ text, reference, absolute, relative: relative.replace(/\/+$/, '') }),
            );
            event.dataTransfer.effectAllowed = 'copy';
            document.body.dataset.dshFilesDragActive = '1';
          };

          const onDragOver = (event) => {
            if (!carriesMarker(event)) return;
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
          };

          const onDrop = (event) => {
            if (!carriesMarker(event)) return;
            delete document.body.dataset.dshFilesDragActive;
            const payload = readPayload(event);
            if (payload === null) return;
            byToken.set(payload.reference, payload.absolute);
            byRel.set(payload.relative, payload.absolute);
            const target = event.target instanceof Element ? event.target : null;
            if (target !== null && target.closest('[data-composer-card]') !== null) return; // native caret insert
            event.preventDefault();
            event.stopPropagation();
            if (bridge !== null) bridge.insert(payload.text);
          };

          const onDragEnd = () => {
            delete document.body.dataset.dshFilesDragActive;
          };

          /** Copying a selection resolves the file names it carries to absolute paths. */
          const onCopy = (event) => {
            if (!options.rewriteCopy) return;
            const text = selectedText(event);
            if (text === '') return;
            const rewritten = absolutize(text);
            if (rewritten === text) return;
            if (event.clipboardData == null) return;
            event.preventDefault();
            event.clipboardData.setData('text/plain', rewritten);
          };

          document.addEventListener('dragstart', onDragStart, true);
          document.addEventListener('dragover', onDragOver, true);
          document.addEventListener('drop', onDrop, true);
          document.addEventListener('dragend', onDragEnd, true);
          document.addEventListener('copy', onCopy, true);

          const sidebar = ctx.get('sidebarRight');
          let revealTimer;
          if (options.reveal && sidebar !== undefined && typeof sidebar.active === 'function') {
            let lastAddress = '';
            revealTimer = setInterval(() => {
              let record;
              try {
                record = sidebar.active();
              } catch {
                return;
              }
              const address = record && typeof record.contentId === 'string' ? record.contentId : '';
              if (address === '' || address === lastAddress) return;
              lastAddress = address;
              const absolute = absoluteForAddress(address);
              if (absolute !== null) void revealInTree(absolute);
            }, REVEAL_INTERVAL_MS);
          }

          return () => {
            observer.disconnect();
            style.remove();
            if (revealTimer !== undefined) clearInterval(revealTimer);
            document.removeEventListener('dragstart', onDragStart, true);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
            document.removeEventListener('dragend', onDragEnd, true);
            document.removeEventListener('copy', onCopy, true);
            delete document.body.dataset.dshFilesDragActive;
          };
        });

        slots.inject('conversation.input.dock', () =>
          slots.register({ name: 'conversation.input.dock', id: 'files-drag' }, (props) => el(InputDock, props)),
        );
      },
    };
  },
});
