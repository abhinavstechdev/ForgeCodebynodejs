import React, { useState, useEffect } from 'react';
import {
  Server,
  Key,
  Copy,
  Check,
  Trash2,
  Plus,
  Shield,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ALL_MCP_SCOPES, McpScope } from '@shared/types.js';

export const McpPanel: React.FC = () => {
  const { mcpTokens, fetchMcpTokens, createMcpToken, revokeMcpToken, token } = useAppStore();

  const [createModal, setCreateModal] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<McpScope[]>([...ALL_MCP_SCOPES]);
  const [createdTokenResult, setCreatedTokenResult] = useState<any>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    fetchMcpTokens();
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/mcp/audit-logs', { headers });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenName.trim()) return;
    try {
      const res = await createMcpToken(tokenName.trim(), selectedScopes);
      setCreatedTokenResult(res);
      setTokenName('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleScope = (scope: McpScope) => {
    if (selectedScopes.includes(scope)) {
      setSelectedScopes(selectedScopes.filter(s => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const mcpEndpointUrl = `${window.location.origin}/mcp`;

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      <div className="h-9 px-3 border-b border-editor-border flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <span className="flex items-center space-x-1.5">
          <Server className="w-4 h-4 text-emerald-400" />
          <span>MCP Server</span>
        </span>
        <button
          onClick={() => {
            setCreatedTokenResult(null);
            setCreateModal(true);
          }}
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-normal"
        >
          <Plus className="w-3 h-3" />
          <span>New Token</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
        {/* Endpoint info */}
        <div className="p-3 bg-editor-bg border border-editor-border rounded-lg space-y-2">
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide flex items-center justify-between">
            <span>Server Endpoint</span>
            <span className="text-emerald-400 font-mono text-[10px]">SSE / HTTP</span>
          </div>
          <div className="font-mono text-[11px] text-zinc-300 break-all bg-zinc-900 p-2 rounded border border-zinc-800">
            {mcpEndpointUrl}
          </div>
          <p className="text-[11px] text-zinc-400">
            Connect AI agents (Cursor, Claude Desktop, Antigravity) to read and modify project files securely.
          </p>
        </div>

        {/* Tokens List */}
        <div>
          <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2 flex items-center justify-between">
            <span>Active Tokens ({mcpTokens.length})</span>
          </div>

          <div className="space-y-2">
            {mcpTokens.map((t) => (
              <div
                key={t.id}
                className="p-2.5 bg-editor-bg border border-editor-border rounded-lg space-y-1.5"
              >
                <div className="flex items-center justify-between font-medium text-white">
                  <span className="truncate">{t.name}</span>
                  <button
                    onClick={() => {
                      if (confirm(`Revoke token "${t.name}"?`)) revokeMcpToken(t.id);
                    }}
                    className="text-zinc-500 hover:text-red-400 p-1"
                    title="Revoke Token"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="font-mono text-[10px] text-zinc-400">
                  {t.tokenPrefix}
                </div>
                <div className="flex flex-wrap gap-1">
                  {t.scopes.map((s) => (
                    <span
                      key={s}
                      className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ))}

            {mcpTokens.length === 0 && (
              <div className="p-4 text-center text-zinc-500 bg-editor-bg/50 border border-editor-border rounded-lg">
                No MCP tokens generated yet. Click "New Token" above to connect external agents.
              </div>
            )}
          </div>
        </div>

        {/* Recent Audit Logs */}
        {auditLogs.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2 flex items-center space-x-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-400" />
              <span>Recent Tool Invocations</span>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {auditLogs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="p-1.5 bg-editor-bg border border-editor-border rounded text-[11px] flex items-center justify-between"
                >
                  <span className="font-mono text-blue-400 truncate">{log.toolName}</span>
                  <div className="flex items-center space-x-2 text-zinc-400 text-[10px]">
                    <span>{log.durationMs}ms</span>
                    <span className={log.statusCode === 200 ? 'text-emerald-400' : 'text-red-400'}>
                      {log.statusCode}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Token Creation / Success Modal */}
      {createModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl w-full max-w-lg p-5 text-editor-text">
            {!createdTokenResult ? (
              <form onSubmit={handleCreate} className="space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span>Generate Personal MCP Token</span>
                </h3>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Token Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cursor IDE, Claude Desktop, Antigravity Agent"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-editor-bg border border-editor-border text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-2">Permission Scopes</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ALL_MCP_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="flex items-center space-x-2 text-xs p-2 rounded bg-editor-bg border border-editor-border cursor-pointer hover:border-zinc-500"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span className="font-mono text-[11px]">{scope}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateModal(false)}
                    className="px-3 py-1.5 text-xs rounded border border-editor-border hover:bg-editor-hover text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow"
                  >
                    Generate Token
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-sm">
                  <Check className="w-5 h-5" />
                  <span>MCP Token Generated Successfully!</span>
                </div>
                <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2 rounded">
                  Please copy this token now. It will not be shown again.
                </p>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Bearer Token</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={createdTokenResult.token}
                      className="w-full px-3 py-2 rounded bg-editor-bg border border-editor-border text-xs font-mono text-emerald-300 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(createdTokenResult.token);
                        setCopiedKey(true);
                        setTimeout(() => setCopiedKey(false), 2000);
                      }}
                      className="px-3 py-2 rounded bg-blue-600 text-white flex items-center space-x-1 shrink-0"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Claude Desktop Configuration</label>
                  <div className="relative">
                    <pre className="p-3 bg-editor-bg border border-editor-border rounded text-[10px] font-mono text-zinc-300 overflow-x-auto">
                      {JSON.stringify(createdTokenResult.configSnippet, null, 2)}
                    </pre>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(createdTokenResult.configSnippet, null, 2));
                        setCopiedConfig(true);
                        setTimeout(() => setCopiedConfig(false), 2000);
                      }}
                      className="absolute top-2 right-2 p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[10px] flex items-center space-x-1"
                    >
                      {copiedConfig ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedConfig ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setCreateModal(false);
                      setCreatedTokenResult(null);
                    }}
                    className="px-4 py-1.5 text-xs rounded bg-blue-600 text-white font-medium"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
