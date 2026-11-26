import React, { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';

export function ShareModal({ open, onClose, project }) {
  const [shares, setShares] = useState([]);
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && project) {
      loadShares();
    }
  }, [open, project?._id]);

  async function loadShares() {
    try {
      const { data } = await api.get(`/projects/${project._id}/shares`);
      setShares(data.shares || []);
    } catch {
      // ignore
    }
  }

  async function handleGenerate(regenerate = false) {
    setLoading(true);
    try {
      // Unlimited opens, no expiration, no password barrier by default
      const { data } = await api.post(`/projects/${project._id}/shares`, {
        regenerate,
      });
      const fullUrl = `${window.location.origin}/share/${data.token}`;
      setGeneratedUrl(fullUrl);
      await loadShares();
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke(shareId) {
    await api.delete(`/shares/${shareId}`);
    await loadShares();
  }

  function copyLink() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Share Proposed Changes</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Anyone with the link can open the preview unlimited times — read-only, zero setup.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {generatedUrl ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-700">Your Shareable Developer Link</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={generatedUrl}
                  className="flex-1 px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                />
                <button
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-3">
              <Link2 className="w-6 h-6 text-blue-600 mx-auto" />
              <p className="text-xs text-slate-600">
                Generate a direct read-only review link for your developer. No login or open limits required.
              </p>
              <button
                onClick={() => handleGenerate(false)}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Generate Share Link
              </button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-700">
              Active &amp; Past Links ({shares.length})
            </span>
            <button
              onClick={() => handleGenerate(true)}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate Link
            </button>
          </div>

          <div className="space-y-2 max-h-44 overflow-y-auto">
            {shares.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 text-xs"
              >
                <div>
                  <div className="font-medium text-slate-800">
                    {s.revokedAt ? (
                      <span className="text-red-600">Revoked</span>
                    ) : (
                      <span className="text-emerald-600">Active · Unlimited Opens</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Opened {s.accessCount} times · Created {new Date(s.createdAt).toLocaleDateString()}
                  </div>
                </div>
                {!s.revokedAt && (
                  <button
                    onClick={() => handleRevoke(s.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
