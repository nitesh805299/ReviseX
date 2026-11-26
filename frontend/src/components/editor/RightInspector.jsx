import React, { useEffect, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layout,
  Loader2,
  MousePointer,
  Palette,
  Type,
  Upload,
} from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

function rgbToHex(val) {
  if (!val) return '#0f172a';
  if (val.startsWith('#')) return val.slice(0, 7);
  const m = val.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#0f172a';
  const toHex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

export function RightInspector({ onSelectElementById }) {
  const { selectedElement, applyChange, uploadAsset } = useEditorStore();

  const [textDraft, setTextDraft] = useState('');
  const [imgUrlDraft, setImgUrlDraft] = useState('');
  const [imgAltDraft, setImgAltDraft] = useState('');
  const [uploadingImg, setUploadingImg] = useState(false);

  useEffect(() => {
    if (!selectedElement) return;
    setTextDraft(selectedElement.text || '');
    setImgUrlDraft(selectedElement.src || '');
    setImgAltDraft(selectedElement.alt || '');
  }, [selectedElement?.elementId, selectedElement?.text, selectedElement?.src, selectedElement?.alt]);

  if (!selectedElement) {
    return (
      <div className="p-6 text-center flex flex-col items-center justify-center h-full text-slate-400">
        <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
          <MousePointer className="w-5 h-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">No Element Selected</p>
        <p className="text-xs text-slate-500 mt-1 max-w-[210px]">
          Click any heading, paragraph, button, image, or section on the website canvas to edit it visually.
        </p>
      </div>
    );
  }

  const styles = selectedElement.styles || {};

  function updateStyle(prop, value, type = 'style', label = `Update ${prop}`) {
    applyChange({
      elementId: selectedElement.elementId,
      elementFingerprint: selectedElement.fingerprint,
      type,
      originalValue: { [prop]: styles[prop] || '' },
      proposedValue: { [prop]: value },
      label,
    });
  }

  function handleTextCommit(val) {
    setTextDraft(val);
    applyChange({
      elementId: selectedElement.elementId,
      elementFingerprint: selectedElement.fingerprint,
      type: 'text',
      originalValue: selectedElement.originalText || selectedElement.text,
      proposedValue: val,
      label: `Edit <${selectedElement.tagName}> text`,
    });
  }

  function handleImageApply(newSrc, newAlt) {
    applyChange({
      elementId: selectedElement.elementId,
      elementFingerprint: selectedElement.fingerprint,
      type: 'image',
      originalValue: {
        src: selectedElement.originalSrc || selectedElement.src,
        alt: selectedElement.alt,
      },
      proposedValue: { src: newSrc, alt: newAlt },
      label: 'Replace image',
    });
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const asset = await uploadAsset(file);
      if (asset) {
        setImgUrlDraft(asset.url);
        handleImageApply(asset.url, imgAltDraft || asset.filename);
      }
    } finally {
      setUploadingImg(false);
      e.target.value = '';
    }
  }

  const isHidden = styles.display === 'none' || styles.visibility === 'hidden';

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full">
      {/* Element header + nested ancestor breadcrumb */}
      <div className="pb-3 border-b border-slate-100 space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[11px]">
              &lt;{selectedElement.tagName}&gt;
            </span>
            <span className="text-[11px] text-slate-400 font-normal capitalize">
              {selectedElement.editableType}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                applyChange({
                  elementId: selectedElement.elementId,
                  elementFingerprint: selectedElement.fingerprint,
                  type: 'move',
                  originalValue: { direction: 'neutral' },
                  proposedValue: { direction: 'up' },
                  label: 'Move element up',
                })
              }
              title="Move element before previous sibling"
              className="p-1 rounded hover:bg-slate-100 text-slate-500"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                applyChange({
                  elementId: selectedElement.elementId,
                  elementFingerprint: selectedElement.fingerprint,
                  type: 'move',
                  originalValue: { direction: 'neutral' },
                  proposedValue: { direction: 'down' },
                  label: 'Move element down',
                })
              }
              title="Move element after next sibling"
              className="p-1 rounded hover:bg-slate-100 text-slate-500"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() =>
                updateStyle(
                  'display',
                  isHidden ? 'block' : 'none',
                  'visibility',
                  isHidden ? 'Show element' : 'Hide element'
                )
              }
              title={isHidden ? 'Show element' : 'Hide element'}
              className={`p-1 rounded ${
                isHidden ? 'bg-amber-50 text-amber-600' : 'hover:bg-slate-100 text-slate-500'
              }`}
            >
              {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {selectedElement.ancestors?.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
            {selectedElement.ancestors.map((anc) => (
              <button
                key={anc.elementId}
                onClick={() => onSelectElementById(anc.elementId)}
                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-mono"
              >
                {anc.tagName}
              </button>
            ))}
            <span>›</span>
            <span className="font-mono text-blue-600 font-semibold">{selectedElement.tagName}</span>
          </div>
        )}
      </div>

      {/* TEXT CONTENT */}
      {selectedElement.editableType === 'text' && (
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <Type className="w-3.5 h-3.5 text-blue-600" />
            <span>Text Content</span>
          </div>
          <textarea
            rows={3}
            value={textDraft}
            onChange={(e) => handleTextCommit(e.target.value)}
            placeholder="Enter proposed text..."
            className="w-full px-3 py-2 text-xs text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
          />
        </section>
      )}

      {/* IMAGE REPLACEMENT */}
      {selectedElement.editableType === 'image' && (
        <section className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>Image Replacement</span>
          </div>
          {imgUrlDraft && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 flex items-center justify-center">
              <img src={imgUrlDraft} alt={imgAltDraft} className="max-h-28 rounded object-contain" />
            </div>
          )}
          <label className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 cursor-pointer text-xs font-medium text-slate-700">
            {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{uploadingImg ? 'Uploading...' : 'Upload Replacement Image'}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleImageUpload}
              className="hidden"
            />
          </label>
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-500">Or Image URL</label>
            <div className="flex gap-1.5">
              <input
                type="url"
                value={imgUrlDraft}
                onChange={(e) => setImgUrlDraft(e.target.value)}
                placeholder="https://..."
                className="flex-1 min-w-0 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => handleImageApply(imgUrlDraft, imgAltDraft)}
                className="px-2.5 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-slate-500">Alt Text</label>
            <input
              type="text"
              value={imgAltDraft}
              onChange={(e) => {
                setImgAltDraft(e.target.value);
                handleImageApply(imgUrlDraft, e.target.value);
              }}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>
        </section>
      )}

      {/* COLORS */}
      <section className="space-y-2.5 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Palette className="w-3.5 h-3.5 text-blue-600" />
          <span>Colors</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Text', prop: 'color' },
            { label: 'Background', prop: 'backgroundColor' },
            { label: 'Border', prop: 'borderColor' },
          ].map((item) => {
            const hex = rgbToHex(styles[item.prop]);
            return (
              <label key={item.prop} className="space-y-1 cursor-pointer">
                <span className="block text-[10px] text-slate-500">{item.label}</span>
                <div className="flex items-center gap-1.5 px-2 py-1 border border-slate-200 rounded-lg bg-white">
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) =>
                      updateStyle(item.prop, e.target.value, 'style', `Change ${item.label.toLowerCase()} color`)
                    }
                    className="w-4 h-4 rounded border-0 p-0 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-mono text-slate-600 truncate">{hex}</span>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* TYPOGRAPHY */}
      <section className="space-y-2.5 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Type className="w-3.5 h-3.5 text-blue-600" />
          <span>Typography</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Font Size</label>
            <input
              type="text"
              defaultValue={styles.fontSize || '16px'}
              onBlur={(e) => updateStyle('fontSize', e.target.value, 'style', 'Change font size')}
              onKeyDown={(e) => e.key === 'Enter' && updateStyle('fontSize', e.currentTarget.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Weight</label>
            <select
              value={styles.fontWeight || '400'}
              onChange={(e) => updateStyle('fontWeight', e.target.value, 'style', 'Change font weight')}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="300">Light (300)</option>
              <option value="400">Regular (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semibold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra Bold (800)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Font Family</label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) updateStyle('fontFamily', e.target.value, 'style', 'Change font family');
            }}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
          >
            <option value="">Current ({(styles.fontFamily || 'inherit').split(',')[0]})</option>
            <option value="Inter, system-ui, sans-serif">Inter / System Sans</option>
            <option value="Georgia, serif">Georgia Serif</option>
            <option value="'Playfair Display', Georgia, serif">Editorial Serif</option>
            <option value="'JetBrains Mono', monospace">Monospace</option>
            <option value="Arial, Helvetica, sans-serif">Arial / Helvetica</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Line Height</label>
            <input
              type="text"
              defaultValue={styles.lineHeight || '1.5'}
              onBlur={(e) => updateStyle('lineHeight', e.target.value, 'style', 'Change line height')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Letter Spacing</label>
            <input
              type="text"
              defaultValue={styles.letterSpacing || '0px'}
              onBlur={(e) => updateStyle('letterSpacing', e.target.value, 'style', 'Change letter spacing')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Text Alignment</label>
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-lg">
            {[
              { val: 'left', icon: AlignLeft },
              { val: 'center', icon: AlignCenter },
              { val: 'right', icon: AlignRight },
              { val: 'justify', icon: AlignJustify },
            ].map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.val}
                  type="button"
                  onClick={() => updateStyle('textAlign', a.val, 'style', `Align text ${a.val}`)}
                  className={`py-1 flex items-center justify-center rounded-md ${
                    styles.textAlign === a.val ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* LAYOUT & SPACING */}
      <section className="space-y-2.5 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Layout className="w-3.5 h-3.5 text-blue-600" />
          <span>Layout &amp; Spacing</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Width</label>
            <input
              type="text"
              defaultValue={styles.width || 'auto'}
              onBlur={(e) => updateStyle('width', e.target.value, 'layout', 'Change width')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Height</label>
            <input
              type="text"
              defaultValue={styles.height || 'auto'}
              onBlur={(e) => updateStyle('height', e.target.value, 'layout', 'Change height')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Border Radius</label>
            <input
              type="text"
              defaultValue={styles.borderRadius || '0px'}
              onBlur={(e) => updateStyle('borderRadius', e.target.value, 'layout', 'Change border radius')}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[10px] text-slate-500 mb-1">Display</label>
            <select
              value={styles.display || 'block'}
              onChange={(e) => updateStyle('display', e.target.value, 'layout', 'Change display layout')}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg bg-white"
            >
              <option value="block">Block</option>
              <option value="inline-block">Inline Block</option>
              <option value="flex">Flex</option>
              <option value="grid">Grid</option>
              <option value="none">Hidden (none)</option>
            </select>
          </div>
        </div>

        {(styles.display === 'flex' || styles.display === 'inline-flex') && (
          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Justify</label>
              <select
                value={styles.justifyContent || 'flex-start'}
                onChange={(e) => updateStyle('justifyContent', e.target.value, 'layout', 'Flex justify')}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white"
              >
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
                <option value="space-between">Space Between</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Align Items</label>
              <select
                value={styles.alignItems || 'stretch'}
                onChange={(e) => updateStyle('alignItems', e.target.value, 'layout', 'Flex align')}
                className="w-full px-1.5 py-1 text-[11px] border border-slate-200 rounded bg-white"
              >
                <option value="stretch">Stretch</option>
                <option value="flex-start">Start</option>
                <option value="center">Center</option>
                <option value="flex-end">End</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Padding (Top / Right / Bottom / Left)</label>
          <div className="grid grid-cols-4 gap-1.5">
            {['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].map((p, idx) => (
              <input
                key={p}
                type="text"
                title={p}
                placeholder={['T', 'R', 'B', 'L'][idx]}
                defaultValue={styles[p] || '0px'}
                onBlur={(e) => updateStyle(p, e.target.value, 'layout', 'Update padding')}
                className="px-1.5 py-1 text-[11px] text-center border border-slate-200 rounded"
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] text-slate-500 mb-1">Margin (Top / Right / Bottom / Left)</label>
          <div className="grid grid-cols-4 gap-1.5">
            {['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].map((m, idx) => (
              <input
                key={m}
                type="text"
                title={m}
                placeholder={['T', 'R', 'B', 'L'][idx]}
                defaultValue={styles[m] || '0px'}
                onBlur={(e) => updateStyle(m, e.target.value, 'layout', 'Update margin')}
                className="px-1.5 py-1 text-[11px] text-center border border-slate-200 rounded"
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
