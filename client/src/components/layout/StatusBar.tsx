import React from 'react';
import { GitBranch, AlertCircle, CheckCircle2, Server, Sparkles, Terminal } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const StatusBar: React.FC = () => {
  const {
    gitStatus,
    activeTabPath,
    tabs,
    selectedAIModel,
    toggleBottomPanel,
    bottomPanelOpen,
    activeBottomTab,
    setActiveBottomTab,
    setActiveSidebar,
  } = useAppStore();

  const currentTab = tabs.find(t => t.path === activeTabPath);
  const ext = currentTab ? currentTab.path.split('.').pop()?.toUpperCase() : '';
  const languageLabel = ext ? (ext === 'TS' ? 'TypeScript' : ext === 'JS' ? 'JavaScript' : ext === 'TSX' ? 'TypeScript JSX' : ext) : 'Plain Text';

  return (
    <footer className="h-6 bg-blue-700/80 text-white border-t border-blue-600/50 px-3 flex items-center justify-between text-[11px] select-none shrink-0 font-sans">
      {/* Left items: Git, Diagnostics, Terminal button */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setActiveSidebar('git')}
          className="flex items-center space-x-1 hover:bg-blue-600 px-1.5 py-0.5 rounded transition-colors"
          title="Git Branch"
        >
          <GitBranch className="w-3 h-3" />
          <span>{gitStatus?.currentBranch || 'main'}*</span>
        </button>

        <div className="flex items-center space-x-2 text-[10px]">
          <div className="flex items-center space-x-0.5" title="0 Errors">
            <AlertCircle className="w-3 h-3" />
            <span>0</span>
          </div>
          <div className="flex items-center space-x-0.5 text-blue-200" title="All checks passed">
            <CheckCircle2 className="w-3 h-3" />
          </div>
        </div>

        <button
          onClick={() => {
            if (!bottomPanelOpen) toggleBottomPanel();
            setActiveBottomTab('terminal');
          }}
          className={`flex items-center space-x-1 hover:bg-blue-600 px-1.5 py-0.5 rounded transition-colors ${
            bottomPanelOpen && activeBottomTab === 'terminal' ? 'bg-blue-800' : ''
          }`}
        >
          <Terminal className="w-3 h-3" />
          <span>Terminal</span>
        </button>
      </div>

      {/* Right items: Line/Col, Encoding, MCP status, AI model */}
      <div className="flex items-center space-x-3">
        {currentTab && (
          <>
            <span>Ln 1, Col 1</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>{languageLabel}</span>
          </>
        )}

        <button
          onClick={() => setActiveSidebar('mcp')}
          className="flex items-center space-x-1 hover:bg-blue-600 px-1.5 py-0.5 rounded transition-colors text-emerald-200"
          title="MCP Server active on /mcp (Streamable HTTP / SSE)"
        >
          <Server className="w-3 h-3" />
          <span>MCP: Ready</span>
        </button>

        <button
          onClick={() => setActiveSidebar('ai')}
          className="flex items-center space-x-1 hover:bg-blue-600 px-1.5 py-0.5 rounded transition-colors text-sky-200"
          title="Active AI Provider & Model"
        >
          <Sparkles className="w-3 h-3" />
          <span>{selectedAIModel}</span>
        </button>
      </div>
    </footer>
  );
};
