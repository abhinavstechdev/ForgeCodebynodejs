import { create } from 'zustand';
import {
  UserSummary,
  ProjectSummary,
  FileTreeItem,
  EditProposal,
  PatchHunk,
  McpTokenInfo,
  GitStatusSummary,
  GitPushOptions,
  GitPushResult,
  ChatMessage,
} from '@shared/types.js';

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  version: number;
  sha256: string;
  isDiff?: boolean;
  proposalId?: string;
}

export type SidebarTab = 'explorer' | 'search' | 'git' | 'ai' | 'mcp' | 'settings';
export type BottomTab = 'terminal' | 'diagnostics' | 'output';

interface AppState {
  // Auth
  user: UserSummary | null;
  token: string | null;
  authModalOpen: boolean;
  setUser: (user: UserSummary | null, token?: string | null) => void;
  setAuthModalOpen: (open: boolean) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;

  // Projects
  projects: ProjectSummary[];
  activeProject: ProjectSummary | null;
  fetchProjects: () => Promise<void>;
  selectProject: (project: ProjectSummary) => Promise<void>;
  createProject: (name: string, template?: string, description?: string) => Promise<ProjectSummary>;
  deleteProject: (id: string) => Promise<void>;

  // Files & Tabs
  fileTree: FileTreeItem[];
  flatFiles: Array<{ id: string; path: string; isFolder: boolean }>;
  tabs: EditorTab[];
  activeTabPath: string | null;
  fetchFileTree: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  saveActiveFile: () => Promise<boolean>;
  saveFile: (path: string) => Promise<boolean>;
  createFile: (path: string, isFolder?: boolean, content?: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;

  // Patch & Diff Engine
  proposals: EditProposal[];
  activeProposal: EditProposal | null;
  fetchProposals: () => Promise<void>;
  openDiffForProposal: (proposalId: string) => Promise<void>;
  updateHunkStatus: (hunkId: string, status: 'accepted' | 'rejected' | 'pending') => Promise<void>;
  applyProposal: (proposalId: string) => Promise<boolean>;
  undoFile: (path: string) => Promise<boolean>;

  // AI Assistant
  messages: ChatMessage[];
  conversationId: string | null;
  isAiGenerating: boolean;
  sendAiMessage: (prompt: string) => Promise<void>;
  selectedAIProvider: string;
  selectedAIModel: string;
  setSelectedAIProvider: (provider: string) => void;
  setSelectedAIModel: (model: string) => void;

  // Git
  gitStatus: GitStatusSummary | null;
  gitRemotes: Array<{ name: string; url: string }>;
  fetchGitStatus: () => Promise<void>;
  fetchGitRemotes: () => Promise<void>;
  setGitRemote: (url: string, name?: string) => Promise<boolean>;
  stageFile: (path?: string, all?: boolean) => Promise<void>;
  unstageFile: (path: string) => Promise<void>;
  commitGit: (message: string) => Promise<boolean>;
  pushGit: (options?: { remoteUrl?: string; token?: string; branch?: string; commitMessage?: string; force?: boolean }) => Promise<{ success: boolean; message?: string }>;

  // MCP Tokens
  mcpTokens: McpTokenInfo[];
  fetchMcpTokens: () => Promise<void>;
  createMcpToken: (name: string, scopes?: string[]) => Promise<any>;
  revokeMcpToken: (id: string) => Promise<void>;

  // UI Layout
  activeSidebar: SidebarTab;
  sidebarOpen: boolean;
  setActiveSidebar: (tab: SidebarTab) => void;
  toggleSidebar: () => void;
  activeBottomTab: BottomTab;
  bottomPanelOpen: boolean;
  setActiveBottomTab: (tab: BottomTab) => void;
  toggleBottomPanel: () => void;
  quickOpenVisible: boolean;
  setQuickOpenVisible: (open: boolean) => void;
  commandPaletteVisible: boolean;
  setCommandPaletteVisible: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth State
  user: null,
  token: localStorage.getItem('forgecode_jwt') || null,
  authModalOpen: false,
  setUser: (user, token) => {
    if (token) localStorage.setItem('forgecode_jwt', token);
    else if (token === null) localStorage.removeItem('forgecode_jwt');
    set({ user, token: token !== undefined ? token : get().token });
  },
  setAuthModalOpen: (open) => set({ authModalOpen: open }),
  logout: async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('forgecode_jwt');
    set({ user: null, token: null, projects: [], activeProject: null, tabs: [], activeTabPath: null, authModalOpen: true });
  },
  checkAuth: async () => {
    try {
      const headers: Record<string, string> = {};
      const t = get().token;
      if (t) headers['Authorization'] = `Bearer ${t}`;

      const res = await fetch('/api/auth/me', { headers });
      if (res.ok) {
        const data = await res.json();
        set({ user: data.user });
        await get().fetchProjects();
      } else {
        set({ authModalOpen: true });
      }
    } catch {
      set({ authModalOpen: true });
    }
  },

