import React, { useState, useEffect } from 'react';
import { Search, FileCode, File } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const QuickOpenModal: React.FC = () => {
  const {
    quickOpenVisible,
    setQuickOpenVisible,
    flatFiles,
    openFile,
  } = useAppStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filtered = flatFiles
    .filter(f => !f.isFolder && f.path.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 15);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setQuickOpenVisible(!quickOpenVisible);
      } else if (e.key === 'Escape' && quickOpenVisible) {
        setQuickOpenVisible(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickOpenVisible]);

  if (!quickOpenVisible) return null;

  const handleSelect = (path: string) => {
    openFile(path);
    setQuickOpenVisible(false);
    setQuery('');
  };

  return (
    <div
      onClick={() => setQuickOpenVisible(false)}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-editor-sidebar border border-editor-border rounded-lg shadow-2xl overflow-hidden text-editor-text"
      >
        <div className="flex items-center px-3 border-b border-editor-border">
          <Search className="w-4 h-4 text-zinc-400 mr-2 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search files by name..."
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
                handleSelect(filtered[selectedIndex].path);
              }
            }}
            className="w-full py-3 bg-transparent text-sm text-white focus:outline-none"
          />
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((file, idx) => (
            <div
              key={file.id}
              onClick={() => handleSelect(file.path)}
              className={`px-3 py-2 flex items-center justify-between text-xs cursor-pointer ${
                idx === selectedIndex
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-300 hover:bg-editor-hover'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <FileCode className="w-4 h-4 shrink-0 text-blue-400" />
                <span className="font-medium truncate">{file.path.split('/').pop()}</span>
                <span className={`text-[11px] truncate ${idx === selectedIndex ? 'text-blue-200' : 'text-zinc-500'}`}>
                  {file.path}
                </span>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-zinc-500">
              No matching files found
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
