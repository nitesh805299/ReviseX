import React, { useState } from 'react';
import { AlertCircle, BookmarkPlus, History, RotateCcw, Trash2 } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

function formatVal(val) {
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

export function ChangeHistoryPanel({ onSelectElementById }) {
  const { patches, revisions, removePatch, createRevision, restoreRevision } = useEditorStore();
  const [revLabel, setRevLabel] = useState('');
  const [savingRev, setSavingRev] = useState(false);

  async function handleSaveRevision(e) {
    e.preventDefault();
    setSavingRev(true);
    try {
      await createRevision(revLabel.trim() || undefined);
      setRevLabel('');
    } finally {
      setSavingRev(false);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-5">
      {/* Revisions Snapshot */}
      <div className="space-y-2.5 pb-4 border-b border-slate-200">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
          <History className="w-3.5 h-3.5 text-blue-600" />
          <span>Revisions ({revisions.length})</span>
        </div>

        <form onSubmit={handleSaveRevision} className="flex gap-1.5">
          <input
            type="text"
            value={revLabel}
            onChange={(e) => setRevLabel(e.target.value)}
            placeholder="Snapshot label..."
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={savingRev}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
          >
            <BookmarkPlus className="w-3.5 h-3.5" />
            Save
          </button>
        </form>

        {revisions.length > 0 && (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {revisions.map((rev) => (
              <div
                key={rev._id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">
                    #{rev.revisionNumber} · {rev.label || 'Revision'}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {rev.changes?.length || 0} changes · {new Date(rev.createdAt).toLocaleTimeString()}
                  </div>
                </div>
                <button
                  onClick={() => restoreRevision(rev._id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-200 hover:border-blue-400 text-[11px] font-medium text-slate-700"
                  title="Restore this revision"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proposed Changes List */}
      <div className="space-y-2.5 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-900">
            Proposed Changes ({patches.length})
          </span>
        </div>

        {patches.length === 0 ? (
          <p className="text-xs text-slate-400 py-6 text-center">
            No proposed edits yet. Click elements on the canvas to suggest changes.
          </p>
        ) : (
          <div className="space-y-2">
            {patches.map((patch) => {
              const key = patch.clientId || patch._id;
              return (
                <div
                  key={key}
                  onClick={() => onSelectElementById?.(patch.elementId)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    patch.unresolved
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-white border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold uppercase text-[10px]">
                        {patch.type}
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">
                        &lt;{patch.elementFingerprint?.tagName || 'el'}&gt;
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removePatch(key);
                      }}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      title="Revert this change"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {patch.unresolved && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-700 mb-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Unresolved: {patch.unresolvedReason || 'Target DOM changed'}</span>
                    </div>
                  )}

                  <div className="space-y-1 text-[11px]">
                    <div className="text-slate-400 line-through truncate">
                      {formatVal(patch.originalValue)}
                    </div>
                    <div className="text-slate-900 font-medium truncate">
                      → {formatVal(patch.proposedValue)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
