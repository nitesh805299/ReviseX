import React, { useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, Globe, Loader2, RefreshCw } from 'lucide-react';
import { buildInjectedEditorHtml } from '../../lib/editorRuntime';
import { useEditorStore } from '../../store/editorStore';
import { api } from '../../lib/api';

const VIEWPORT_WIDTHS = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export function PreviewCanvas({ iframeRef, onOpenInspectorTab }) {
  const {
    snapshotHtml,
    sessionLoading,
    sessionError,
    viewport,
    mode,
    viewMode,
    patches,
    activePageUrl,
    streamFrame,
    session,
    project,
    setSelectedElement,
    applyChange,
    navigateToUrl,
    loadProjectAndStartSession,
    setStreamFrame,
  } = useEditorStore();

  const iframeReadyRef = useRef(false);

  const pagePatches = useMemo(
    () => patches.filter((p) => !p.pageUrl || p.pageUrl === activePageUrl),
    [patches, activePageUrl]
  );

  const srcDocHtml = useMemo(
    () => buildInjectedEditorHtml(snapshotHtml, { mode }),
    [snapshotHtml]
  );

  // Sync mode changes to iframe
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'REVISEX_SET_MODE', mode }, '*');
  }, [mode, iframeRef]);

  // Sync patches to iframe whenever patches or active page change
  useEffect(() => {
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'REVISEX_APPLY_PATCHES', patches: pagePatches },
        '*'
      );
    }
  }, [pagePatches, iframeRef]);

  // Listen to postMessage events from inside sandboxed iframe
  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'REVISEX_IFRAME_READY') {
        iframeReadyRef.current = true;
        iframeRef.current?.contentWindow?.postMessage({ type: 'REVISEX_SET_MODE', mode }, '*');
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'REVISEX_APPLY_PATCHES', patches: pagePatches },
          '*'
        );
      } else if (msg.type === 'REVISEX_ELEMENT_SELECTED') {
        setSelectedElement(msg.payload);
      } else if (msg.type === 'REVISEX_INLINE_TEXT_CHANGED') {
        const p = msg.payload;
        applyChange({
          elementId: p.elementId,
          elementFingerprint: p.fingerprint,
          type: 'text',
          originalValue: p.originalValue,
          proposedValue: p.proposedValue,
          label: 'Inline text edit',
        });
      } else if (msg.type === 'REVISEX_ELEMENT_RESIZED') {
        const p = msg.payload;
        applyChange({
          elementId: p.elementId,
          elementFingerprint: p.fingerprint,
          type: 'layout',
          originalValue: {},
          proposedValue: p.proposedValue,
          label: 'Resize element',
        });
      } else if (msg.type === 'REVISEX_OPEN_PANEL_TAB') {
        onOpenInspectorTab?.(msg.tab);
      } else if (msg.type === 'REVISEX_NAVIGATE_LINK' && msg.url) {
        navigateToUrl(msg.url);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, mode, pagePatches, setSelectedElement, applyChange, onOpenInspectorTab, navigateToUrl]);

  async function handleStreamClick(e) {
    if (!session) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * (viewport === 'mobile' ? 390 : viewport === 'tablet' ? 768 : 1440));
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 900);
    try {
      const { data } = await api.post(`/browser/sessions/${session._id}/action`, {
        type: 'click',
        x,
        y,
      });
      if (data.frame) setStreamFrame(data.frame);
    } catch {
      // ignore
    }
  }

  return (
    <main className="flex-1 bg-slate-100/90 flex flex-col overflow-hidden relative">
      {/* Sub-bar showing current URL inside isolated browser */}
      <div className="h-9 bg-white/90 border-b border-slate-200 px-4 flex items-center justify-between text-xs text-slate-500 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate font-mono text-[11px] text-slate-700">{activePageUrl}</span>
          <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-medium text-slate-500">
            Isolated Chromium
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          {mode === 'edit' ? 'Click any element to edit · Double-click text for inline edit' : 'Preview Mode'}
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 overflow-auto p-4 lg:p-6 flex justify-center items-start">
        {sessionLoading && (
          <div className="m-auto flex flex-col items-center gap-3 bg-white px-8 py-7 rounded-2xl border border-slate-200 shadow-sm text-center max-w-sm">
            <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">Opening Website in Isolated Browser</p>
              <p className="text-xs text-slate-500 mt-1">
                Validating security boundaries, rendering DOM, and preparing visual editing tools...
              </p>
            </div>
          </div>
        )}

        {!sessionLoading && sessionError && (
          <div className="m-auto bg-white px-7 py-6 rounded-2xl border border-red-200 shadow-sm max-w-md text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-900">Website Compatibility Notice</h3>
            <p className="text-xs text-slate-600 leading-relaxed">{sessionError}</p>
            {project && (
              <button
                onClick={() => loadProjectAndStartSession(project._id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Session
              </button>
            )}
          </div>
        )}

        {!sessionLoading && !sessionError && viewMode === 'stream' && (
          <div
            style={{ width: VIEWPORT_WIDTHS[viewport] || '100%', maxWidth: '100%' }}
            className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden transition-all duration-200"
          >
            {streamFrame ? (
              <img
                src={streamFrame}
                alt="Live isolated Chromium stream"
                onClick={handleStreamClick}
                className="w-full h-auto cursor-pointer block"
              />
            ) : (
              <div className="p-12 text-center text-xs text-slate-400">
                Waiting for live Playwright stream frame...
              </div>
            )}
          </div>
        )}

        {!sessionLoading && !sessionError && viewMode === 'dom' && snapshotHtml && (
          <div
            style={{ width: VIEWPORT_WIDTHS[viewport] || '100%', maxWidth: '100%' }}
            className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden transition-all duration-200 h-[calc(100vh-150px)] min-h-[540px]"
          >
            <iframe
              ref={iframeRef}
              title="ReviseX Visual Website Canvas"
              srcDoc={srcDocHtml}
              sandbox="allow-same-origin allow-scripts"
              className="w-full h-full border-0 bg-white"
            />
          </div>
        )}
      </div>
    </main>
  );
}
