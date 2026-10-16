import React, { useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAppStore } from './store/useAppStore';
import { TopBar } from './components/layout/TopBar';
import { ActivityBar } from './components/layout/ActivityBar';
import { StatusBar } from './components/layout/StatusBar';
import { FileExplorer } from './components/sidebar/FileExplorer';
import { SearchPanel } from './components/sidebar/SearchPanel';
import { GitPanel } from './components/sidebar/GitPanel';
import { McpPanel } from './components/sidebar/McpPanel';
import { SettingsPanel } from './components/sidebar/SettingsPanel';
import { EditorWorkspace } from './components/editor/EditorWorkspace';
import { BottomPanel } from './components/bottom/BottomPanel';
import { AiPanel } from './components/ai/AiPanel';
import { QuickOpenModal } from './components/modals/QuickOpenModal';
import { CommandPaletteModal } from './components/modals/CommandPaletteModal';
import { AuthModal } from './components/modals/AuthModal';

export const App: React.FC = () => {
  const {
    checkAuth,
    sidebarOpen,
    activeSidebar,
    bottomPanelOpen,
  } = useAppStore();

  useEffect(() => {
    checkAuth();
  }, []);

  const isAiActive = activeSidebar === 'ai' && sidebarOpen;

  return (
    <div className="h-screen w-screen flex flex-col bg-editor-bg text-editor-text overflow-hidden select-none">
      {/* 1. Top Command Bar */}
      <TopBar />

      {/* 2. Central Resizable Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Leftmost Activity Bar */}
        <ActivityBar />

        {/* Resizable Panels Group */}
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Primary Left Sidebar */}
          {sidebarOpen && activeSidebar !== 'ai' && (
            <>
              <Panel defaultSize={20} minSize={15} maxSize={35} className="bg-editor-sidebar">
                {activeSidebar === 'explorer' && <FileExplorer />}
                {activeSidebar === 'search' && <SearchPanel />}
                {activeSidebar === 'git' && <GitPanel />}
                {activeSidebar === 'mcp' && <McpPanel />}
                {activeSidebar === 'settings' && <SettingsPanel />}
              </Panel>
              <PanelResizeHandle className="w-1 bg-editor-border hover:bg-blue-500 transition-colors" />
            </>
          )}

          {/* Central Editor & Bottom Panel */}
          <Panel defaultSize={isAiActive ? 55 : 80} minSize={40}>
            <PanelGroup direction="vertical">
              {/* Editor Workspace (Monaco Editor & Monaco Diff Viewer) */}
              <Panel defaultSize={bottomPanelOpen ? 70 : 100} minSize={30}>
                <EditorWorkspace />
              </Panel>

              {/* Bottom Terminal & Diagnostics Panel */}
              {bottomPanelOpen && (
                <>
                  <PanelResizeHandle className="h-1 bg-editor-border hover:bg-blue-500 transition-colors" />
                  <Panel defaultSize={30} minSize={15} maxSize={60}>
                    <BottomPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Right AI Assistant Panel (Cursor / VS Code Copilot Layout) */}
          {isAiActive && (
            <>
              <PanelResizeHandle className="w-1 bg-editor-border hover:bg-blue-500 transition-colors" />
              <Panel defaultSize={25} minSize={20} maxSize={40} className="bg-editor-sidebar">
                <AiPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* 3. Bottom Status Bar */}
      <StatusBar />

      {/* Modals & Dialogs */}
      <QuickOpenModal />
      <CommandPaletteModal />
      <AuthModal />
    </div>
  );
};

export default App;
