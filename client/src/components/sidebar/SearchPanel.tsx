import React, { useState } from 'react';
import { Search, FileCode, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const SearchPanel: React.FC = () => {
  const { activeProject, token, openFile } = useAppStore();
  const [query, setQuery] = useState('');
  const [isRegex, setIsRegex] = useState(false);
  const [results, setResults] = useState<Array<{ path: string; line: number; content: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || !activeProject) return;

    setIsSearching(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(
        `/api/projects/${activeProject.id}/search/code?q=${encodeURIComponent(
          query
        )}&regex=${isRegex}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.matches || []);
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      <div className="h-9 px-3 border-b border-editor-border flex items-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Search Project Files
      </div>

      <div className="p-3 border-b border-editor-border space-y-2">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            placeholder="Search code across project..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-7 pr-12 py-1.5 bg-editor-bg border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-blue-500"
          />
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2 top-2.5" />
          <button
            type="button"
            onClick={() => setIsRegex(!isRegex)}
            title="Use Regular Expression"
            className={`absolute right-2 top-1.5 px-1 rounded text-[10px] font-mono border ${
              isRegex
                ? 'bg-blue-600/30 border-blue-500 text-blue-400'
                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            .*
          </button>
        </form>

        <div className="flex justify-between items-center text-[11px] text-zinc-500">
          <span>{results.length} results</span>
          <button
            onClick={() => handleSearch()}
            disabled={isSearching}
            className="text-blue-400 hover:underline"
          >
            {isSearching ? 'Searching...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {results.map((r, i) => (
          <div
            key={i}
            onClick={() => openFile(r.path)}
            className="p-2 rounded hover:bg-editor-hover cursor-pointer border border-transparent hover:border-editor-border transition-colors text-xs"
          >
            <div className="flex items-center space-x-1.5 text-blue-400 font-medium mb-1">
              <FileCode className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{r.path}</span>
              <span className="text-[10px] text-zinc-500">:Ln {r.line}</span>
            </div>
            <div className="font-mono text-[11px] text-zinc-300 bg-editor-bg p-1.5 rounded truncate">
              {r.content}
            </div>
          </div>
        ))}
        {results.length === 0 && !isSearching && query && (
          <div className="p-4 text-xs text-zinc-500 text-center">No matches found for "{query}".</div>
        )}
      </div>
    </div>
  );
};
