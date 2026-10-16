import React, { useState } from 'react';
import {
  Code2,
  FolderKanban,
  Search,
  Command,
  PanelLeft,
  PanelBottom,
  Sparkles,
  Plus,
  LogOut,
  ChevronDown,
  User as UserIcon,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const TopBar: React.FC = () => {
  const {
    user,
    projects,
    activeProject,
    selectProject,
    createProject,
    logout,
    toggleSidebar,
    toggleBottomPanel,
    setActiveSidebar,
    sidebarOpen,
    setQuickOpenVisible,
    setCommandPaletteVisible,
  } = useAppStore();

  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [newProjectModal, setNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectTemplate, setNewProjectTemplate] = useState('express');

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      await createProject(newProjectName.trim(), newProjectTemplate);
      setNewProjectName('');
      setNewProjectModal(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <>
      <header className="h-10 bg-editor-activity border-b border-editor-border px-3 flex items-center justify-between text-xs select-none">
        {/* Left: Branding & Project Selector */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 font-semibold text-editor-text">
            <Code2 className="w-4 h-4 text-blue-500" />
            <span className="tracking-wide">ForgeCode</span>
            <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30">AI</span>
          </div>

          <div className="h-4 w-px bg-editor-border mx-1" />

          {/* Project Switcher */}
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-editor-hover text-editor-text transition-colors"
            >
              <FolderKanban className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-medium max-w-[140px] truncate">
                {activeProject ? activeProject.name : 'Select Project'}
              </span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {projectDropdownOpen && (
              <div
                className="absolute top-full left-0 mt-1 w-56 bg-editor-sidebar border border-editor-border rounded shadow-xl py-1 z-50 text-editor-text"
                onClick={() => setProjectDropdownOpen(false)}
              >
                <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-editor-border flex items-center justify-between">
                  <span>Workspaces</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectDropdownOpen(false);
                      setNewProjectModal(true);
                    }}
                    className="p-1 hover:bg-zinc-700/50 rounded text-blue-400"
                    title="New Workspace"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p)}
                      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-editor-hover flex items-center justify-between ${
                        activeProject?.id === p.id ? 'text-blue-400 font-medium bg-blue-500/10' : ''
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-zinc-500">{p.storageDriver}</span>
                    </button>
                  ))}
                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-zinc-500 text-center">No projects found</div>
                  )}
                </div>
                <div className="border-t border-editor-border pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setProjectDropdownOpen(false);
                      setNewProjectModal(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-blue-400 hover:bg-editor-hover flex items-center space-x-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Workspace</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Command Search / Quick Open */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setQuickOpenVisible(true)}
            className="flex items-center space-x-2 px-3 py-1 rounded bg-editor-sidebar border border-editor-border hover:border-zinc-500 text-zinc-400 hover:text-zinc-200 transition-colors w-64 justify-between"
          >
            <div className="flex items-center space-x-2">
              <Search className="w-3 h-3" />
              <span className="text-[11px] truncate">Search files (Cmd+P)</span>
            </div>
            <kbd className="px-1.5 py-0.5 text-[9px] bg-zinc-800 rounded border border-zinc-700">Ctrl+P</kbd>
          </button>

          <button
            onClick={() => setCommandPaletteVisible(true)}
            className="p-1 rounded hover:bg-editor-hover text-zinc-400 hover:text-zinc-200"
            title="Command Palette (Ctrl+Shift+P)"
          >
            <Command className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Layout Controls & User Profile */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleSidebar}
            className={`p-1.5 rounded hover:bg-editor-hover transition-colors ${
              sidebarOpen ? 'text-blue-400' : 'text-zinc-400'
            }`}
            title="Toggle Primary Sidebar"
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleBottomPanel}
            className="p-1.5 rounded hover:bg-editor-hover text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Toggle Terminal Panel"
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setActiveSidebar('ai')}
            className="flex items-center space-x-1 px-2 py-1 rounded bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors"
            title="Open AI Coding Agent"
          >
            <Sparkles className="w-3 h-3" />
            <span className="font-medium text-[11px]">AI Copilot</span>
          </button>

          <div className="h-4 w-px bg-editor-border mx-1" />

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserDropdownOpen(!userDropdownOpen)}
              className="flex items-center space-x-1.5 px-2 py-1 rounded hover:bg-editor-hover text-editor-text transition-colors"
            >
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-[10px] font-semibold text-white">
                {user?.name ? user.name[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : 'U'}
              </div>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </button>

            {userDropdownOpen && (
              <div
                className="absolute top-full right-0 mt-1 w-48 bg-editor-sidebar border border-editor-border rounded shadow-xl py-1 z-50 text-editor-text"
                onClick={() => setUserDropdownOpen(false)}
              >
                <div className="px-3 py-2 border-b border-editor-border">
                  <div className="font-medium truncate">{user?.name || 'Developer'}</div>
                  <div className="text-[10px] text-zinc-400 truncate">{user?.email}</div>
                </div>
                <button
                  onClick={() => setActiveSidebar('settings')}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-editor-hover flex items-center space-x-2"
                >
                  <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                  <span>AI & IDE Settings</span>
                </button>
                <button
                  onClick={() => logout()}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-editor-hover flex items-center space-x-2 border-t border-editor-border"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* New Project Modal */}
      {newProjectModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl w-full max-w-md p-5 text-editor-text">
            <h3 className="text-sm font-semibold mb-4 text-white flex items-center space-x-2">
              <FolderKanban className="w-4 h-4 text-blue-400" />
              <span>Create New Workspace</span>
            </h3>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. backend-api"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-editor-bg border border-editor-border text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">Starter Template</label>
                <select
                  value={newProjectTemplate}
                  onChange={(e) => setNewProjectTemplate(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-editor-bg border border-editor-border text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="express">Node.js / Express Backend</option>
                  <option value="react">React / Vite Frontend</option>
                  <option value="blank">Blank Project</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewProjectModal(false)}
                  className="px-3 py-1.5 text-xs rounded border border-editor-border hover:bg-editor-hover text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
