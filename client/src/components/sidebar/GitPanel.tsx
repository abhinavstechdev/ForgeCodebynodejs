import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  Minus,
  RefreshCw,
  GitCommit,
  FileCode,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Globe,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const GitPanel: React.FC = () => {
  const {
    gitStatus,
    gitRemotes,
    fetchGitStatus,
    fetchGitRemotes,
    stageFile,
    unstageFile,
    commitGit,
    pushGit,
    openFile,
  } = useAppStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // GitHub Push settings
  const [showPushSettings, setShowPushSettings] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [githubToken, setGithubToken] = useState(() => {
    return localStorage.getItem('forgecode_github_pat') || '';
  });
  const [branch, setBranch] = useState('');
  const [forcePush, setForcePush] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushStatusMessage, setPushStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchGitRemotes();
  }, [fetchGitRemotes]);

  useEffect(() => {
    if (gitRemotes && gitRemotes.length > 0 && !remoteUrl) {
      setRemoteUrl(gitRemotes[0].url);
    }
  }, [gitRemotes, remoteUrl]);

  useEffect(() => {
    if (gitStatus?.currentBranch && !branch) {
      setBranch(gitStatus.currentBranch);
    }
  }, [gitStatus?.currentBranch, branch]);

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

  const handlePush = async () => {
    setIsPushing(true);
    setPushStatusMessage(null);
    try {
      if (githubToken) {
        localStorage.setItem('forgecode_github_pat', githubToken);
      }
      const result = await pushGit({
        remoteUrl: remoteUrl.trim() || undefined,
        token: githubToken.trim() || undefined,
        branch: branch.trim() || undefined,
        commitMessage: commitMessage.trim() || undefined,
        force: forcePush,
      });

      if (result.success) {
        setPushStatusMessage({ type: 'success', text: result.message || 'Pushed to GitHub successfully!' });
        setCommitMessage('');
      } else {
        setPushStatusMessage({ type: 'error', text: result.message || 'Push failed' });
      }
    } catch (err: any) {
      setPushStatusMessage({ type: 'error', text: err.message || 'Push failed' });
    } finally {
      setIsPushing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      {/* Header */}
      <div className="h-9 px-3 border-b border-editor-border flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <div className="flex items-center space-x-1.5 truncate">
          <span>Source Control</span>
          {gitStatus?.currentBranch && (
            <span className="flex items-center space-x-1 lowercase text-[11px] bg-zinc-800 text-blue-400 px-1.5 py-0.5 rounded border border-zinc-700">
              <GitBranch className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[90px]">{gitStatus.currentBranch}</span>
            </span>
          )}
        </div>
        <button
          onClick={() => {
            fetchGitStatus();
            fetchGitRemotes();
          }}
          className="p-1 hover:text-white rounded transition-colors"
          title="Refresh Git Status"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Commit Box */}
      <div className="p-3 border-b border-editor-border space-y-2">
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
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="submit"
              disabled={isCommitting || !commitMessage.trim()}
              className="py-1.5 px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center justify-center space-x-1 transition-colors shadow"
            >
              <GitCommit className="w-3.5 h-3.5" />
              <span>{isCommitting ? 'Committing...' : 'Commit'}</span>
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={isPushing}
              className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center justify-center space-x-1 transition-colors shadow"
              title="Push commits directly to GitHub"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{isPushing ? 'Pushing...' : 'Push to GitHub'}</span>
            </button>
          </div>
        </form>

        {/* GitHub Push Settings Toggle */}
        <button
          type="button"
          onClick={() => setShowPushSettings(!showPushSettings)}
          className="w-full pt-1 flex items-center justify-between text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <span className="flex items-center space-x-1">
            <Globe className="w-3 h-3 text-zinc-400" />
            <span>GitHub Remote & Auth</span>
          </span>
          {showPushSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {/* GitHub Settings Drawer */}
        {showPushSettings && (
          <div className="p-2.5 bg-zinc-900 border border-editor-border rounded space-y-2 text-xs text-zinc-300">
            <div>
              <label className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                GitHub Repository URL
              </label>
              <input
                type="text"
                placeholder="https://github.com/owner/repo.git"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                className="w-full p-1.5 bg-editor-bg border border-editor-border rounded text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1 flex items-center justify-between">
                <span>Personal Access Token (PAT)</span>
                <span className="text-[9px] text-zinc-500 lowercase">saved locally</span>
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="ghp_... or github_pat_..."
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  className="w-full p-1.5 pl-6 bg-editor-bg border border-editor-border rounded text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                />
                <KeyRound className="w-3 h-3 text-zinc-500 absolute left-2 top-2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-semibold text-zinc-400 mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full p-1.5 bg-editor-bg border border-editor-border rounded text-[11px] text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
              <div className="flex items-center pt-4">
                <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={forcePush}
                    onChange={(e) => setForcePush(e.target.checked)}
                    className="rounded border-editor-border bg-editor-bg text-blue-500 focus:ring-0"
                  />
                  <span>Force push</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Push Status Notification */}
        {pushStatusMessage && (
          <div
            className={`p-2 rounded text-xs flex items-start space-x-1.5 ${
              pushStatusMessage.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border border-red-800 text-red-300'
            }`}
          >
            {pushStatusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            )}
            <span className="break-all">{pushStatusMessage.text}</span>
          </div>
        )}
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
              <span>CHANGES ({gitStatus.unstaged.length + gitStatus.untracked.length})</span>
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
              {gitStatus.unstaged.length === 0 &&
                gitStatus.untracked.length === 0 &&
                gitStatus.staged.length === 0 && (
                  <div className="p-3 text-center text-xs text-zinc-500">
                    Working tree clean. No uncommitted changes.
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
