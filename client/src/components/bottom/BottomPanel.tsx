import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, AlertCircle, FileText, X, Trash2 } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';
import { useAppStore } from '../../store/useAppStore';

export const BottomPanel: React.FC = () => {
  const {
    activeBottomTab,
    setActiveBottomTab,
    toggleBottomPanel,
    activeProject,
    token,
  } = useAppStore();

  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (activeBottomTab !== 'terminal' || !terminalRef.current || !activeProject) return;

    // Initialize xterm
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", Consolas, monospace',
      fontSize: 12,
      lineHeight: 18,
      theme: {
        background: '#121214',
        foreground: '#d4d4d8',
        cursor: '#3b82f6',
        selectionBackground: '#2563eb40',
        black: '#1f1f23',
        blue: '#3b82f6',
        green: '#10b981',
        yellow: '#f59e0b',
        red: '#ef4444',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to backend WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?token=${encodeURIComponent(
      token || ''
    )}&projectId=${encodeURIComponent(activeProject.id)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'output') {
          term.write(msg.data);
        } else if (msg.type === 'error') {
          term.write(`\r\n\x1b[31m[Error]: ${msg.data}\x1b[0m\r\n`);
        }
      } catch {
        term.write(event.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [activeBottomTab, activeProject?.id]);

  const clearTerminal = () => {
    xtermInstance.current?.clear();
  };

  return (
    <div className="h-full flex flex-col bg-[#121214] border-t border-editor-border select-none">
      {/* Panel Tabs Header */}
      <div className="h-8 bg-editor-activity border-b border-editor-border px-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-1 h-full">
          <button
            onClick={() => setActiveBottomTab('terminal')}
            className={`h-full px-3 flex items-center space-x-1.5 transition-colors ${
              activeBottomTab === 'terminal'
                ? 'border-b-2 border-blue-500 text-white font-medium bg-editor-bg/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5 text-blue-400" />
            <span>Terminal</span>
          </button>

          <button
            onClick={() => setActiveBottomTab('diagnostics')}
            className={`h-full px-3 flex items-center space-x-1.5 transition-colors ${
              activeBottomTab === 'diagnostics'
                ? 'border-b-2 border-blue-500 text-white font-medium bg-editor-bg/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Problems (0)</span>
          </button>

          <button
            onClick={() => setActiveBottomTab('output')}
            className={`h-full px-3 flex items-center space-x-1.5 transition-colors ${
              activeBottomTab === 'output'
                ? 'border-b-2 border-blue-500 text-white font-medium bg-editor-bg/40'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-400" />
            <span>Output</span>
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {activeBottomTab === 'terminal' && (
            <button
              onClick={clearTerminal}
              className="p-1 hover:text-white text-zinc-400"
              title="Clear Terminal"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={toggleBottomPanel}
            className="p-1 hover:text-white text-zinc-400"
            title="Close Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Panel Contents */}
      <div className="flex-1 overflow-hidden relative">
        {activeBottomTab === 'terminal' && (
          <div ref={terminalRef} className="h-full w-full" />
        )}

        {activeBottomTab === 'diagnostics' && (
          <div className="p-4 text-xs text-zinc-400 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400">
              <AlertCircle className="w-4 h-4" />
              <span className="font-semibold">No problems have been detected in the workspace.</span>
            </div>
            <p className="text-[11px] text-zinc-500">TypeScript and syntax checks are active.</p>
          </div>
        )}

        {activeBottomTab === 'output' && (
          <div className="p-3 font-mono text-[11px] text-zinc-300 space-y-1 overflow-y-auto h-full">
            <div className="text-zinc-500">[ForgeCode Runner]: System initialized.</div>
            <div className="text-zinc-500">[Prisma ORM]: Connected via Voroa PostgreSQL pool.</div>
            <div className="text-emerald-400">[MCP Server]: Active on /mcp.</div>
          </div>
        )}
      </div>
    </div>
  );
};
