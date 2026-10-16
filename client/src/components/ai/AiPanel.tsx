import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Bot,
  User,
  GitCompare,
  CheckCheck,
  FileCode,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const AiPanel: React.FC = () => {
  const {
    messages,
    isAiGenerating,
    sendAiMessage,
    activeTabPath,
    selectedAIProvider,
    selectedAIModel,
    setSelectedAIProvider,
    setSelectedAIModel,
    openDiffForProposal,
    applyProposal,
    setActiveSidebar,
  } = useAppStore();

  const [inputPrompt, setInputPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiGenerating]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim() || isAiGenerating) return;
    const prompt = inputPrompt.trim();
    setInputPrompt('');
    await sendAiMessage(prompt);
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      {/* AI Panel Header */}
      <div className="h-9 px-3 border-b border-editor-border flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
        <div className="flex items-center space-x-1.5 text-blue-400">
          <Sparkles className="w-4 h-4" />
          <span>ForgeCode Copilot</span>
        </div>

        {/* Model Selector Dropdown */}
        <div className="flex items-center space-x-1">
          <select
            value={selectedAIModel}
            onChange={(e) => {
              const model = e.target.value;
              setSelectedAIModel(model);
              if (model.includes('claude')) setSelectedAIProvider('anthropic');
              else if (model.includes('gemini')) setSelectedAIProvider('gemini');
              else setSelectedAIProvider('openai');
            }}
            className="bg-editor-bg border border-editor-border rounded px-1.5 py-0.5 text-[11px] text-zinc-300 focus:outline-none"
          >
            <option value="gpt-4o">OpenAI GPT-4o</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
          </select>

          <button
            onClick={() => setActiveSidebar('settings')}
            className="p-1 hover:text-white rounded"
            title="Configure AI API Keys"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Editor Context Pill */}
      {activeTabPath && (
        <div className="px-3 py-1.5 bg-editor-bg border-b border-editor-border flex items-center justify-between text-[11px] text-zinc-400">
          <div className="flex items-center space-x-1.5 truncate">
            <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">Context: {activeTabPath}</span>
          </div>
          <span className="text-[10px] bg-blue-600/20 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">Active</span>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 select-text">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col space-y-1.5 ${
                isUser ? 'items-end' : 'items-start'
              }`}
            >
              <div className="flex items-center space-x-1.5 text-[10px] text-zinc-500 px-1">
                {isUser ? (
                  <>
                    <span>You</span>
                    <User className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3 text-blue-400" />
                    <span>ForgeCode AI</span>
                  </>
                )}
              </div>

              <div
                className={`p-3 rounded-lg text-xs leading-relaxed max-w-[95%] ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-tr-none'
                    : 'bg-editor-bg border border-editor-border text-zinc-200 rounded-tl-none font-sans whitespace-pre-wrap'
                }`}
              >
                {msg.content}

                {/* AI Proposed Patch Action Card */}
                {msg.proposalId && (
                  <div className="mt-3 p-2.5 bg-zinc-900 border border-blue-500/40 rounded-lg space-y-2">
                    <div className="flex items-center space-x-1.5 text-blue-400 font-semibold text-[11px]">
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>Targeted Patch Generated</span>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      Surgical line-by-line diff ready for visual inspection.
                    </p>
                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        onClick={() => openDiffForProposal(msg.proposalId!)}
                        className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium text-[11px] flex items-center space-x-1 shadow"
                      >
                        <GitCompare className="w-3 h-3" />
                        <span>Review Diff</span>
                      </button>
                      <button
                        onClick={() => applyProposal(msg.proposalId!)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-[11px] flex items-center space-x-1 shadow"
                      >
                        <CheckCheck className="w-3 h-3" />
                        <span>Apply Patch</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isAiGenerating && (
          <div className="flex items-center space-x-2 text-xs text-blue-400 italic py-2">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>ForgeCode AI is analyzing context and formulating patch...</span>
          </div>
        )}

        {messages.length === 0 && (
          <div className="p-4 text-center text-xs text-zinc-500 space-y-2">
            <Sparkles className="w-6 h-6 text-blue-500/40 mx-auto" />
            <p className="font-medium text-zinc-400">Ask ForgeCode AI to help you code</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              "Refactor this function to handle async errors", "Add input validation", or "Diagnose potential memory leaks".
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-editor-border bg-editor-bg">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            rows={3}
            placeholder="Ask AI Copilot to refactor, write, or fix code..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            className="w-full p-2.5 pr-10 bg-editor-sidebar border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-blue-500 resize-none font-sans"
          />
          <button
            type="submit"
            disabled={isAiGenerating || !inputPrompt.trim()}
            className="absolute right-2.5 bottom-3.5 p-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
