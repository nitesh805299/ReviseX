import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileDiff,
  Globe,
  Loader2,
  Lock,
  Monitor,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { api } from '../lib/api';
import { buildInjectedEditorHtml } from '../lib/editorRuntime';

const VIEWPORT_WIDTHS = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

function formatChangeVal(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    if (val.src) return val.src;
    return Object.entries(val)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  }
  return String(val);
}

export function SharePreviewPage() {
  const { token } = useParams();
  const iframeRef = useRef(null);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');

  const [activePageUrl, setActivePageUrl] = useState('');
  const [compareMode, setCompareMode] = useState('proposed'); // 'proposed' | 'original'
  const [viewport, setViewport] = useState('desktop');

  async function fetchShare(pwd = '') {
    setLoading(true);
    setError('');
    try {
      const headers = pwd ? { 'x-share-password': pwd } : {};
      const res = await api.get(`/shares/${token}`, { headers });
      setData(res.data);
      setPasswordRequired(false);
      const firstPage = res.data.pages?.[0]?.originalUrl || res.data.project?.originalUrl || '';
      setActivePageUrl(firstPage);
    } catch (err) {
      if (err.response?.data?.passwordRequired) {
        setPasswordRequired(true);
        setError(err.response?.data?.error || '');
      } else {
        setError(err.response?.data?.error || 'This share link could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchShare();
  }, [token]);

  const activePage = useMemo(() => {
    if (!data?.pages?.length) return null;
    return data.pages.find((p) => p.originalUrl === activePageUrl) || data.pages[0];
  }, [data, activePageUrl]);

  const activePagePatches = useMemo(() => {
    if (!data?.changes) return [];
    return data.changes.filter((c) => !c.pageUrl || c.pageUrl === activePage?.originalUrl);
  }, [data, activePage]);

  const srcDocHtml = useMemo(() => {
    if (!activePage?.snapshotHtml) return '';
    return buildInjectedEditorHtml(activePage.snapshotHtml, { mode: 'readonly' });
  }, [activePage?.snapshotHtml]);

  useEffect(() => {
    if (!iframeRef.current?.contentWindow) return;
    const patchesToApply = compareMode === 'proposed' ? activePagePatches : [];
    iframeRef.current.contentWindow.postMessage(
      { type: 'REVISEX_APPLY_PATCHES', patches: patchesToApply },
      '*'
    );
  }, [compareMode, activePagePatches]);

  useEffect(() => {
    function onMsg(event) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'REVISEX_IFRAME_READY') {
        const patchesToApply = compareMode === 'proposed' ? activePagePatches : [];
        iframeRef.current?.contentWindow?.postMessage(
          { type: 'REVISEX_APPLY_PATCHES', patches: patchesToApply },
          '*'
        );
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [compareMode, activePagePatches]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          Loading shared review preview...
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm w-full space-y-4 text-center">
          <Lock className="w-8 h-8 text-blue-600 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Protected Review Link</h1>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchShare(password);
            }}
            className="space-y-3"
          >
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter share password"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold"
            >
              Open Preview
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md text-center space-y-3">
          <AlertTriangle className="w-9 h-9 text-amber-500 mx-auto" />
          <h1 className="text-base font-semibold text-slate-900">Share Link Unavailable</h1>
          <p className="text-xs text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Mandatory Notice Banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 flex items-center justify-center gap-2 text-xs font-semibold text-amber-900 shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
        <span>{data.notice || 'PROPOSED CHANGES — NOT LIVE ON ORIGINAL WEBSITE'}</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-200/60 text-[10px] font-bold uppercase">
          Read-Only Review
        </span>
      </div>

      {/* Top Developer Bar */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Logo size="sm" />
          <div className="h-5 w-px bg-slate-200" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-900 truncate">{data.project.name}</h1>
            <a
              href={data.project.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-blue-600"
            >
              <span className="truncate max-w-[240px]">{data.project.originalUrl}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Original vs Proposed Toggle + Viewports */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              onClick={() => setCompareMode('proposed')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition ${
                compareMode === 'proposed'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Proposed Changes
            </button>
            <button
              onClick={() => setCompareMode('original')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                compareMode === 'original'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Original Site
            </button>
          </div>

          <div className="hidden md:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            {[
              { id: 'desktop', icon: Monitor },
              { id: 'tablet', icon: Tablet },
              { id: 'mobile', icon: Smartphone },
            ].map((vp) => {
              const Icon = vp.icon;
              return (
                <button
                  key={vp.id}
                  onClick={() => setViewport(vp.id)}
                  className={`p-1.5 rounded-md ${
                    viewport === vp.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Preview Canvas */}
        <main className="flex-1 overflow-auto p-4 lg:p-6 flex flex-col items-center">
          {data.pages?.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {data.pages.map((p) => (
                <button
                  key={p._id}
                  onClick={() => setActivePageUrl(p.originalUrl)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                    p.originalUrl === activePage?.originalUrl
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  {p.title || p.originalUrl}
                </button>
              ))}
            </div>
          )}

          {activePage?.snapshotHtml ? (
            <div
              style={{ width: VIEWPORT_WIDTHS[viewport] || '100%', maxWidth: '100%' }}
              className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex-1 min-h-[520px] w-full"
            >
              <iframe
                ref={iframeRef}
                title="Shared Website Preview"
                srcDoc={srcDocHtml}
                sandbox="allow-same-origin allow-scripts"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          ) : (
            <div className="m-auto bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md space-y-2">
              <Globe className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900">Snapshot Preview Pending</p>
              <p className="text-xs text-slate-500">
                Open the project in the editor once to capture the rendered DOM snapshot, or inspect the proposed changes list on the right.
              </p>
            </div>
          )}
        </main>

        {/* Developer Change Diff Panel */}
        <aside className="w-80 lg:w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
              <FileDiff className="w-4 h-4 text-blue-600" />
              <span>Proposed Modifications ({data.changes.length})</span>
            </div>
            <span className="text-[11px] text-slate-400">Click to locate</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {data.changes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                No changes have been proposed yet.
              </p>
            ) : (
              data.changes.map((chg, idx) => (
                <div
                  key={chg._id || idx}
                  onClick={() => {
                    if (chg.pageUrl && chg.pageUrl !== activePage?.originalUrl) {
                      setActivePageUrl(chg.pageUrl);
                    }
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: 'REVISEX_SELECT_ELEMENT', elementId: chg.elementId },
                      '*'
                    );
                  }}
                  className="p-3 rounded-xl border border-slate-200 hover:border-blue-400 cursor-pointer transition space-y-2 bg-slate-50/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold uppercase text-[10px]">
                        {chg.type}
                      </span>
                      <span className="font-mono text-[11px] text-slate-600">
                        &lt;{chg.elementFingerprint?.tagName || 'element'}&gt;
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">#{idx + 1}</span>
                  </div>

                  <div className="text-[10px] text-slate-400 truncate font-mono">{chg.pageUrl}</div>

                  {chg.type === 'image' ? (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-1.5 rounded bg-red-50/60 border border-red-200/70">
                        <span className="block text-[9px] font-semibold text-red-700 mb-1">ORIGINAL</span>
                        {chg.originalValue?.src ? (
                          <img
                            src={chg.originalValue.src}
                            alt="Original"
                            className="h-14 w-full object-contain rounded"
                          />
                        ) : (
                          <span className="text-[10px] text-slate-400">—</span>
                        )}
                      </div>
                      <div className="p-1.5 rounded bg-emerald-50/60 border border-emerald-200/70">
                        <span className="block text-[9px] font-semibold text-emerald-700 mb-1">PROPOSED</span>
                        {chg.proposedValue?.src && (
                          <img
                            src={chg.proposedValue.src}
                            alt="Proposed"
                            className="h-14 w-full object-contain rounded"
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs">
                      <div className="p-2 rounded-lg bg-red-50/60 border border-red-100 text-red-900">
                        <span className="block text-[9px] font-semibold uppercase text-red-600 mb-0.5">
                          Original
                        </span>
                        <span className="break-words">{formatChangeVal(chg.originalValue)}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 text-emerald-950 font-medium">
                        <span className="block text-[9px] font-semibold uppercase text-emerald-700 mb-0.5">
                          Proposed
                        </span>
                        <span className="break-words">{formatChangeVal(chg.proposedValue)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
