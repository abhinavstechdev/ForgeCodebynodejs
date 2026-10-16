import React from 'react';
import {
  Files,
  Search,
  GitBranch,
  Sparkles,
  Server,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { useAppStore, SidebarTab } from '../../store/useAppStore';

export const ActivityBar: React.FC = () => {
  const {
    activeSidebar,
    sidebarOpen,
    setActiveSidebar,
    gitStatus,
    proposals,
  } = useAppStore();

  const uncommittedCount = (gitStatus?.unstaged.length || 0) + (gitStatus?.untracked.length || 0) + (gitStatus?.staged.length || 0);
  const pendingProposalsCount = proposals.filter(p => p.status === 'pending').length;

  const topItems: Array<{ id: SidebarTab; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'explorer', label: 'Explorer (Ctrl+Shift+E)', icon: <Files className="w-5 h-5" /> },
    { id: 'search', label: 'Search (Ctrl+Shift+F)', icon: <Search className="w-5 h-5" /> },
    { id: 'git', label: 'Source Control (Ctrl+Shift+G)', icon: <GitBranch className="w-5 h-5" />, badge: uncommittedCount > 0 ? uncommittedCount : undefined },
    { id: 'ai', label: 'AI Coding Agent', icon: <Sparkles className="w-5 h-5 text-blue-400" />, badge: pendingProposalsCount > 0 ? pendingProposalsCount : undefined },
    { id: 'mcp', label: 'Model Context Protocol (MCP)', icon: <Server className="w-5 h-5" /> },
  ];

  return (
    <aside className="w-12 bg-editor-activity border-r border-editor-border flex flex-col justify-between items-center py-2 select-none z-10 shrink-0">
      {/* Top Main Nav Items */}
      <div className="flex flex-col items-center space-y-1 w-full">
        {topItems.map((item) => {
          const isActive = activeSidebar === item.id && sidebarOpen;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSidebar(item.id)}
              title={item.label}
              className={`relative w-full h-11 flex items-center justify-center transition-colors ${
                isActive
                  ? 'text-white border-l-2 border-blue-500 bg-editor-hover/50'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-editor-hover/30'
              }`}
            >
              {item.icon}
              {item.badge !== undefined && (
                <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-1 text-[9px] font-bold bg-blue-600 text-white rounded-full flex items-center justify-center leading-none">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Nav Items */}
      <div className="flex flex-col items-center space-y-1 w-full">
        <button
          onClick={() => setActiveSidebar('settings')}
          title="Settings & Configuration"
          className={`w-full h-10 flex items-center justify-center transition-colors ${
            activeSidebar === 'settings' && sidebarOpen
              ? 'text-white border-l-2 border-blue-500'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
};
