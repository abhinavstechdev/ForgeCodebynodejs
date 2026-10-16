import React, { useState } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, X, CheckCheck, Undo2, ArrowRight } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface DiffViewerProps {
  proposalId: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ proposalId }) => {
  const {
    proposals,
    activeProposal,
    updateHunkStatus,
    applyProposal,
    undoFile,
  } = useAppStore();

  const proposal = proposals.find(p => p.id === proposalId) || activeProposal;
  const [isInline, setIsInline] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  if (!proposal) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
        Loading proposal diff...
      </div>
    );
  }

  const hunks = proposal.hunks || [];
  const acceptedCount = hunks.filter(h => h.status === 'accepted').length;
  const rejectedCount = hunks.filter(h => h.status === 'rejected').length;

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await applyProposal(proposal.id);
    } finally {
      setIsApplying(false);
    }
  };

  // Reconstruct proposed modified text from hunks
  const tab = useAppStore.getState().tabs.find(t => t.proposalId === proposal.id);
  const originalCode = tab?.originalContent || '';
  const proposedCode = tab?.content || '';

  return (
    <div className="h-full flex flex-col bg-editor-bg select-none">
      {/* Review Banner */}
      <div className="h-12 bg-editor-sidebar border-b border-editor-border px-4 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-white truncate max-w-sm">
            AI Patch Review: {proposal.filePath}
          </span>
          <span className="text-[11px] text-zinc-400">
            {hunks.length} hunks ({acceptedCount} accepted, {rejectedCount} rejected)
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsInline(!isInline)}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] border border-zinc-700"
          >
            {isInline ? 'Side-by-Side View' : 'Inline View'}
          </button>

          <button
            onClick={handleApply}
            disabled={isApplying}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center space-x-1.5 shadow"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>{isApplying ? 'Applying...' : 'Apply Approved Hunks'}</span>
          </button>

          <button
            onClick={() => undoFile(proposal.filePath)}
            className="px-2 py-1 rounded border border-editor-border hover:bg-editor-hover text-zinc-300 text-[11px] flex items-center space-x-1"
            title="Revert file to snapshot before patch"
          >
            <Undo2 className="w-3 h-3" />
            <span>Undo</span>
          </button>
        </div>
      </div>

      {/* Hunk Review Mini-Bar */}
      {hunks.length > 0 && (
        <div className="h-8 bg-zinc-900 border-b border-editor-border px-4 flex items-center space-x-2 overflow-x-auto text-[11px] shrink-0">
          <span className="text-zinc-400 font-semibold uppercase text-[10px] shrink-0">Hunks:</span>
          {hunks.map((hunk, index) => {
            const isAccepted = hunk.status === 'accepted';
            const isRejected = hunk.status === 'rejected';

            return (
              <div
                key={hunk.hunkId || index}
                className="flex items-center space-x-1 px-2 py-0.5 rounded bg-editor-sidebar border border-editor-border shrink-0"
              >
                <span className="text-zinc-300">
                  #{index + 1} (L{hunk.oldStartLine})
                </span>
                <button
                  onClick={() => updateHunkStatus(hunk.hunkId, isAccepted ? 'pending' : 'accepted')}
                  className={`p-0.5 rounded ${
                    isAccepted ? 'bg-emerald-600 text-white' : 'text-zinc-500 hover:text-emerald-400'
                  }`}
                  title="Accept Hunk"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => updateHunkStatus(hunk.hunkId, isRejected ? 'pending' : 'rejected')}
                  className={`p-0.5 rounded ${
                    isRejected ? 'bg-red-600 text-white' : 'text-zinc-500 hover:text-red-400'
                  }`}
                  title="Reject Hunk"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Monaco Diff Editor */}
      <div className="flex-1 relative overflow-hidden">
        <DiffEditor
          height="100%"
          original={originalCode}
          modified={proposedCode}
          language="typescript"
          theme="vs-dark"
          options={{
            renderSideBySide: !isInline,
            readOnly: true,
            fontFamily: '"JetBrains Mono", Consolas, monospace',
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false },
            automaticLayout: true,
            smoothScrolling: true,
          }}
        />
      </div>
    </div>
  );
};
