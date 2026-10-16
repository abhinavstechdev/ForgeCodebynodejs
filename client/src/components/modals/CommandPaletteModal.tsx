import React, { useState, useEffect } from 'react';
import { Command, Sparkles, Save, Terminal, Server, FolderKanban, Plus } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const CommandPaletteModal: React.FC = () => {
  const {
    commandPaletteVisible,
    setCommandPaletteVisible,
    saveActiveFile,
    setActiveSidebar,
    toggleBottomPanel,
    setActiveBottomTab,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    {
      id: 'save',
      label: 'File: Save Current File',
      shortcut: 'Ctrl+S',
      icon: <Save className="w-4 h-4 text-blue-400" />,
      action: () => saveActiveFile(),
    },
    {
      id: 'ai',
      label: 'View: Open AI Coding Copilot',
      shortcut: '',
      icon: <Sparkles className="w-4 h-4 text-blue-400" />,
      action: () => setActiveSidebar('ai'),
    },
    {
      id: 'terminal',
      label: 'View: Toggle Sandboxed Terminal',
      shortcut: 'Ctrl+`',
      icon: <Terminal className="w-4 h-4 text-emerald-400" />,
      action: () => {
        toggleBottomPanel();
        setActiveBottomTab('terminal');
      },
    },
    {
      id: 'mcp',
      label: 'MCP: Open Model Context Protocol Settings',
      shortcut: '',
      icon: <Server className="w-4 h-4 text-purple-400" />,
      action: () => setActiveSidebar('mcp'),
    },
    {
      id: 'git',
      label: 'View: Open Source Control',
      shortcut: 'Ctrl+Shift+G',
      icon: <FolderKanban className="w-4 h-4 text-amber-400" />,
      action: () => setActiveSidebar('git'),
    },
  ];

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteVisible(!commandPaletteVisible);
      } else if (e.key === 'Escape' && commandPaletteVisible) {
        setCommandPaletteVisible(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteVisible]);

  if (!commandPaletteVisible) return null;

  const executeCommand = (cmd: typeof commands[0]) => {
    cmd.action();
    setCommandPaletteVisible(false);
    setQuery('');
  };

  return (
    <div
      onClick={() => setCommandPaletteVisible(false)}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl overflow-hidden text-editor-text"
      >
        <div className="flex items-center px-3 border-b border-editor-border">
          <Command className="w-4 h-4 text-blue-400 mr-2 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command or search actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
              } else if (e.key === 'Enter' && filtered[selectedIndex]) {
                e.preventDefault();
                executeCommand(filtered[selectedIndex]);
              }
            }}
            className="w-full py-3 bg-transparent text-sm text-white focus:outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              onClick={() => executeCommand(cmd)}
              className={`px-3 py-2 flex items-center justify-between text-xs cursor-pointer ${
                idx === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:bg-editor-hover'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                {cmd.icon}
                <span className="font-medium truncate">{cmd.label}</span>
              </div>
              {cmd.shortcut && (
                <kbd className="px-1.5 py-0.5 text-[9px] bg-zinc-800 rounded border border-zinc-700">
                  {cmd.shortcut}
                </kbd>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
