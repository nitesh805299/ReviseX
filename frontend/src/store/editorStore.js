import { create } from 'zustand';
import { api } from '../lib/api';

let autosaveTimer = null;

function makeClientId() {
  return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const useEditorStore = create((set, get) => ({
  project: null,
  pages: [],
  activePageId: null,
  activePageUrl: '',
  snapshotHtml: '',
  layers: [],
  navLinks: [],
  session: null,
  sessionLoading: false,
  sessionError: null,

  mode: 'edit', // 'edit' | 'preview'
  viewMode: 'dom', // 'dom' | 'stream'
  viewport: 'desktop', // 'desktop' | 'tablet' | 'mobile'
  rightTab: 'inspector', // 'inspector' | 'history'

  selectedElement: null,
  patches: [],
  undoStack: [], // array of { label, timestamp, patches }
  redoStack: [],
  revisions: [],
  assets: [],
  streamFrame: null,

  saveStatus: 'saved', // 'saved' | 'saving' | 'unsaved' | 'error'
  lastSavedAt: null,

  resetEditor: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    set({
      project: null,
      pages: [],
      activePageId: null,
      activePageUrl: '',
      snapshotHtml: '',
      layers: [],
      navLinks: [],
      session: null,
      sessionLoading: false,
      sessionError: null,
      selectedElement: null,
      patches: [],
      undoStack: [],
      redoStack: [],
      revisions: [],
      assets: [],
      streamFrame: null,
      saveStatus: 'saved',
    });
  },

  loadProjectAndStartSession: async (projectId) => {
    set({ sessionLoading: true, sessionError: null });
    try {
      const [{ data: projData }, { data: assetData }] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/assets`),
      ]);

      const project = projData.project;
      const pages = projData.pages || [];
      const changes = (projData.changes || []).map((c) => ({
        ...c,
        clientId: c.clientId || c._id || makeClientId(),
      }));
      const revisions = projData.revisions || [];

      const firstPage = pages[0] || null;
      set({
        project,
        pages,
        patches: changes,
        revisions,
        assets: assetData.assets || [],
        activePageId: firstPage?._id || null,
        activePageUrl: firstPage?.originalUrl || project.originalUrl,
        snapshotHtml: firstPage?.snapshotHtml || '',
        layers: firstPage?.layers || [],
        navLinks: firstPage?.navLinks || [],
        undoStack: [],
        redoStack: [],
        saveStatus: 'saved',
      });

      // Start isolated Playwright browser session
      const { data: sessData } = await api.post('/browser/sessions', {
        projectId,
        url: project.originalUrl,
        viewport: get().viewport,
      });

      set({
        session: sessData.session,
        activePageId: sessData.page?._id || firstPage?._id,
        activePageUrl: sessData.page?.originalUrl || project.originalUrl,
        snapshotHtml: sessData.snapshotHtml || '',
        layers: sessData.layers || [],
        navLinks: sessData.navLinks || [],
        streamFrame: sessData.thumbnail || null,
        sessionLoading: false,
      });

      // Refresh pages list
      const { data: refreshed } = await api.get(`/projects/${projectId}`);
      set({
        pages: refreshed.pages || [],
        project: refreshed.project,
      });
    } catch (err) {
      const message =
        err.response?.data?.error || err.message || 'Unable to load website inside isolated browser.';
      set({ sessionLoading: false, sessionError: message });
    }
  },

  navigateToUrl: async (targetUrl) => {
    const { session, project } = get();
    if (!session) return;
    set({ sessionLoading: true, sessionError: null, selectedElement: null });
    try {
      const { data } = await api.post(`/browser/sessions/${session._id}/navigate`, {
        url: targetUrl,
      });
      set({
        session: data.session,
        activePageId: data.page?._id,
        activePageUrl: data.page?.originalUrl || targetUrl,
        snapshotHtml: data.snapshotHtml,
        layers: data.layers || [],
        navLinks: data.navLinks || [],
        streamFrame: data.thumbnail || null,
        sessionLoading: false,
      });
      if (project) {
        const { data: refreshed } = await api.get(`/projects/${project._id}`);
        set({ pages: refreshed.pages || [] });
      }
    } catch (err) {
      set({
        sessionLoading: false,
        sessionError: err.response?.data?.error || 'Navigation failed in isolated browser.',
      });
    }
  },

  setViewport: async (viewport) => {
    set({ viewport });
    const { session } = get();
    if (session) {
      try {
        const { data } = await api.post(`/browser/sessions/${session._id}/viewport`, { viewport });
        if (data.frame) set({ streamFrame: data.frame });
      } catch {
        // Non-fatal if session already expired
      }
    }
  },

  setMode: (mode) => set({ mode }),
  setViewMode: (viewMode) => set({ viewMode }),
  setRightTab: (rightTab) => set({ rightTab }),
  setSelectedElement: (selectedElement) => set({ selectedElement }),
  setStreamFrame: (streamFrame) => set({ streamFrame }),

  updateProjectName: async (name) => {
    const { project } = get();
    if (!project) return;
    const { data } = await api.patch(`/projects/${project._id}`, { name });
    set({ project: data.project });
  },

  applyChange: ({ elementId, elementFingerprint, type, originalValue, proposedValue, label }) => {
    const { patches, undoStack, activePageId, activePageUrl } = get();
    const prevSnapshot = patches.map((p) => ({ ...p }));
    const nextUndo = [
      ...undoStack.slice(-49),
      {
        label: label || `Edit ${type}`,
        timestamp: new Date().toISOString(),
        patches: prevSnapshot,
      },
    ];

    // Coalesce repeated style/layout/text edits on the same element + type for clean history,
    // except 'move' which is sequential
    let nextPatches;
    const existingIdx =
      type !== 'move'
        ? patches.findIndex(
            (p) => p.elementId === elementId && p.pageUrl === activePageUrl && p.type === type
          )
        : -1;

    if (existingIdx >= 0) {
      const existing = patches[existingIdx];
      const mergedProposed =
        type === 'style' || type === 'layout' || type === 'visibility'
          ? { ...(existing.proposedValue || {}), ...(proposedValue || {}) }
          : proposedValue;

      const updated = {
        ...existing,
        proposedValue: mergedProposed,
        updatedAt: new Date().toISOString(),
      };
      nextPatches = [...patches];
      nextPatches[existingIdx] = updated;
    } else {
      nextPatches = [
        ...patches,
        {
          clientId: makeClientId(),
          pageId: activePageId,
          pageUrl: activePageUrl,
          elementId,
          elementFingerprint,
          type,
          originalValue,
          proposedValue,
          createdAt: new Date().toISOString(),
        },
      ];
    }

    set({
      patches: nextPatches,
      undoStack: nextUndo,
      redoStack: [],
      saveStatus: 'unsaved',
    });

    get().scheduleAutosave();
  },

  removePatch: (clientIdOrId) => {
    const { patches, undoStack } = get();
    const nextUndo = [
      ...undoStack.slice(-49),
      {
        label: 'Remove change',
        timestamp: new Date().toISOString(),
        patches: patches.map((p) => ({ ...p })),
      },
    ];
    const nextPatches = patches.filter((p) => (p.clientId || p._id) !== clientIdOrId);
    set({ patches: nextPatches, undoStack: nextUndo, redoStack: [], saveStatus: 'unsaved' });
    get().scheduleAutosave();
  },

  undo: () => {
    const { undoStack, redoStack, patches } = get();
    if (undoStack.length === 0) return;
    const prevEntry = undoStack[undoStack.length - 1];
    const nextUndo = undoStack.slice(0, -1);
    const nextRedo = [
      ...redoStack,
      {
        label: prevEntry.label,
        timestamp: new Date().toISOString(),
        patches: patches.map((p) => ({ ...p })),
      },
    ];
    set({
      patches: prevEntry.patches,
      undoStack: nextUndo,
      redoStack: nextRedo,
      saveStatus: 'unsaved',
    });
    get().scheduleAutosave();
  },

  redo: () => {
    const { undoStack, redoStack, patches } = get();
    if (redoStack.length === 0) return;
    const nextEntry = redoStack[redoStack.length - 1];
    const nextRedo = redoStack.slice(0, -1);
    const nextUndo = [
      ...undoStack,
      {
        label: nextEntry.label,
        timestamp: new Date().toISOString(),
        patches: patches.map((p) => ({ ...p })),
      },
    ];
    set({
      patches: nextEntry.patches,
      undoStack: nextUndo,
      redoStack: nextRedo,
      saveStatus: 'unsaved',
    });
    get().scheduleAutosave();
  },

  scheduleAutosave: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      get().savePatchesNow();
    }, 850);
  },

  savePatchesNow: async () => {
    const { project, patches, session } = get();
    if (!project) return;
    if (autosaveTimer) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
    }

    set({ saveStatus: 'saving' });
    try {
      const payload = patches.map((p) => ({
        pageId: p.pageId || null,
        pageUrl: p.pageUrl,
        clientId: p.clientId || makeClientId(),
        elementId: p.elementId,
        elementFingerprint: p.elementFingerprint,
        type: p.type,
        originalValue: p.originalValue,
        proposedValue: p.proposedValue,
      }));

      const { data } = await api.post(`/projects/${project._id}/changes`, {
        replaceAll: true,
        changes: payload,
      });

      set({
        patches: (data.changes || []).map((c) => ({ ...c, clientId: c.clientId || c._id })),
        saveStatus: 'saved',
        lastSavedAt: new Date().toISOString(),
        project: { ...project, changesCount: data.changesCount },
      });

      // Replay on isolated Playwright worker to keep thumbnail & unresolved state synced
      if (session) {
        api
          .post(`/browser/sessions/${session._id}/replay`)
          .then(({ data: replayData }) => {
            if (replayData.frame) set({ streamFrame: replayData.frame });
          })
          .catch(() => {});
      }
    } catch {
      set({ saveStatus: 'error' });
    }
  },

  createRevision: async (label) => {
    const { project } = get();
    if (!project) return null;
    await get().savePatchesNow();
    const { data } = await api.post(`/projects/${project._id}/revisions`, { label });
    set((state) => ({ revisions: [data.revision, ...state.revisions] }));
    return data.revision;
  },

  restoreRevision: async (revisionId) => {
    const { project, patches, undoStack } = get();
    if (!project) return;
    const { data } = await api.post(`/projects/${project._id}/revisions/${revisionId}/restore`);
    set({
      undoStack: [
        ...undoStack.slice(-49),
        {
          label: 'Before revision restore',
          timestamp: new Date().toISOString(),
          patches: patches.map((p) => ({ ...p })),
        },
      ],
      redoStack: [],
      patches: (data.changes || []).map((c) => ({ ...c, clientId: c.clientId || c._id })),
      saveStatus: 'saved',
    });
  },

  uploadAsset: async (file) => {
    const { project } = get();
    if (!project) return null;
    const formData = new FormData();
    formData.append('projectId', project._id);
    formData.append('file', file);
    const { data } = await api.post('/assets/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    set((state) => ({ assets: [data.asset, ...state.assets] }));
    return data.asset;
  },

  closeSession: async () => {
    const { session } = get();
    if (session) {
      await api.delete(`/browser/sessions/${session._id}`).catch(() => {});
      set({ session: null });
    }
  },
}));
