import React, { useState, useEffect } from 'react';
import { Settings, Key, Sparkles, Check, Shield } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const SettingsPanel: React.FC = () => {
  const { token } = useAppStore();
  const [defaultProvider, setDefaultProvider] = useState('openai');
  const [defaultModel, setDefaultModel] = useState('gpt-4o');
  const [openaiKey, setOpenaiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [keysConfigured, setKeysConfigured] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/auth/ai-settings', { headers });
      if (res.ok) {
        const data = await res.json();
        setDefaultProvider(data.defaultProvider || 'openai');
        setDefaultModel(data.defaultModel || 'gpt-4o');
        setKeysConfigured(data.keysConfigured || {});
      }
    } catch {}
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/auth/ai-settings', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          defaultProvider,
          defaultModel,
          apiKeys: {
            openai: openaiKey || undefined,
            anthropic: anthropicKey || undefined,
            gemini: geminiKey || undefined,
            custom: customKey || undefined,
          },
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2500);
        fetchSettings();
      }
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="h-full flex flex-col bg-editor-sidebar select-none">
      <div className="h-9 px-3 border-b border-editor-border flex items-center text-xs font-semibold uppercase tracking-wider text-zinc-400">
        AI & Environment Settings
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="p-3 bg-editor-bg border border-editor-border rounded-lg space-y-2">
            <div className="flex items-center space-x-1.5 text-zinc-300 font-medium">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Default AI Provider</span>
            </div>
            <select
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-editor-sidebar border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500"
            >
              <option value="openai">OpenAI (GPT-4o, o3-mini)</option>
              <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
              <option value="gemini">Google Gemini (Gemini 2.5 Flash)</option>
              <option value="custom">Custom / Ollama / Local LLM</option>
            </select>
          </div>

          <div className="p-3 bg-editor-bg border border-editor-border rounded-lg space-y-3">
            <div className="flex items-center space-x-1.5 text-zinc-300 font-medium">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>Provider API Keys (AES-256-GCM Encrypted)</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Keys are encrypted at rest with server AES-256-GCM. They are never sent to the browser or logged.
            </p>

            <div className="space-y-2.5">
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>OpenAI API Key</span>
                  {keysConfigured.openai && <span className="text-emerald-400 text-[10px]">● Configured</span>}
                </div>
                <input
                  type="password"
                  placeholder={keysConfigured.openai ? 'sk-•••••••••••• (Leave blank to keep current)' : 'sk-proj-...'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-editor-sidebar border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Anthropic API Key</span>
                  {keysConfigured.anthropic && <span className="text-emerald-400 text-[10px]">● Configured</span>}
                </div>
                <input
                  type="password"
                  placeholder={keysConfigured.anthropic ? 'sk-ant-•••••••••••• (Leave blank to keep current)' : 'sk-ant-...'}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-editor-sidebar border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Google Gemini API Key</span>
                  {keysConfigured.gemini && <span className="text-emerald-400 text-[10px]">● Configured</span>}
                </div>
                <input
                  type="password"
                  placeholder={keysConfigured.gemini ? 'AIza•••••••••••• (Leave blank to keep current)' : 'AIzaSy...'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-editor-sidebar border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center justify-center space-x-1.5 transition-colors shadow"
          >
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Saved Successfully</span>
              </>
            ) : (
              <span>Save AI Settings</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
