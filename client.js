/**
 * dsh-files-drag client half: built-in file-panel rows become draggable, the
 * dropped reference lands in the composer, and the draft's references expose
 * their absolute path (tray copy, Alt drag, copy rewrite).
 * Row/slot contracts, flows and every config key: docs/DESIGN.md.
 */
window.__ModuleLoader__.load({
  id: 'dsh-files-drag',
  factory(require) {
    const React = require('react');
    const el = React.createElement;

    /** Drag payload type this module owns; drags without it are left untouched. */
    const MARKER = 'application/x-dsh-files-drag';
    /** Composer textarea; the dock slot exposes no workspace root, the DOM does. */
    const COMPOSER = '[data-composer-card] textarea';
    const DEFAULT_FORMAT = '@{path}';
    const DEFAULT_ALT_FORMAT = '{abs}';
    const COPIED_MS = 1200;
    const CSS = [
      '[data-files-path][data-dsh-files-drag] > button{cursor:grab}',
      '[data-files-path][data-dsh-files-drag] > button:active{cursor:grabbing}',
      'body[data-dsh-files-drag-active] [data-composer-card]{outline:2px dashed var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
      '.dshfd-tray{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:2px 0 6px}',
      '.dshfd-tray-label{font-size:11px;color:var(--dsw-alias-label-tertiary)}',
      '.dshfd-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:24px;padding:0 8px;border:0;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}',
      '.dshfd-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dshfd-chip-name{max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-primary)}',
      '.dshfd-chip-dir{max-width:160px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--dsw-alias-label-tertiary)}',
      '.dshfd-chip-action{color:var(--dsw-alias-label-tertiary)}',
      '.dshfd-chip-copied .dshfd-chip-action{color:var(--dsw-alias-brand-primary)}',
    ].join('\n');

    /** Inserted reference text → absolute path; workspace-relative path → absolute path. */
    const byToken = new Map();
    const byRel = new Map();
    /** Composer bridge captured from the input dock slot. */
    let bridge = null;
    /** Row config, defaulted in apply. */
    const options = { format: DEFAULT_FORMAT, altFormat: DEFAULT_ALT_FORMAT, tray: true, rewriteCopy: true };

    /** Windows drive and UNC paths get backslashes; POSIX paths are left alone. */
    function normalizeAbsolute(path) {
      return /^[A-Za-z]:/.test(path) ? path.replace(/\//g, '\\') : path;
    }

    function isAbsolutePath(path) {
      return path.startsWith('/') || path.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(path);
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

    /** Reference tokens a draft may carry: `@path`, `@"path with spaces"`, `[file: path]`. */
    function scanReferences(text) {
      const found = [];
      let match;
      const at = /(?<=^|[\s([{])@(?:"([^"\n]+)"|([^\s@"'`]+))/g;
      while ((match = at.exec(text)) !== null) {
        found.push({ token: match[0], path: match[1] ?? match[2], start: match.index });
      }
      const tagged = /\[file:\s*([^\]\n]+?)\s*\]/g;
      while ((match = tagged.exec(text)) !== null) {
        found.push({ token: match[0], path: match[1], start: match.index });
      }
      return found.sort((left, right) => left.start - right.start);
    }

    /** Absolute path behind one reference, or null when nothing can resolve it. */
    function absoluteOf(token, path) {
      const inserted = byToken.get(token);
      if (inserted !== undefined) return inserted;
      if (isAbsolutePath(path)) return normalizeAbsolute(path);
      const known = byRel.get(path.replace(/\/+$/, ''));
      if (known !== undefined) return known;
      const root = workspaceRoot();
      return root === '' ? null : normalizeAbsolute(root + '/' + path);
    }

    /** Resolvable references in a draft, deduplicated by absolute path. */
    function referencesIn(draft) {
      const seen = new Set();
      const references = [];
      for (const found of scanReferences(draft)) {
        const absolute = absoluteOf(found.token, found.path);
        if (absolute === null || seen.has(absolute)) continue;
        seen.add(absolute);
        references.push({ token: found.token, relative: found.path, absolute });
      }
      return references;
    }

    /** Rewrite every resolvable reference inside copied text to its absolute path. */
    function absolutize(text) {
      const found = scanReferences(text);
      let rewritten = text;
      for (let index = found.length - 1; index >= 0; index -= 1) {
        const item = found[index];
        const absolute = absoluteOf(item.token, item.path);
        if (absolute === null) continue;
        rewritten = rewritten.slice(0, item.start) + absolute + rewritten.slice(item.start + item.token.length);
      }
      return rewritten;
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

    /** One draft reference: click copies its absolute path. */
    function ReferenceChip({ reference }) {
      const [copied, setCopied] = React.useState(false);
      React.useEffect(() => {
        if (!copied) return undefined;
        const timer = setTimeout(() => setCopied(false), COPIED_MS);
        return () => clearTimeout(timer);
      }, [copied]);
      const name = reference.absolute.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || reference.absolute;
      const cut = reference.relative.replace(/\/+$/, '').lastIndexOf('/');
      return el(
        'button',
        {
          type: 'button',
          className: 'dshfd-chip' + (copied ? ' dshfd-chip-copied' : ''),
          title: reference.absolute + '\n点击复制绝对路径',
          'aria-label': '复制路径 ' + reference.absolute,
          onClick: () => {
            void copyText(reference.absolute).then((ok) => {
              if (ok) setCopied(true);
            });
          },
        },
        el('span', { className: 'dshfd-chip-name' }, name),
        cut > 0 ? el('span', { className: 'dshfd-chip-dir' }, reference.relative.slice(0, cut)) : null,
        el('span', { className: 'dshfd-chip-action' }, copied ? '已复制' : '复制路径'),
      );
    }

    /** Draft references as chips; renders nothing while the draft names none. */
    function ReferenceTray({ draft }) {
      const references = React.useMemo(() => referencesIn(draft), [draft]);
      if (references.length === 0) return null;
      return el(
        'div',
        { className: 'dshfd-tray' },
        el('span', { className: 'dshfd-tray-label' }, '文件引用'),
        ...references.map((reference) => el(ReferenceChip, { key: reference.absolute, reference })),
      );
    }

    /** Input dock occupant: captures draft/actions for drops, renders the tray. */
    function InputDock(props) {
      const input = props.useInput ? props.useInput((state) => state) : undefined;
      const actions = props.inputActions;
      const draft = input ? input.draft : '';
      const draftRef = React.useRef('');
      draftRef.current = draft;
      React.useEffect(() => {
        if (!actions) return undefined;
        bridge = {
          insert(text) {
            const current = draftRef.current;
            const separator = current === '' || current.endsWith('\n') ? '' : '\n';
            actions.setDraft(current + separator + text);
          },
        };
        return () => {
          bridge = null;
        };
      }, [actions]);
      return options.tray ? el(ReferenceTray, { draft }) : null;
    }

    return {
      inject: ['slots'],
      apply(ctx, config) {
        const slots = ctx.get('slots') ?? ctx.slots;
        if (slots === undefined) return;
        if (config && typeof config.format === 'string' && config.format !== '') options.format = config.format;
        if (config && typeof config.altFormat === 'string' && config.altFormat !== '') options.altFormat = config.altFormat;
        if (config && typeof config.tray === 'boolean') options.tray = config.tray;
        if (config && typeof config.rewriteCopy === 'boolean') options.rewriteCopy = config.rewriteCopy;

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

        /** Marker payload is JSON so a drop can also record the absolute path. */
        const readPayload = (event) => {
          const raw = event.dataTransfer ? event.dataTransfer.getData(MARKER) : '';
          if (raw === '') return null;
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        const carriesMarker = (event) => {
          const transfer = event.dataTransfer;
          if (transfer == null) return false;
          return Array.from(transfer.types || []).indexOf(MARKER) >= 0;
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
            const text = fillTemplate(event.altKey ? options.altFormat : options.format, relative, absolute);
            event.dataTransfer.setData('text/plain', text);
            event.dataTransfer.setData(MARKER, JSON.stringify({ text, absolute, relative: relative.replace(/\/+$/, '') }));
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
            byToken.set(payload.text, payload.absolute);
            byRel.set(payload.relative, payload.absolute);
            const target = event.target instanceof Element ? event.target : null;
            if (target !== null && target.closest(COMPOSER) !== null) return; // browser inserts at the caret
            event.preventDefault();
            event.stopPropagation();
            if (bridge !== null) bridge.insert(payload.text);
          };

          const onDragEnd = () => {
            delete document.body.dataset.dshFilesDragActive;
          };

          /** Copying inside the composer yields absolute paths for known references. */
          const onCopy = (event) => {
            if (!options.rewriteCopy) return;
            const target = event.target instanceof Element ? event.target : null;
            const composer = target === null ? null : target.closest(COMPOSER);
            if (composer === null || event.clipboardData == null) return;
            const start = composer.selectionStart;
            const end = composer.selectionEnd;
            if (typeof start !== 'number' || typeof end !== 'number' || start === end) return;
            const selected = composer.value.slice(start, end);
            const rewritten = absolutize(selected);
            if (rewritten === selected) return;
            event.preventDefault();
            event.clipboardData.setData('text/plain', rewritten);
          };

          document.addEventListener('dragstart', onDragStart, true);
          document.addEventListener('dragover', onDragOver, true);
          document.addEventListener('drop', onDrop, true);
          document.addEventListener('dragend', onDragEnd, true);
          document.addEventListener('copy', onCopy, true);

          return () => {
            observer.disconnect();
            style.remove();
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
