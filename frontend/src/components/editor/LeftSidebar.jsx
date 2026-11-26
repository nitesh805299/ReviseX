import React, { useState } from 'react';
import {
  ChevronRight,
  FileText,
  Globe,
  Image as ImageIcon,
  Layers,
  Loader2,
  Upload,
} from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

function LayerTreeNode({ node, selectedId, onSelect, depth = 0 }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        onClick={() => onSelect(node.id)}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={`flex items-center gap-1.5 py-1 pr-2 rounded-md text-xs cursor-pointer transition ${
          isSelected
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 hover:bg-slate-200 rounded"
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="truncate">{node.label || node.tagName}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <LayerTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LeftSidebar({ onSelectElementById }) {
  const {
    pages,
    navLinks,
    layers,
    assets,
    activePageUrl,
    selectedElement,
    navigateToUrl,
    uploadAsset,
    applyChange,
  } = useEditorStore();

  const [tab, setTab] = useState('pages');
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleNavigateSubmit(e) {
    e.preventDefault();
    if (!urlInput.trim()) return;
    let target = urlInput.trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    await navigateToUrl(target);
    setUrlInput('');
  }

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      await uploadAsset(file);
    } catch (err) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden">
      <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/60 p-1 gap-1">
        {[
          { id: 'pages', label: 'Pages', icon: Globe },
          { id: 'layers', label: 'Layers', icon: Layers },
          { id: 'assets', label: 'Assets', icon: ImageIcon },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center justify-center gap-1 py-1.5 rounded-md text-xs font-medium transition ${
                active
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'pages' && (
          <div className="space-y-4">
            <form onSubmit={handleNavigateSubmit} className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Navigate URL
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="Paste subpage URL..."
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800"
                >
                  Go
                </button>
              </div>
            </form>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Visited Pages ({pages.length})
              </p>
              <div className="space-y-1">
                {pages.map((p) => {
                  const isActive = p.originalUrl === activePageUrl;
                  return (
                    <button
                      key={p._id}
                      onClick={() => navigateToUrl(p.originalUrl)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200/70'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{p.title || 'Untitled Page'}</div>
                        <div className="text-[10px] text-slate-400 truncate">{p.originalUrl}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {navLinks.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Discovered Links
                </p>
                <div className="space-y-1">
                  {navLinks.map((link) => (
                    <button
                      key={link.url}
                      onClick={() => navigateToUrl(link.url)}
                      className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900 text-left"
                    >
                      <span className="truncate">{link.label}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{link.pathname}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'layers' && (
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              DOM Elements
            </p>
            {layers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No DOM layers extracted yet.</p>
            ) : (
              layers.map((node) => (
                <LayerTreeNode
                  key={node.id}
                  node={node}
                  selectedId={selectedElement?.elementId}
                  onSelect={onSelectElementById}
                />
              ))
            )}
          </div>
        )}

        {tab === 'assets' && (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center gap-1.5 p-4 border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl cursor-pointer bg-slate-50/70 transition">
              {uploading ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              ) : (
                <Upload className="w-5 h-5 text-slate-400" />
              )}
              <span className="text-xs font-medium text-slate-700">
                {uploading ? 'Uploading...' : 'Upload Image'}
              </span>
              <span className="text-[10px] text-slate-400">PNG, JPG, WebP, GIF (max 5 MB)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            {uploadError && (
              <div className="p-2 rounded-lg bg-red-50 text-red-700 text-xs">{uploadError}</div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {assets.map((asset) => (
                <div
                  key={asset._id}
                  onClick={() => {
                    if (selectedElement?.editableType === 'image') {
                      applyChange({
                        elementId: selectedElement.elementId,
                        elementFingerprint: selectedElement.fingerprint,
                        type: 'image',
                        originalValue: {
                          src: selectedElement.originalSrc || selectedElement.src,
                          alt: selectedElement.alt,
                        },
                        proposedValue: { src: asset.url, alt: selectedElement.alt || asset.filename },
                        label: 'Replace image from asset library',
                      });
                    }
                  }}
                  title={
                    selectedElement?.editableType === 'image'
                      ? 'Click to apply to selected image'
                      : asset.filename
                  }
                  className="group relative aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-100 cursor-pointer hover:border-blue-500"
                >
                  <img src={asset.url} alt={asset.filename} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            {assets.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-2">No uploaded assets yet.</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
