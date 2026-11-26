import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { History, PanelLeft, PanelRight, SlidersHorizontal } from 'lucide-react';
import { TopToolbar } from '../components/editor/TopToolbar';
import { LeftSidebar } from '../components/editor/LeftSidebar';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { RightInspector } from '../components/editor/RightInspector';
import { ChangeHistoryPanel } from '../components/editor/ChangeHistoryPanel';
import { ShareModal } from '../components/editor/ShareModal';
import { useEditorStore } from '../store/editorStore';
import { connectSocket } from '../lib/socket';

export function EditorPage() {
  const { projectId } = useParams();
  const iframeRef = useRef(null);

  const {
    project,
    session,
    viewMode,
    rightTab,
    patches,
    setRightTab,
    setStreamFrame,
    loadProjectAndStartSession,
    closeSession,
    resetEditor,
    undo,
    redo,
  } = useEditorStore();

  const [shareOpen, setShareOpen] = useState(false);
  const [showLeftMobile, setShowLeftMobile] = useState(false);
  const [showRightMobile, setShowRightMobile] = useState(false);

  useEffect(() => {
    loadProjectAndStartSession(projectId);
    const socket = connectSocket();
    socket?.emit('join-project', { projectId });

    return () => {
      socket?.emit('leave-project', { projectId });
      closeSession();
      resetEditor();
    };
  }, [projectId]);

  // Live Socket.IO stream frames when user switches to Live Stream mode
  useEffect(() => {
    const socket = connectSocket();
    if (!socket || !session?._id) return;

    function onFrame(data) {
      if (data?.frame) setStreamFrame(data.frame);
    }

    socket.on('stream-frame', onFrame);
    if (viewMode === 'stream') {
      socket.emit('stream-start', { sessionId: session.workerSessionId || session._id });
    }

    return () => {
      socket.off('stream-frame', onFrame);
      socket.emit('stream-stop', { sessionId: session.workerSessionId || session._id });
    };
  }, [viewMode, session?._id]);

  // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  function handleSelectElementById(elementId) {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'REVISEX_SELECT_ELEMENT', elementId },
      '*'
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 overflow-hidden">
      <TopToolbar onOpenShare={() => setShareOpen(true)} />

      {/* Mobile Drawer Bar */}
      <div className="lg:hidden flex items-center justify-between px-3 py-1.5 bg-white border-b border-slate-200 text-xs">
        <button
          onClick={() => setShowLeftMobile(!showLeftMobile)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-slate-700"
        >
          <PanelLeft className="w-3.5 h-3.5" />
          Pages &amp; Layers
        </button>
        <button
          onClick={() => setShowRightMobile(!showRightMobile)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 text-slate-700"
        >
          <PanelRight className="w-3.5 h-3.5" />
          Inspector ({patches.length})
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar */}
        <div
          className={`${
            showLeftMobile ? 'fixed inset-y-14 left-0 z-30 shadow-xl' : 'hidden'
          } lg:static lg:block h-full`}
        >
          <LeftSidebar onSelectElementById={handleSelectElementById} />
        </div>

        {/* Center Canvas */}
        <PreviewCanvas
          iframeRef={iframeRef}
          onOpenInspectorTab={() => setRightTab('inspector')}
        />

        {/* Right Panel: Inspector + Change History */}
        <aside
          className={`${
            showRightMobile ? 'fixed inset-y-14 right-0 z-30 shadow-xl' : 'hidden'
          } lg:static lg:flex w-80 bg-white border-l border-slate-200 flex-col shrink-0 h-full overflow-hidden`}
        >
          <div className="grid grid-cols-2 border-b border-slate-200 bg-slate-50/70 p-1 gap-1 shrink-0">
            <button
              onClick={() => setRightTab('inspector')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition ${
                rightTab === 'inspector'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Design &amp; Content
            </button>
            <button
              onClick={() => setRightTab('history')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition ${
                rightTab === 'history'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Changes ({patches.length})
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === 'inspector' ? (
              <RightInspector onSelectElementById={handleSelectElementById} />
            ) : (
              <ChangeHistoryPanel onSelectElementById={handleSelectElementById} />
            )}
          </div>
        </aside>
      </div>

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} project={project} />
    </div>
  );
}
