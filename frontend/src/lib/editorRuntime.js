/**
 * Builds the sandboxed iframe HTML document by injecting the ReviseX visual editing
 * runtime into the sanitized snapshot HTML extracted by the Playwright worker.
 */
export function buildInjectedEditorHtml(snapshotHtml, options = {}) {
  if (!snapshotHtml) return '';
  const initialMode = options.mode || 'edit'; // 'edit' | 'preview' | 'readonly'

  const runtimeScript = `
<style data-revisex-ui="true">
  [data-revisex-ui="true"] {
    box-sizing: border-box !important;
    font-family: Inter, system-ui, -apple-system, sans-serif !important;
  }
  #revisex-overlay-root {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483640;
  }
  #revisex-hover-box {
    position: fixed;
    border: 1.5px dashed #3b82f6;
    background: rgba(59, 130, 246, 0.06);
    border-radius: 3px;
    pointer-events: none;
    display: none;
    transition: all 60ms ease-out;
  }
  #revisex-hover-label {
    position: absolute;
    top: -20px;
    left: -1px;
    background: #1e293b;
    color: #ffffff;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    white-space: nowrap;
    letter-spacing: 0.02em;
  }
  #revisex-select-box {
    position: fixed;
    border: 2px solid #2563eb;
    background: rgba(37, 99, 235, 0.04);
    border-radius: 3px;
    pointer-events: none;
    display: none;
  }
  #revisex-select-toolbar {
    position: absolute;
    top: -28px;
    left: -2px;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #2563eb;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
    pointer-events: auto;
    white-space: nowrap;
  }
  .revisex-pill-btn {
    background: rgba(255,255,255,0.18);
    border: none;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
  }
  .revisex-pill-btn:hover {
    background: rgba(255,255,255,0.32);
  }
  .revisex-resize-handle {
    position: absolute;
    width: 9px;
    height: 9px;
    background: #ffffff;
    border: 2px solid #2563eb;
    border-radius: 2px;
    pointer-events: auto;
    cursor: nwse-resize;
  }
  .revisex-resize-handle[data-dir="se"] {
    right: -5px;
    bottom: -5px;
    cursor: nwse-resize;
  }
  [data-revisex-editing="true"] {
    outline: 2px solid #2563eb !important;
    outline-offset: 2px !important;
    cursor: text !important;
  }
</style>
<script data-revisex-ui="true">
(function() {
  let currentMode = ${JSON.stringify(initialMode)};
  let selectedEl = null;
  let editingEl = null;
  let baselineCaptured = false;
  const baselineMap = new Map();

  const overlayRoot = document.createElement('div');
  overlayRoot.id = 'revisex-overlay-root';
  overlayRoot.setAttribute('data-revisex-ui', 'true');

  const hoverBox = document.createElement('div');
  hoverBox.id = 'revisex-hover-box';
  hoverBox.setAttribute('data-revisex-ui', 'true');
  const hoverLabel = document.createElement('div');
  hoverLabel.id = 'revisex-hover-label';
  hoverLabel.setAttribute('data-revisex-ui', 'true');
  hoverBox.appendChild(hoverLabel);

  const selectBox = document.createElement('div');
  selectBox.id = 'revisex-select-box';
  selectBox.setAttribute('data-revisex-ui', 'true');

  const selectToolbar = document.createElement('div');
  selectToolbar.id = 'revisex-select-toolbar';
  selectToolbar.setAttribute('data-revisex-ui', 'true');

  const selectTagSpan = document.createElement('span');
  selectTagSpan.setAttribute('data-revisex-ui', 'true');
  selectToolbar.appendChild(selectTagSpan);

  const quickEditBtn = document.createElement('button');
  quickEditBtn.className = 'revisex-pill-btn';
  quickEditBtn.setAttribute('data-revisex-ui', 'true');
  quickEditBtn.textContent = 'Edit';
  selectToolbar.appendChild(quickEditBtn);

  const parentBtn = document.createElement('button');
  parentBtn.className = 'revisex-pill-btn';
  parentBtn.setAttribute('data-revisex-ui', 'true');
  parentBtn.textContent = 'Parent ↑';
  selectToolbar.appendChild(parentBtn);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'revisex-resize-handle';
  resizeHandle.setAttribute('data-dir', 'se');
  resizeHandle.setAttribute('data-revisex-ui', 'true');

  selectBox.appendChild(selectToolbar);
  selectBox.appendChild(resizeHandle);
  overlayRoot.appendChild(hoverBox);
  overlayRoot.appendChild(selectBox);
  document.body.appendChild(overlayRoot);

  function captureBaselineOnce() {
    if (baselineCaptured) return;
    baselineCaptured = true;
    document.querySelectorAll('[data-revisex-id]').forEach(function(el) {
      if (isEditorUi(el)) return;
      const rxId = el.getAttribute('data-revisex-id');
      baselineMap.set(rxId, {
        text: el.textContent,
        src: el.getAttribute('src'),
        alt: el.getAttribute('alt'),
        styleAttr: el.getAttribute('style') || '',
        parentId: el.parentElement ? el.parentElement.getAttribute('data-revisex-id') : null,
        nextSiblingId: el.nextElementSibling ? el.nextElementSibling.getAttribute('data-revisex-id') : null,
      });
    });
  }

  function isEditorUi(node) {
    if (!node || node.nodeType !== 1) return true;
    return Boolean(node.closest('[data-revisex-ui="true"]')) || node.id === 'revisex-overlay-root';
  }

  function findEditableTarget(node) {
    let curr = node;
    while (curr && curr !== document.documentElement) {
      if (isEditorUi(curr)) return null;
      if (curr.hasAttribute && curr.hasAttribute('data-revisex-id')) {
        return curr;
      }
      curr = curr.parentElement;
    }
    return null;
  }

  function simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function getNthPath(el) {
    const parts = [];
    let curr = el;
    while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
      const tag = curr.tagName.toLowerCase();
      if (curr === document.body) { parts.unshift('body'); break; }
      let idx = 1;
      let sib = curr.previousElementSibling;
      while (sib) { if (sib.tagName === curr.tagName) idx++; sib = sib.previousElementSibling; }
      parts.unshift(tag + ':nth-of-type(' + idx + ')');
      curr = curr.parentElement;
    }
    return parts.join(' > ');
  }

  function getCssPath(el) {
    const parts = [];
    let curr = el;
    while (curr && curr.nodeType === 1 && curr !== document.documentElement) {
      let sel = curr.tagName.toLowerCase();
      if (curr.id && !curr.id.startsWith('rx-')) {
        sel += '#' + CSS.escape(curr.id);
        parts.unshift(sel);
        break;
      }
      const cls = Array.from(curr.classList || [])
        .filter(function(c) { return !c.startsWith('revisex-'); })
        .slice(0, 2)
        .map(function(c) { return '.' + CSS.escape(c); })
        .join('');
      parts.unshift(sel + cls);
      curr = curr.parentElement;
    }
    return parts.join(' > ');
  }

  function getFingerprint(el) {
    const attrSeed = [
      el.getAttribute('src') || '',
      el.getAttribute('href') || '',
      el.getAttribute('alt') || '',
      el.getAttribute('type') || '',
      el.getAttribute('role') || '',
      el.getAttribute('aria-label') || '',
    ].join('|');

    return {
      tagName: el.tagName.toLowerCase(),
      domId: el.id || '',
      cssPath: getCssPath(el),
      nthPath: getNthPath(el),
      classSignature: Array.from(el.classList || []).filter(function(c) { return !c.startsWith('revisex-'); }).sort().join(' '),
      textSnippet: (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
      attributesHash: simpleHash(attrSeed),
    };
  }

  function getEditableType(el) {
    if (el.tagName === 'IMG') return 'image';
    const textTags = new Set(['H1','H2','H3','H4','H5','H6','P','A','BUTTON','SPAN','LABEL','LI','BLOCKQUOTE','STRONG','EM','TD','TH']);
    const hasDirectText = Array.from(el.childNodes).some(function(n) { return n.nodeType === 3 && n.textContent.trim().length > 0; });
    if (textTags.has(el.tagName) || hasDirectText) return 'text';
    return 'container';
  }

  function serializeElement(el) {
    const cs = window.getComputedStyle(el);
    const ancestors = [];
    let p = el.parentElement;
    while (p && p !== document.documentElement && ancestors.length < 5) {
      if (p.hasAttribute('data-revisex-id')) {
        ancestors.unshift({
          elementId: p.getAttribute('data-revisex-id'),
          tagName: p.tagName.toLowerCase(),
        });
      }
      p = p.parentElement;
    }
    const rxId = el.getAttribute('data-revisex-id');
    const base = baselineMap.get(rxId);
    const eType = getEditableType(el);
    return {
      elementId: rxId,
      fingerprint: getFingerprint(el),
      tagName: el.tagName.toLowerCase(),
      editableType: eType,
      text: eType === 'text' ? (el.innerText || el.textContent || '').trim() : '',
      originalText: base ? base.text : (el.innerText || el.textContent || '').trim(),
      src: el.tagName === 'IMG' ? (el.getAttribute('src') || el.currentSrc || '') : '',
      originalSrc: base ? base.src : (el.getAttribute('src') || ''),
      alt: el.tagName === 'IMG' ? (el.getAttribute('alt') || '') : '',
      ancestors: ancestors,
      styles: {
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        borderColor: cs.borderColor,
        borderWidth: cs.borderWidth,
        borderStyle: cs.borderStyle,
        borderRadius: cs.borderRadius,
        fontSize: cs.fontSize,
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        textAlign: cs.textAlign,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        width: cs.width,
        height: cs.height,
        marginTop: cs.marginTop,
        marginRight: cs.marginRight,
        marginBottom: cs.marginBottom,
        marginLeft: cs.marginLeft,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        display: cs.display,
        visibility: cs.visibility,
        position: cs.position,
        flexDirection: cs.flexDirection,
        justifyContent: cs.justifyContent,
        alignItems: cs.alignItems,
        gap: cs.gap,
        gridTemplateColumns: cs.gridTemplateColumns,
      }
    };
  }

  function positionBox(box, el) {
    if (!el || !el.isConnected) {
      box.style.display = 'none';
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) {
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.style.left = r.left + 'px';
    box.style.top = r.top + 'px';
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
  }

  function selectElement(el, notifyParent) {
    if (!el || isEditorUi(el)) return;
    selectedEl = el;
    if (currentMode === 'edit') {
      positionBox(selectBox, el);
      selectTagSpan.textContent = '<' + el.tagName.toLowerCase() + '>';
      const eType = getEditableType(el);
      quickEditBtn.textContent = eType === 'image' ? 'Change Image' : eType === 'text' ? 'Edit Text' : 'Inspect';
      // Flip toolbar below if near top edge
      const rect = el.getBoundingClientRect();
      selectToolbar.style.top = rect.top < 36 ? (rect.height + 6) + 'px' : '-28px';
    } else {
      selectBox.style.display = 'none';
    }
    if (notifyParent !== false) {
      window.parent.postMessage({ type: 'REVISEX_ELEMENT_SELECTED', payload: serializeElement(el) }, '*');
    }
  }

  function startInlineTextEdit(el) {
    if (!el || currentMode !== 'edit') return;
    const eType = getEditableType(el);
    if (eType !== 'text') return;
    if (editingEl && editingEl !== el) {
      finishInlineTextEdit(editingEl);
    }
    editingEl = el;
    const beforeText = (el.innerText || el.textContent || '').trim();
    el.setAttribute('data-revisex-before-edit', beforeText);
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('data-revisex-editing', 'true');
    el.focus();
  }

  function finishInlineTextEdit(el) {
    if (!el) return;
    const newText = (el.innerText || el.textContent || '').trim();
    const beforeText = el.getAttribute('data-revisex-before-edit') || '';
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-revisex-editing');
    el.removeAttribute('data-revisex-before-edit');
    if (editingEl === el) editingEl = null;

    if (newText !== beforeText) {
      const data = serializeElement(el);
      window.parent.postMessage({
        type: 'REVISEX_INLINE_TEXT_CHANGED',
        payload: {
          elementId: data.elementId,
          fingerprint: data.fingerprint,
          originalValue: data.originalText,
          proposedValue: newText,
        }
      }, '*');
      selectElement(el, true);
    }
  }

  quickEditBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedEl) return;
    const eType = getEditableType(selectedEl);
    if (eType === 'text') {
      startInlineTextEdit(selectedEl);
    } else {
      window.parent.postMessage({ type: 'REVISEX_OPEN_PANEL_TAB', tab: eType === 'image' ? 'image' : 'style' }, '*');
    }
  });

  parentBtn.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedEl || !selectedEl.parentElement) return;
    const parentTarget = findEditableTarget(selectedEl.parentElement);
    if (parentTarget) selectElement(parentTarget, true);
  });

  // Resize handle dragging
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartW = 0;
  let resizeStartH = 0;

  resizeHandle.addEventListener('mousedown', function(e) {
    if (!selectedEl || currentMode !== 'edit') return;
    e.preventDefault();
    e.stopPropagation();
    resizing = true;
    const rect = selectedEl.getBoundingClientRect();
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeStartW = rect.width;
    resizeStartH = rect.height;
  });

  window.addEventListener('mousemove', function(e) {
    if (resizing && selectedEl) {
      const nextW = Math.max(24, Math.round(resizeStartW + (e.clientX - resizeStartX)));
      const nextH = Math.max(20, Math.round(resizeStartH + (e.clientY - resizeStartY)));
      selectedEl.style.width = nextW + 'px';
      selectedEl.style.height = nextH + 'px';
      positionBox(selectBox, selectedEl);
      return;
    }
    if (currentMode !== 'edit' || editingEl) {
      hoverBox.style.display = 'none';
      return;
    }
    const target = findEditableTarget(e.target);
    if (!target || target === selectedEl) {
      hoverBox.style.display = 'none';
      return;
    }
    positionBox(hoverBox, target);
    hoverLabel.textContent = target.tagName.toLowerCase();
  });

  window.addEventListener('mouseup', function() {
    if (resizing && selectedEl) {
      resizing = false;
      const data = serializeElement(selectedEl);
      window.parent.postMessage({
        type: 'REVISEX_ELEMENT_RESIZED',
        payload: {
          elementId: data.elementId,
          fingerprint: data.fingerprint,
          proposedValue: {
            width: selectedEl.style.width,
            height: selectedEl.style.height,
          }
        }
      }, '*');
      selectElement(selectedEl, true);
    }
  });

  document.addEventListener('click', function(e) {
    if (isEditorUi(e.target)) return;
    if (currentMode === 'edit') {
      e.preventDefault();
      e.stopPropagation();
      if (editingEl && editingEl !== e.target && !editingEl.contains(e.target)) {
        finishInlineTextEdit(editingEl);
      }
      const target = findEditableTarget(e.target);
      if (target) selectElement(target, true);
    } else {
      // In preview or readonly mode, intercept link navigation and forward to parent
      const anchor = e.target.closest('a[href]');
      if (anchor) {
        e.preventDefault();
        window.parent.postMessage({ type: 'REVISEX_NAVIGATE_LINK', url: anchor.href }, '*');
      }
    }
  }, true);

  document.addEventListener('dblclick', function(e) {
    if (currentMode !== 'edit' || isEditorUi(e.target)) return;
    const target = findEditableTarget(e.target);
    if (target && getEditableType(target) === 'text') {
      e.preventDefault();
      e.stopPropagation();
      selectElement(target, true);
      startInlineTextEdit(target);
    }
  }, true);

  document.addEventListener('keydown', function(e) {
    if (editingEl && e.key === 'Escape') {
      finishInlineTextEdit(editingEl);
    }
  });

  window.addEventListener('scroll', function() {
    if (selectedEl && currentMode === 'edit') positionBox(selectBox, selectedEl);
    hoverBox.style.display = 'none';
  }, true);

  window.addEventListener('resize', function() {
    if (selectedEl && currentMode === 'edit') positionBox(selectBox, selectedEl);
  });

  function resetToBaseline() {
    captureBaselineOnce();
    baselineMap.forEach(function(base, rxId) {
      const el = document.querySelector('[data-revisex-id="' + CSS.escape(rxId) + '"]');
      if (!el) return;
      if (base.styleAttr) el.setAttribute('style', base.styleAttr);
      else el.removeAttribute('style');
      if (el.tagName === 'IMG') {
        if (base.src !== null) el.setAttribute('src', base.src);
        if (base.alt !== null) el.setAttribute('alt', base.alt);
      } else if (getEditableType(el) === 'text' && base.text !== null) {
        el.textContent = base.text;
      }
    });
  }

  function applyPatches(patches) {
    resetToBaseline();
    if (!Array.isArray(patches)) return;
    patches.forEach(function(patch) {
      if (patch.unresolved) return;
      const el = document.querySelector('[data-revisex-id="' + CSS.escape(patch.elementId) + '"]');
      if (!el) return;
      if (patch.type === 'text') {
        const val = typeof patch.proposedValue === 'object' ? patch.proposedValue.text : patch.proposedValue;
        if (typeof val === 'string') el.textContent = val;
      } else if (patch.type === 'image') {
        const src = typeof patch.proposedValue === 'object' ? patch.proposedValue.src : patch.proposedValue;
        const alt = typeof patch.proposedValue === 'object' ? patch.proposedValue.alt : undefined;
        if (typeof src === 'string' && src) {
          el.setAttribute('src', src);
          el.removeAttribute('srcset');
        }
        if (typeof alt === 'string') el.setAttribute('alt', alt);
      } else if (patch.type === 'style' || patch.type === 'layout' || patch.type === 'visibility') {
        if (patch.proposedValue && typeof patch.proposedValue === 'object') {
          Object.entries(patch.proposedValue).forEach(function(entry) {
            el.style[entry[0]] = String(entry[1]);
          });
        }
      } else if (patch.type === 'move') {
        const dir = patch.proposedValue && patch.proposedValue.direction;
        const parent = el.parentElement;
        if (parent && dir === 'up' && el.previousElementSibling) {
          parent.insertBefore(el, el.previousElementSibling);
        } else if (parent && dir === 'down' && el.nextElementSibling) {
          parent.insertBefore(el.nextElementSibling, el);
        }
      }
    });

    if (selectedEl) {
      positionBox(selectBox, selectedEl);
      window.parent.postMessage({ type: 'REVISEX_ELEMENT_SELECTED', payload: serializeElement(selectedEl) }, '*');
    }
  }

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'REVISEX_SET_MODE') {
      currentMode = msg.mode || 'edit';
      if (currentMode !== 'edit') {
        hoverBox.style.display = 'none';
        selectBox.style.display = 'none';
        if (editingEl) finishInlineTextEdit(editingEl);
      } else if (selectedEl) {
        positionBox(selectBox, selectedEl);
      }
    } else if (msg.type === 'REVISEX_APPLY_PATCHES') {
      applyPatches(msg.patches || []);
    } else if (msg.type === 'REVISEX_SELECT_ELEMENT' && msg.elementId) {
      const el = document.querySelector('[data-revisex-id="' + CSS.escape(msg.elementId) + '"]');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function() { selectElement(el, true); }, 200);
      }
    }
  });

  captureBaselineOnce();
  window.parent.postMessage({ type: 'REVISEX_IFRAME_READY' }, '*');
})();
</script>`;

  if (snapshotHtml.includes('</body>')) {
    return snapshotHtml.replace('</body>', `${runtimeScript}\n</body>`);
  }
  return snapshotHtml + runtimeScript;
}
