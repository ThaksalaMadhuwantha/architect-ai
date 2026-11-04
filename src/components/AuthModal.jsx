import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Mail, Lock, Eye, EyeOff, User, Check,
  FileCode, ShieldCheck, Sparkles, Network,
} from 'lucide-react';
import Logo from './Logo';
import { useAuth } from '../context/AuthContext';

const GithubIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const perks = [
  { icon: FileCode, text: 'Analyze code architecture' },
  { icon: ShieldCheck, text: 'Detect security vulnerabilities' },
  { icon: Sparkles, text: 'Get AI-powered refactoring' },
  { icon: Network, text: 'Visualize your codebase' },
];

export default function AuthModal({ open, mode, setMode, onClose }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const isSignUp = mode === 'signup';

  const switchMode = () => {
    setError('');
    setMode(isSignUp ? 'signin' : 'signup');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) await register(name, email, password, remember);
      else await login(email, password, remember);
      onClose();
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.message || 'Server එකට සම්බන්ධ වෙන්න බැරි වුණා. Backend run වෙනවද බලන්න.');
    } finally {
      setLoading(false);
    }
  };

  const inputWrap =
    'flex items-center gap-3 px-3.5 h-11 rounded-lg border border-slate-700/80 bg-slate-950/60 focus-within:border-blue-500 transition-colors';
  const inputCls = 'flex-1 bg-transparent outline-none text-sm text-slate-100 placeholder:text-slate-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl grid md:grid-cols-2 rounded-2xl overflow-hidden border border-blue-500/40 bg-[#070b1f] shadow-[0_0_60px_rgba(59,89,255,0.25)]">
        {/* Left panel */}
        <div className="hidden md:flex flex-col justify-between p-8 bg-gradient-to-b from-[#0a1030] to-[#0b1a5c]/60 border-r border-blue-500/30">
          <div>
            <Logo size={32} />
            <h2 className="mt-10 text-2xl font-semibold text-white">
              {isSignUp ? 'Join ArchitectAI' : 'Welcome Back!'}
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              {isSignUp
                ? 'Create your account to start analyzing your codebase.'
                : 'Sign in to continue to your code analysis workspace.'}
            </p>
          </div>
          <ul className="space-y-4 mt-10">
            {perks.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-blue-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Right panel */}
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>

          <div>
            <h3 className="text-2xl font-semibold text-white">{isSignUp ? 'Sign Up' : 'Sign In'}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {isSignUp ? 'Create your ArchitectAI account.' : 'Welcome back! Please sign in to your account.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setError('GitHub login තවම සූදානම් නැහැ. දැනට email එකෙන් sign in වෙන්න.')}
            className="w-full h-11 flex items-center justify-center gap-2 rounded-lg border border-blue-500/50 text-sm font-medium text-white hover:bg-blue-500/10 transition-colors"
          >
            <GithubIcon className="w-5 h-5" /> Continue with GitHub
          </button>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="flex-1 h-px bg-slate-800" /> OR <div className="flex-1 h-px bg-slate-800" />
          </div>

          {isSignUp && (
            <div className={inputWrap}>
              <User className="w-4 h-4 text-slate-400" />
              <input
                className={inputCls}
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className={inputWrap}>
            <Mail className="w-4 h-4 text-slate-400" />
            <input
              type="email"
              className={inputCls}
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={inputWrap}>
            <Lock className="w-4 h-4 text-slate-400" />
            <input
              type={showPw ? 'text' : 'password'}
              className={inputCls}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
            <button type="button" onClick={() => setShowPw(!showPw)} className="text-slate-400 hover:text-white">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer select-none">
            <span
              className={`w-4 h-4 rounded border flex items-center justify-center ${
                remember ? 'bg-blue-600 border-blue-500' : 'border-slate-600'
              }`}
            >
              {remember && <Check className="w-3 h-3 text-white" />}
            </span>
            <input type="checkbox" className="sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-60"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign In'}
          </button>

          <p className="text-center text-sm text-slate-400">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button type="button" onClick={switchMode} className="text-blue-400 hover:underline">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
