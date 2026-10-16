import React, { useState } from 'react';
import { Code2, LogIn, UserPlus, Lock, Mail, User } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const AuthModal: React.FC = () => {
  const { authModalOpen, setAuthModalOpen, setUser, fetchProjects } = useAppStore();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!authModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { email, password, name };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      setUser(data.user, data.token);
      setAuthModalOpen(false);
      await fetchProjects();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-editor-sidebar border border-editor-border rounded-xl shadow-2xl w-full max-w-sm p-6 text-editor-text">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center mb-3">
            <Code2 className="w-6 h-6 text-blue-400" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">ForgeCode AI</h2>
          <p className="text-xs text-zinc-400 mt-1">
            {isLogin ? 'Sign in to access your cloud workspaces' : 'Create an account to start coding'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-2.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {!isLogin && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Your Name</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="Abhinav"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-editor-bg border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <User className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email Address</label>
            <div className="relative">
              <input
                type="email"
                required
                placeholder="developer@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-editor-bg border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1">Password</label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-editor-bg border border-editor-border rounded text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors shadow-lg shadow-blue-600/20 mt-2"
          >
            {isLogin ? <LogIn className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
            <span>{loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Free Account'}</span>
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-zinc-400 border-t border-editor-border pt-4">
          {isLogin ? (
            <span>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setErrorMsg('');
                }}
                className="text-blue-400 hover:underline font-medium"
              >
                Sign up
              </button>
            </span>
          ) : (
            <span>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setErrorMsg('');
                }}
                className="text-blue-400 hover:underline font-medium"
              >
                Sign in
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
