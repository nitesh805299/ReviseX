import React, { useState } from 'react';
import {
  Check,
  Edit3,
  ExternalLink,
  FileDiff,
  Globe,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

const STATUS_BADGES = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_review: 'bg-blue-50 text-blue-700 border-blue-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_LABELS = {
  active: 'Active',
  in_review: 'In Review',
  archived: 'Archived',
};

export function ProjectCard({ project, onOpen, onRename, onDelete }) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  async function saveRename(e) {
    e.stopPropagation();
    if (draftName.trim() && draftName.trim() !== project.name) {
      await onRename(project._id, draftName.trim());
    }
    setEditingName(false);
  }

  return (
    <div className="group bg-white rounded-xl border border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
      <div
        onClick={() => onOpen(project._id)}
        className="h-40 bg-slate-100 border-b border-slate-200/80 relative overflow-hidden cursor-pointer flex items-center justify-center"
      >
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.name}
            className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center text-slate-400 gap-2">
            <Globe className="w-8 h-8 stroke-[1.5]" />
            <span className="text-xs font-medium">Preview ready on open</span>
          </div>
        )}
        <span
          className={`absolute top-2.5 right-2.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
            STATUS_BADGES[project.status] || STATUS_BADGES.active
          }`}
        >
          {STATUS_LABELS[project.status] || 'Active'}
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          {editingName ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename(e);
                  if (e.key === 'Escape') setEditingName(false);
                }}
                autoFocus
                className="flex-1 text-sm font-semibold text-slate-900 px-2 py-1 border border-blue-500 rounded-md focus:outline-none"
              />
              <button
                onClick={saveRename}
                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                title="Save name"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setDraftName(project.name);
                  setEditingName(false);
                }}
                className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <h3
                onClick={() => onOpen(project._id)}
                className="text-sm font-semibold text-slate-900 truncate cursor-pointer hover:text-blue-600"
              >
                {project.name}
              </h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDraftName(project.name);
                  setEditingName(true);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition"
                title="Rename project"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <a
            href={project.originalUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 mt-1 max-w-full truncate"
          >
            <span className="truncate">{project.originalUrl}</span>
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 font-medium text-slate-700">
              <FileDiff className="w-3.5 h-3.5 text-blue-600" />
              {project.changesCount || 0} changes
            </span>
            <span>{new Date(project.updatedAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => onOpen(project._id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs transition"
            >
              <Edit3 className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(project);
              }}
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Delete project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
