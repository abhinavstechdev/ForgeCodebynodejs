import React, { useRef } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { X, Circle, Sparkles, Save, Undo2, GitCompare } from 'lucide-react';
import { useAppStore, EditorTab } from '../../store/useAppStore';
import { DiffViewer } from './DiffViewer';

export const EditorWorkspace: React.FC = () => {
  const {
    tabs,
    activeTabPath,
    openFile,
    closeTab,
    updateTabContent,
    saveActiveFile,
    undoFile,
    activeProposal,
    openDiffForProposal,
    setActiveSidebar,
  } = useAppStore();

  const editorRef = useRef<any>(null);

  const activeTab = tabs.find(t => t.path === activeTabPath);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;

    // Define custom dark theme
    monaco.editor.defineTheme('forgecode-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'number', foreground: 'B5CEA8' },
      ],
      colors: {
        'editor.background': '#18181b',
        'editor.foreground': '#d4d4d8',
        'editorCursor.foreground': '#3b82f6',
        'editor.lineHighlightBackground': '#27272a40',
        'editorLineNumber.foreground': '#52525b',
        'editorLineNumber.activeForeground': '#a1a1aa',
        'editor.selectionBackground': '#2563eb33',
      },
    });
    monaco.editor.setTheme('forgecode-dark');

    // Register Ctrl+S / Cmd+S save command
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveFile();
    });
  };

  const getLanguageFromPath = (path: string) => {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'sql':
        return 'sql';
      case 'sh':
        return 'shell';
      default:
        return 'plaintext';
    }
  };

  return (
    <div className="h-full flex flex-col bg-editor-bg overflow-hidden select-none">
      {/* Multi-Tab Bar */}
      <div className="h-9 bg-editor-activity border-b border-editor-border flex items-center justify-between overflow-x-auto shrink-0 px-1">
        <div className="flex items-center space-x-0.5 h-full overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = tab.path === activeTabPath;
            return (
              <div
                key={tab.path}
                onClick={() => useAppStore.setState({ activeTabPath: tab.path })}
                className={`h-full px-3 flex items-center space-x-2 text-xs border-r border-editor-border cursor-pointer group transition-colors ${
                  isActive
                    ? 'bg-editor-bg text-white border-t-2 border-t-blue-500 font-medium'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-editor-hover/50'
                }`}
              >
                {tab.isDiff ? (
                  <GitCompare className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                ) : null}
                <span className="truncate max-w-[120px]">{tab.name}</span>

                {/* Dirty indicator dot or close button */}
                <div className="w-4 h-4 flex items-center justify-center">
                  {tab.dirty ? (
                    <Circle className="w-2 h-2 fill-blue-400 text-blue-400 group-hover:hidden" />
                  ) : null}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.path);
                    }}
                    className={`${
                      tab.dirty ? 'hidden group-hover:flex' : 'flex'
                    } p-0.5 hover:bg-zinc-700/60 rounded text-zinc-400 hover:text-white`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Quick Tab Actions */}
        {activeTab && !activeTab.isDiff && (
          <div className="flex items-center space-x-1 px-2">
            <button
              onClick={() => saveActiveFile()}
              disabled={!activeTab.dirty}
              className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
                activeTab.dirty
                  ? 'bg-blue-600 hover:bg-blue-500 text-white font-medium'
                  : 'text-zinc-500 cursor-not-allowed'
              }`}
              title="Save File (Ctrl+S)"
            >
              <Save className="w-3 h-3" />
              <span>Save</span>
            </button>
            <button
              onClick={() => undoFile(activeTab.path)}
              className="p-1 hover:bg-editor-hover rounded text-zinc-400 hover:text-zinc-200"
              title="Revert to Previous Snapshot"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Editor Body */}
      <div className="flex-1 relative overflow-hidden">
        {activeTab ? (
          activeTab.isDiff && activeTab.proposalId ? (
            <DiffViewer proposalId={activeTab.proposalId} />
          ) : (
            <Editor
              height="100%"
              path={activeTab.path}
              language={getLanguageFromPath(activeTab.path)}
              value={activeTab.content}
              theme="forgecode-dark"
              onChange={(value) => updateTabContent(activeTab.path, value || '')}
              onMount={handleEditorDidMount}
              options={{
                fontFamily: '"JetBrains Mono", Consolas, monospace',
                fontSize: 13,
                lineHeight: 20,
                minimap: { enabled: true, maxColumn: 80 },
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true, indentation: true },
                renderLineHighlight: 'all',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                formatOnPaste: true,
                padding: { top: 8 },
                automaticLayout: true,
              }}
            />
          )
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs space-y-3">
            <Sparkles className="w-8 h-8 text-blue-500/50" />
            <div className="text-center space-y-1">
              <p className="font-semibold text-zinc-400">ForgeCode AI Web IDE</p>
              <p>Select a file from the Explorer or press <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded border border-zinc-700">Ctrl+P</kbd> to open</p>
            </div>
            <button
              onClick={() => setActiveSidebar('ai')}
              className="px-3 py-1.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-600/30 font-medium"
            >
              Ask AI Assistant
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
