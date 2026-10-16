import React, { useState } from 'react';
import {
  GitBranch,
  Plus,
  Minus,
  Check,
  RefreshCw,
  GitCommit,
  FileCode,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const GitPanel: React.FC = () => {
  const {
    gitStatus,
    fetchGitStatus,
    stageFile,
    unstageFile,
    commitGit,
    openFile,
  } = useAppStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      const ok = await commitGit(commitMessage.trim());
      if (ok) {
        setCommitMessage('');
      }
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      <div className="h-9 px-3 border-b border-editor-border flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <span>Source Control</span>
        <button
          onClick={() => fetchGitStatus()}
          className="p-1 hover:text-white rounded"
          title="Refresh Git Status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Commit Box */}
      <div className="p-3 border-b border-editor-border">
        <form onSubmit={handleCommit} className="space-y-2">
          <textarea
            rows={2}
            placeholder="Commit message (Cmd+Enter to commit)..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleCommit(e);
              }
            }}
            className="w-full p-2 bg-editor-bg border border-editor-border rounded text-xs text-editor-text focus:outline-none focus:border-blue-500 resize-none font-sans"
          />
          <button
            type="submit"
            disabled={isCommitting || !commitMessage.trim()}
            className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors shadow"
          >
            <GitCommit className="w-3.5 h-3.5" />
            <span>{isCommitting ? 'Committing...' : 'Commit Changes'}</span>
          </button>
        </form>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Staged Changes */}
        {gitStatus && gitStatus.staged.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-1 mb-1">
              <span>STAGED CHANGES ({gitStatus.staged.length})</span>
            </div>
            <div className="space-y-0.5">
              {gitStatus.staged.map((f) => (
                <div
                  key={f}
                  className="flex items-center justify-between px-2 py-1 rounded hover:bg-editor-hover text-xs group text-zinc-300"
                >
                  <div
                    onClick={() => openFile(f)}
                    className="flex items-center space-x-1.5 truncate cursor-pointer hover:text-white"
                  >
                    <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                  <button
                    onClick={() => unstageFile(f)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-yellow-400"
                    title="Unstage Changes"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Changes (Unstaged & Untracked) */}
        {gitStatus && (
          <div>
            <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400 px-1 mb-1">
              <span>CHANGES ({(gitStatus.unstaged.length + gitStatus.untracked.length)})</span>
              <button
                onClick={() => stageFile(undefined, true)}
                className="hover:text-blue-400 text-[10px]"
                title="Stage All Changes"
              >
                Stage All
              </button>
            </div>
            <div className="space-y-0.5">
              {[...gitStatus.unstaged, ...gitStatus.untracked].map((f) => (
                <div
                  key={f}
                  className="flex items-center justify-between px-2 py-1 rounded hover:bg-editor-hover text-xs group text-zinc-300"
                >
                  <div
                    onClick={() => openFile(f)}
                    className="flex items-center space-x-1.5 truncate cursor-pointer hover:text-white"
                  >
                    <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{f}</span>
                  </div>
                  <button
                    onClick={() => stageFile(f)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-emerald-400"
                    title="Stage File"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {gitStatus.unstaged.length === 0 && gitStatus.untracked.length === 0 && gitStatus.staged.length === 0 && (
                <div className="p-3 text-center text-xs text-zinc-500">Working tree clean. No uncommitted changes.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
