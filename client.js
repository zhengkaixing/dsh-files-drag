/**
 * dsh-files-drag — make the *built-in* workspace file panel draggable.
 *
 * The shipped `@deepseek-ai/dsh-client-ui-sidebar-files` renders every tree row
 * as `<li data-files-path="<absolute path>" data-files-entry="file|directory|other">`
 * and attaches no drag behaviour at all, so a row cannot be dragged anywhere.
 * This browser module adds what is missing:
 *
 *   1. every `[data-files-path]` row (now and later, via MutationObserver) is
 *      marked `draggable`, with the row's own workspace-relative path derived
 *      from the surrounding `[data-files-root]` attribute;
 *   2. `dragstart` publishes the formatted reference on the drag payload;
 *   3. a drop *inside* the composer is left to the browser, which inserts the
 *      text at the caret; a drop anywhere else appends the reference to the
 *      draft through the official `conversation.input.dock` slot actions.
 *
 * Row format (optionally overridden by the row's `config.format`):
 *   {path} → workspace-relative path, with a trailing `/` for directories
 *   {abs}  → the absolute path the tree reported
 */
window.__ModuleLoader__.load({
  id: 'dsh-files-drag',
  factory(require) {
    const React = require('react');
    const el = React.createElement;

    /** Private drag payload type; drags without it are left untouched. */
    const MARKER = 'application/x-dsh-files-drag';
    /** Reference template used when the row declares no `config.format`. */
    const DEFAULT_FORMAT = '@{path}';
    /** Trailing separator: a token ending at the caret opens DSH's `@` menu. */
    const REFERENCE_SUFFIX = ' ';
    const CSS = [
      '[data-files-path][data-dsh-files-drag] > button{cursor:grab}',
      '[data-files-path][data-dsh-files-drag] > button:active{cursor:grabbing}',
      'body[data-dsh-files-drag-active] [data-composer-card]{outline:2px dashed var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:2px}',
    ].join('\n');

    /** Latest composer bridge captured from the input dock slot. */
    let bridge = null;

    /** The row's path relative to its workspace root, always forward-slashed. */
    function relativePath(row) {
      const absolute = row.getAttribute('data-files-path') || '';
      if (absolute === '') return '';
      const host = row.closest('[data-files-root]');
      const root = host === null ? '' : host.getAttribute('data-files-root') || '';
      let relative = absolute;
      if (root !== '' && absolute.startsWith(root)) relative = absolute.slice(root.length);
      relative = relative.replace(/^[/\\]+/, '').replace(/\\/g, '/');
      return relative === '' ? absolute.replace(/\\/g, '/') : relative;
    }

    /** The text one row contributes, per the configured template. */
    function referenceOf(row, template) {
      const absolute = row.getAttribute('data-files-path') || '';
      if (absolute === '') return '';
      let relative = relativePath(row);
      if (row.getAttribute('data-files-entry') === 'directory' && !relative.endsWith('/')) relative += '/';
      return template
        .replace(/\{path\}/g, relative)
        .replace(/\{abs\}/g, absolute.replace(/\\/g, '/'));
    }

    function carriesMarker(event) {
      const transfer = event.dataTransfer;
      if (transfer == null) return false;
      return Array.from(transfer.types || []).indexOf(MARKER) >= 0;
    }

    /** Composer bridge: captures the live draft and the dock's own actions. */
    function DockBridge(props) {
      const input = props.useInput ? props.useInput((state) => state) : undefined;
      const actions = props.inputActions;
      const draft = React.useRef('');
      draft.current = input ? input.draft : '';
      React.useEffect(() => {
        if (!actions) return undefined;
        bridge = {
          insert(text) {
            const current = draft.current;
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
        const template =
          config && typeof config.format === 'string' && config.format !== ''
            ? config.format
            : DEFAULT_FORMAT;

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
            const reference = referenceOf(row, template);
            if (reference === '') return;
            const text = /\s$/.test(reference) ? reference : reference + REFERENCE_SUFFIX;
            event.dataTransfer.setData('text/plain', text);
            event.dataTransfer.setData(MARKER, text);
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
            const target = event.target instanceof Element ? event.target : null;
            const composer = target === null ? null : target.closest('[data-composer-card] textarea');
            if (composer !== null) return; // the browser inserts at the caret
            event.preventDefault();
            event.stopPropagation();
            const text = event.dataTransfer ? event.dataTransfer.getData('text/plain') : '';
            if (text !== '' && bridge !== null) bridge.insert(text);
          };

          const onDragEnd = () => {
            delete document.body.dataset.dshFilesDragActive;
          };

          document.addEventListener('dragstart', onDragStart, true);
          document.addEventListener('dragover', onDragOver, true);
          document.addEventListener('drop', onDrop, true);
          document.addEventListener('dragend', onDragEnd, true);

          return () => {
            observer.disconnect();
            style.remove();
            document.removeEventListener('dragstart', onDragStart, true);
            document.removeEventListener('dragover', onDragOver, true);
            document.removeEventListener('drop', onDrop, true);
            document.removeEventListener('dragend', onDragEnd, true);
            delete document.body.dataset.dshFilesDragActive;
          };
        });

        slots.inject('conversation.input.dock', () =>
          slots.register({ name: 'conversation.input.dock', id: 'files-drag-bridge' }, (props) =>
            el(DockBridge, props),
          ),
        );
      },
    };
  },
});