  // Projects State
  projects: [],
  activeProject: null,
  fetchProjects: async () => {
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch('/api/projects', { headers });
    if (res.ok) {
      const data = await res.json();
      set({ projects: data.projects });
      if (!get().activeProject && data.projects.length > 0) {
        await get().selectProject(data.projects[0]);
      }
    }
  },
  selectProject: async (project) => {
    set({ activeProject: project, tabs: [], activeTabPath: null, messages: [], activeProposal: null });
    await get().fetchFileTree();
    await get().fetchGitStatus();
    await get().fetchProposals();
  },
  createProject: async (name, template = 'express', description) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, template, description }),
    });
    if (!res.ok) throw new Error('Failed to create project');
    const data = await res.json();
    await get().fetchProjects();
    await get().selectProject(data.project);
    return data.project;
  },
  deleteProject: async (id) => {
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    await fetch(`/api/projects/${id}`, { method: 'DELETE', headers });
    await get().fetchProjects();
  },

  // Files & Tabs State
  fileTree: [],
  flatFiles: [],
  tabs: [],
  activeTabPath: null,
  fetchFileTree: async () => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/tree`, { headers });
    if (res.ok) {
      const data = await res.json();
      set({ fileTree: data.files, flatFiles: data.flatList || [] });
      
      // Auto open first file if no tab is currently open
      if (get().tabs.length === 0 && data.flatList && data.flatList.length > 0) {
        const firstFile = data.flatList.find((f: any) => !f.isFolder);
        if (firstFile) {
          await get().openFile(firstFile.path);
        }
      }
    }
  },
  openFile: async (path) => {
    const project = get().activeProject;
    if (!project) return;

    // Check if already open
    const existing = get().tabs.find(t => t.path === path && !t.isDiff);
    if (existing) {
      set({ activeTabPath: path });
      return;
    }

    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/files/${encodeURIComponent(path)}`, { headers });
    if (!res.ok) return;

    const data = await res.json();
    const newTab: EditorTab = {
      path: data.path,
      name: data.path.split('/').pop() || data.path,
      content: data.content,
      originalContent: data.content,
      dirty: false,
      version: data.version,
      sha256: data.sha256,
      isDiff: false,
    };

    set({
      tabs: [...get().tabs, newTab],
      activeTabPath: path,
    });
  },
  closeTab: (path) => {
    const currentTabs = get().tabs;
    const newTabs = currentTabs.filter(t => t.path !== path);
    let newActivePath = get().activeTabPath;

    if (newActivePath === path) {
      newActivePath = newTabs.length > 0 ? newTabs[newTabs.length - 1].path : null;
    }

    set({ tabs: newTabs, activeTabPath: newActivePath });
  },
  updateTabContent: (path, content) => {
    const tabs = get().tabs.map(tab => {
      if (tab.path === path) {
        return {
          ...tab,
          content,
          dirty: content !== tab.originalContent,
        };
      }
      return tab;
    });
    set({ tabs });
  },
  saveActiveFile: async () => {
    const activePath = get().activeTabPath;
    if (!activePath) return false;
    return await get().saveFile(activePath);
  },
  saveFile: async (path) => {
    const project = get().activeProject;
    const tab = get().tabs.find(t => t.path === path);
    if (!project || !tab) return false;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/files/${encodeURIComponent(path)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        content: tab.content,
        expectedVersion: tab.version,
        baseSha256: tab.sha256,
      }),
    });

    if (res.status === 409) {
      const conflict = await res.json();
      alert(`Conflict Detected!\n${conflict.error}\n\nAnother change has been applied remotely. Please review diff.`);
      return false;
    }

    if (!res.ok) return false;

    const data = await res.json();
    const updatedTabs = get().tabs.map(t => {
      if (t.path === path) {
        return {
          ...t,
          originalContent: t.content,
          dirty: false,
          version: data.newVersion,
          sha256: data.newSha256,
        };
      }
      return t;
    });

    set({ tabs: updatedTabs });
    await get().fetchFileTree();
    await get().fetchGitStatus();
    return true;
  },
  createFile: async (path, isFolder = false, content = '') => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path, isFolder, content }),
    });

    if (res.ok) {
      await get().fetchFileTree();
      if (!isFolder) {
        await get().openFile(path);
      }
    }
  },
  deleteFile: async (path) => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ path }),
    });

    if (res.ok) {
      get().closeTab(path);
      await get().fetchFileTree();
    }
  },

  // Patch & Diff Engine State
  proposals: [],
  activeProposal: null,
  fetchProposals: async () => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/proposals`, { headers });
    if (res.ok) {
      const data = await res.json();
      set({ proposals: data.proposals });
    }
  },
  openDiffForProposal: async (proposalId) => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/proposals/${proposalId}`, { headers });
    if (!res.ok) return;

    const { proposal, originalContent } = await res.json();
    set({ activeProposal: proposal });

    // Open diff tab
    const diffTabPath = `[DIFF] ${proposal.filePath}`;
    const existing = get().tabs.find(t => t.path === diffTabPath);
    if (existing) {
      set({ activeTabPath: diffTabPath });
      return;
    }

    // Reconstruct proposed modified text
    const patchHunks = proposal.hunks.map((h: any) => ({
      ...h,
      contextBefore: [],
      oldLines: h.oldContent ? h.oldContent.split('\n') : [],
      newLines: h.newContent ? h.newContent.split('\n') : [],
      contextAfter: [],
      status: 'accepted',
    }));

    // Import PatchEngine logic on client for display
    const lines = originalContent.split('\n');
    const sortedHunks = [...patchHunks].sort((a, b) => b.oldStartLine - a.oldStartLine);
    for (const h of sortedHunks) {
      const start = Math.max(0, h.oldStartLine - 1);
      lines.splice(start, h.oldLines.length, ...h.newLines);
    }
    const proposedContent = lines.join('\n');

    const diffTab: EditorTab = {
      path: diffTabPath,
      name: `Diff: ${proposal.filePath.split('/').pop()}`,
      content: proposedContent,
      originalContent: originalContent,
      dirty: false,
      version: proposal.baseVersion,
      sha256: proposal.baseSha256,
      isDiff: true,
      proposalId: proposal.id,
    };

    set({
      tabs: [...get().tabs, diffTab],
      activeTabPath: diffTabPath,
    });
  },
  updateHunkStatus: async (hunkId, status) => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    await fetch(`/api/projects/${project.id}/hunks/${hunkId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status }),
    });

    if (get().activeProposal) {
      const updatedHunks = get().activeProposal!.hunks.map(h =>
        h.hunkId === hunkId ? { ...h, status } : h
      );
      set({
        activeProposal: { ...get().activeProposal!, hunks: updatedHunks },
      });
    }
  },
  applyProposal: async (proposalId) => {
    const project = get().activeProject;
    if (!project) return false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/proposals/${proposalId}/apply`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`Failed to apply patch: ${err.error || 'Conflict'}`);
      return false;
    }

    const data = await res.json();
    const proposal = get().proposals.find(p => p.id === proposalId) || get().activeProposal;

    // Close diff tab if open
    if (proposal) {
      get().closeTab(`[DIFF] ${proposal.filePath}`);
      // Refresh normal file tab if open
      const fileTab = get().tabs.find(t => t.path === proposal.filePath);
      if (fileTab) {
        const updatedTabs = get().tabs.map(t =>
          t.path === proposal.filePath
            ? { ...t, content: data.newContent, originalContent: data.newContent, dirty: false, version: data.file.version, sha256: data.file.sha256 }
            : t
        );
        set({ tabs: updatedTabs });
      }
    }

    await get().fetchProposals();
    await get().fetchFileTree();
    await get().fetchGitStatus();
    return true;
  },
  undoFile: async (path) => {
    const project = get().activeProject;
    if (!project) return false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    const res = await fetch(`/api/projects/${project.id}/undo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filePath: path }),
    });

    if (!res.ok) {
      alert('No previous snapshot available to undo.');
      return false;
    }

    const data = await res.json();
    const updatedTabs = get().tabs.map(t =>
      t.path === path
        ? { ...t, content: data.content, originalContent: data.content, dirty: false, version: data.file.version, sha256: data.file.sha256 }
        : t
    );

    set({ tabs: updatedTabs });
    await get().fetchFileTree();
    await get().fetchGitStatus();
    return true;
  },

  // AI Assistant State
  messages: [],
  conversationId: null,
  isAiGenerating: false,
  selectedAIProvider: 'openai',
  selectedAIModel: 'gpt-4o',
  setSelectedAIProvider: (provider) => set({ selectedAIProvider: provider }),
  setSelectedAIModel: (model) => set({ selectedAIModel: model }),
  sendAiMessage: async (prompt) => {
    const project = get().activeProject;
    if (!project) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };

    set({
      messages: [...get().messages, userMessage],
      isAiGenerating: true,
    });

    const activeTab = get().tabs.find(t => t.path === get().activeTabPath);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;

    try {
      const response = await fetch(`/api/projects/${project.id}/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: prompt,
          conversationId: get().conversationId,
          activeFilePath: activeTab?.path,
          provider: get().selectedAIProvider,
          model: get().selectedAIModel,
          openTabs: get().tabs.map(t => t.path),
        }),
      });

      if (!response.body) throw new Error('No streaming response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf8');
      let assistantText = '';
      let createdProposalId: string | undefined;

      const assistantMsgId = `assistant-${Date.now()}`;
      set({
        messages: [
          ...get().messages,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(trimmed.slice(6));
            if (data.type === 'start') {
              set({ conversationId: data.conversationId });
            } else if (data.type === 'chunk') {
              assistantText += data.text;
              set({
                messages: get().messages.map(m =>
                  m.id === assistantMsgId ? { ...m, content: assistantText } : m
                ),
              });
            } else if (data.type === 'end') {
              if (data.proposalId) {
                createdProposalId = data.proposalId;
                set({
                  messages: get().messages.map(m =>
                    m.id === assistantMsgId
                      ? { ...m, proposalId: createdProposalId }
                      : m
                  ),
                });
                await get().fetchProposals();
              }
            }
          } catch {}
        }
      }
    } catch (err: any) {
      set({
        messages: [
          ...get().messages,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${err.message}`,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } finally {
      set({ isAiGenerating: false });
    }
  },

  // Git State
  gitStatus: null,
  fetchGitStatus: async () => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/git/status`, { headers });
    if (res.ok) {
      const data = await res.json();
      set({ gitStatus: data });
    }
  },
  stageFile: async (path, all = false) => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    await fetch(`/api/projects/${project.id}/git/stage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filePath: path, all }),
    });
    await get().fetchGitStatus();
  },
  unstageFile: async (path) => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    await fetch(`/api/projects/${project.id}/git/unstage`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filePath: path }),
    });
    await get().fetchGitStatus();
  },
  commitGit: async (message) => {
    const project = get().activeProject;
    if (!project) return false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/git/commit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
    });
    if (!res.ok) return false;
    await get().fetchGitStatus();
    return true;
  },
  gitRemotes: [],
  fetchGitRemotes: async () => {
    const project = get().activeProject;
    if (!project) return;
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/git/remotes`, { headers });
    if (res.ok) {
      const data = await res.json();
      set({ gitRemotes: data.remotes || [] });
    }
  },
  setGitRemote: async (url: string, name = 'origin') => {
    const project = get().activeProject;
    if (!project) return false;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/git/remotes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ url, name }),
    });
    if (res.ok) {
      await get().fetchGitRemotes();
      return true;
    }
    return false;
  },
  pushGit: async (options) => {
    const project = get().activeProject;
    if (!project) return { success: false, message: 'No active workspace selected' };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch(`/api/projects/${project.id}/git/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options || {}),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, message: data.details || data.error || 'Git push failed' };
    }
    await get().fetchGitStatus();
    await get().fetchGitRemotes();
    return { success: true, message: data.message };
  },

  // MCP Tokens
  mcpTokens: [],
  fetchMcpTokens: async () => {
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const res = await fetch('/api/mcp/tokens', { headers });
    if (res.ok) {
      const data = await res.json();
      set({ mcpTokens: data.tokens });
    }
  },
  createMcpToken: async (name, scopes) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    const project = get().activeProject;
    const res = await fetch('/api/mcp/tokens', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, projectId: project?.id, scopes }),
    });
    if (!res.ok) throw new Error('Failed to create MCP token');
    const data = await res.json();
    await get().fetchMcpTokens();
    return data;
  },
  revokeMcpToken: async (id) => {
    const headers: Record<string, string> = {};
    if (get().token) headers['Authorization'] = `Bearer ${get().token}`;
    await fetch(`/api/mcp/tokens/${id}`, { method: 'DELETE', headers });
    await get().fetchMcpTokens();
  },

  // UI Layout State
  activeSidebar: 'explorer',
  sidebarOpen: true,
  setActiveSidebar: (tab) => {
    if (get().activeSidebar === tab && get().sidebarOpen) {
      set({ sidebarOpen: false });
    } else {
      set({ activeSidebar: tab, sidebarOpen: true });
    }
  },
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  activeBottomTab: 'terminal',
  bottomPanelOpen: true,
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab, bottomPanelOpen: true }),
  toggleBottomPanel: () => set({ bottomPanelOpen: !get().bottomPanelOpen }),
  quickOpenVisible: false,
  setQuickOpenVisible: (open) => set({ quickOpenVisible: open }),
  commandPaletteVisible: false,
  setCommandPaletteVisible: (open) => set({ commandPaletteVisible: open }),
}));
