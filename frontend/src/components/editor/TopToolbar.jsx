import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Globe,
  Loader2,
  Monitor,
  MousePointerClick,
  Radio,
  Redo2,
  Save,
  Share2,
  Smartphone,
  Sparkles,
  Tablet,
  Undo2,
} from 'lucide-react';
import { Logo } from '../Logo';
import { useEditorStore } from '../../store/editorStore';

export function TopToolbar({ onOpenShare }) {
  const {
    project,
    saveStatus,
    undoStack,
    redoStack,
    viewport,
    mode,
    compareView,
    viewMode,
    activePageUrl,
    undo,
    redo,
    setViewport,
    setMode,
    setCompareView,
    setViewMode,
    savePatchesNow,
    updateProjectName,
    patches,
  } = useEditorStore();

  const pagePatchCount = patches.filter((p) => !p.pageUrl || p.pageUrl === activePageUrl).length;

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  function commitTitle() {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft.trim() !== project?.name) {
      updateProjectName(titleDraft.trim());
    }
  }

  return (
    <header className="h-14 bg-white border-b border-slate-200 px-3 lg:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/dashboard"
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="hidden sm:block">
          <Logo size="sm" />
        </div>
        <div className="h-5 w-px bg-slate-200 hidden sm:block" />

        {editingTitle ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            autoFocus
            className="text-sm font-semibold text-slate-900 px-2 py-1 border border-blue-500 rounded-md focus:outline-none max-w-[200px]"
          />
        ) : (
          <button
            onClick={() => {
              setTitleDraft(project?.name || '');
              setEditingTitle(true);
            }}
            className="text-sm font-semibold text-slate-900 hover:text-blue-600 truncate max-w-[180px] text-left"
            title="Click to rename project"
          >
            {project?.name || 'Loading...'}
          </button>
        )}

        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 ml-1">
          {saveStatus === 'saving' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Saved</span>
            </>
          )}
          {saveStatus === 'unsaved' && (
            <button
              onClick={savePatchesNow}
              className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 font-medium"
            >
              <Save className="w-3.5 h-3.5" />
              Unsaved · Save now
            </button>
          )}
          {saveStatus === 'error' && (
            <button onClick={savePatchesNow} className="text-red-600 font-medium">
              Save failed · Retry
            </button>
          )}
        </div>
      </div>

      {/* Center controls: Undo/Redo + Responsive Viewports */}
      <div className="flex items-center gap-1.5">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/80">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 transition"
            title="Undo"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white disabled:opacity-35 transition"
            title="Redo"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="hidden md:flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/80 ml-1">
          {[
            { id: 'desktop', icon: Monitor, label: 'Desktop (1440px)' },
            { id: 'tablet', icon: Tablet, label: 'Tablet (768px)' },
            { id: 'mobile', icon: Smartphone, label: 'Mobile (390px)' },
          ].map((vp) => {
            const Icon = vp.icon;
            const active = viewport === vp.id;
            return (
              <button
                key={vp.id}
                onClick={() => setViewport(vp.id)}
                title={vp.label}
                className={`p-1.5 rounded-md transition ${
                  active
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Right controls: Original/Edited Compare, Live Stream, Edit/Preview Toggle, Share */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/80"
          role="group"
          aria-label="Compare Original and Edited Website"
        >
          <button
            type="button"
            onClick={() => setCompareView('original')}
            title="View original website before any edits"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              compareView === 'original'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Original</span>
          </button>
          <button
            type="button"
            onClick={() => setCompareView('edited')}
            title="View edited website with your changes applied"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              compareView === 'edited'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Edited</span>
            {pagePatchCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                  compareView === 'edited'
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {pagePatchCount}
              </span>
            )}
          </button>
        </div>

        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'dom' ? 'stream' : 'dom')}
          title="Switch to Live Interactive Browser to log in, click buttons, or fill forms"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition ${
            viewMode === 'stream'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {viewMode === 'stream' ? 'Live Login (On)' : 'Live Login'}
          </span>
        </button>

        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/80">
          <button
            onClick={() => setMode('edit')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              mode === 'edit' && compareView === 'edited'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MousePointerClick className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit Mode</span>
          </button>
          <button
            onClick={() => setMode('preview')}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              mode === 'preview'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
        </div>

        <button
          onClick={async () => {
            if (saveStatus !== 'saved') {
              await savePatchesNow();
            }
            onOpenShare();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
          {patches.length > 0 && (
            <span className="bg-blue-500 text-white px-1.5 py-0.2 rounded-full text-[10px]">
              {patches.length}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
