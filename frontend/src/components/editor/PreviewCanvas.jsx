import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CornerDownLeft,
  Globe,
  Keyboard,
  Loader2,
  RefreshCw,
  RotateCw,
} from 'lucide-react';
import { buildInjectedEditorHtml } from '../../lib/editorRuntime';
import { useEditorStore } from '../../store/editorStore';
import { api } from '../../lib/api';

const VIEWPORT_WIDTHS = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

const VIEWPORT_DIMENSIONS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const SPECIAL_KEYS = new Set([
  'Enter',
  'Backspace',
  'Tab',
  'Escape',
  'Delete',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

export function PreviewCanvas({ iframeRef, onOpenInspectorTab }) {
  const {
    snapshotHtml,
    sessionLoading,
    captureLoading,
    sessionError,
    viewport,
    mode,
    compareView,
    viewMode,
    patches,
    activePageUrl,
    streamFrame,
    session,
    project,
    setSelectedElement,
    setCompareView,
    captureCurrentPage,
    applyChange,
    navigateToUrl,
    loadProjectAndStartSession,
    setStreamFrame,
  } = useEditorStore();

  const iframeReadyRef = useRef(false);
  const actionQueueRef = useRef(Promise.resolve());
  const wheelLockRef = useRef(0);
  const [liveInputText, setLiveInputText] = useState('');
  const [sendingAction, setSendingAction] = useState(false);

  const pagePatches = useMemo(
    () => patches.filter((p) => !p.pageUrl || p.pageUrl === activePageUrl),
    [patches, activePageUrl]
  );

  const effectiveMode = compareView === 'original' ? 'preview' : mode;
  const effectivePatches = useMemo(
    () => (compareView === 'edited' ? pagePatches : []),
    [compareView, pagePatches]
  );

  const srcDocHtml = useMemo(
    () => buildInjectedEditorHtml(snapshotHtml, { mode: effectiveMode }),
    [snapshotHtml]
  );

  // Sync mode changes to iframe
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'REVISEX_SET_MODE', mode: effectiveMode },
      '*'
    );
  }, [effectiveMode, iframeRef]);

  // Sync patches to iframe whenever patches, compareView, or active page change
  useEffect(() => {
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'REVISEX_APPLY_PATCHES', patches: effectivePatches },
        '*'
      );
    }
  }, [effectivePatches, iframeRef]);

  // Listen to postMessage events from inside sandboxed iframe
  useEffect(() => {
    function handleMessage(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object') return;

      if (msg.type === 'REVISEX_IFRAME_READY') {
        iframeReadyRef.current = true;
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'REVISEX_SET_MODE', mode: effectiveMode },
          '*'
        );
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'REVISEX_APPLY_PATCHES', patches: effectivePatches },
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
  }, [iframeRef, effectiveMode, effectivePatches, setSelectedElement, applyChange, onOpenInspectorTab, navigateToUrl]);

  function sendRemoteAction(payload) {
    if (!session) return Promise.resolve();
    const run = async () => {
      setSendingAction(true);
      try {
        const { data } = await api.post(`/browser/sessions/${session._id}/action`, payload);
        if (data.frame) setStreamFrame(data.frame, data.url);
      } catch {
        // ignore transient action error
      } finally {
        setSendingAction(false);
      }
    };
    actionQueueRef.current = actionQueueRef.current.then(run, run);
    return actionQueueRef.current;
  }

  function handleStreamClick(e) {
    if (!session) return;
    e.currentTarget.parentElement?.focus();
    const rect = e.currentTarget.getBoundingClientRect();
    const dims = VIEWPORT_DIMENSIONS[viewport] || VIEWPORT_DIMENSIONS.desktop;
    const x = Math.round(((e.clientX - rect.left) / rect.width) * dims.width);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * dims.height);
    sendRemoteAction({ type: 'click', x, y });
  }

  function handleStreamWheel(e) {
    const now = Date.now();
    if (now - wheelLockRef.current < 120) return;
    wheelLockRef.current = now;
    sendRemoteAction({
      type: 'scroll',
      deltaX: Math.round(e.deltaX),
      deltaY: Math.round(e.deltaY),
    });
  }

  function handleStreamKeyDown(e) {
    if (viewMode !== 'stream' || !session) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (SPECIAL_KEYS.has(e.key)) {
      e.preventDefault();
      sendRemoteAction({ type: 'press', key: e.key });
    } else if (e.key.length === 1) {
      e.preventDefault();
      sendRemoteAction({ type: 'type', text: e.key });
    }
  }

  async function handleTypeSubmit(e) {
    e.preventDefault();
    if (!liveInputText) return;
    const text = liveInputText;
    setLiveInputText('');
    await sendRemoteAction({ type: 'type', text });
  }

  return (
    <main className="flex-1 bg-slate-100/90 flex flex-col overflow-hidden relative">
      {/* Sub-bar showing current URL inside isolated browser */}
      <div className="h-9 bg-white/90 border-b border-slate-200 px-4 flex items-center justify-between text-xs text-slate-500 shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="truncate font-mono text-[11px] text-slate-700">{activePageUrl}</span>
          {viewMode === 'stream' ? (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 bg-indigo-100 text-indigo-800 border border-indigo-200">
              Live Interactive Browser
            </span>
          ) : (
            <span
              className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                compareView === 'original'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {compareView === 'original'
                ? 'Original Website'
                : `Edited Website (${pagePatches.length} ${pagePatches.length === 1 ? 'edit' : 'edits'})`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
          {viewMode === 'stream' ? (
            <span className="hidden md:inline text-indigo-700 font-medium">
              Log in or navigate here, then click &ldquo;Capture &amp; Edit This Page&rdquo;
            </span>
          ) : compareView === 'original' ? (
            <>
              <span className="hidden md:inline text-amber-700 font-medium">
                Showing original website before edits
              </span>
              <button
                type="button"
                onClick={() => setCompareView('edited')}
                className="px-2 py-0.5 rounded bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition"
              >
                Show Edited
              </button>
            </>
          ) : (
            <span>
              {effectiveMode === 'edit'
                ? 'Click any element to edit · Double-click text for inline edit'
                : 'Preview Mode'}
            </span>
          )}
        </div>
      </div>

      {/* Live Interactive Login & Navigation Controls */}
      {viewMode === 'stream' && !sessionLoading && !sessionError && (
        <div className="bg-indigo-50/90 border-b border-indigo-200 px-3 lg:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-[240px]">
            <button
              type="button"
              onClick={() => sendRemoteAction({ type: 'back' })}
              disabled={sendingAction}
              title="Browser Back"
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => sendRemoteAction({ type: 'reload' })}
              disabled={sendingAction}
              title="Reload Current Page"
              className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <form onSubmit={handleTypeSubmit} className="flex items-center gap-1.5 flex-1 max-w-md">
              <div className="relative flex-1 min-w-[160px]">
                <Keyboard className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={liveInputText}
                  onChange={(e) => setLiveInputText(e.target.value)}
                  placeholder="Click a field below, then type or paste text here..."
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={!liveInputText}
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40"
              >
                Type
              </button>
            </form>

            <button
              type="button"
              onClick={() => sendRemoteAction({ type: 'press', key: 'Tab' })}
              className="px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              title="Press Tab key"
            >
              Tab
            </button>
            <button
              type="button"
              onClick={() => sendRemoteAction({ type: 'press', key: 'Enter' })}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
              title="Press Enter key"
            >
              <CornerDownLeft className="w-3 h-3" />
              Enter
            </button>
          </div>

          <button
            type="button"
            onClick={captureCurrentPage}
            disabled={captureLoading}
            title="Extract this logged-in page and open it in the Visual DOM Editor"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-60"
          >
            {captureLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Camera className="w-3.5 h-3.5" />
            )}
            <span>{captureLoading ? 'Capturing Page...' : 'Capture & Edit This Page'}</span>
          </button>
        </div>
      )}

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
            tabIndex={0}
            onKeyDown={handleStreamKeyDown}
            onWheel={handleStreamWheel}
            style={{ width: VIEWPORT_WIDTHS[viewport] || '100%', maxWidth: '100%' }}
            className="bg-white rounded-xl border-2 border-indigo-200 focus:border-indigo-500 focus:outline-none shadow-lg overflow-hidden transition-all duration-200"
          >
            {streamFrame ? (
              <img
                src={streamFrame}
                alt="Live isolated Chromium stream"
                onClick={handleStreamClick}
                className="w-full h-auto cursor-pointer block select-none"
                draggable={false}
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
