import { useEffect, useRef, useState } from 'react';
import { Sparkles, Send, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import api from '../lib/api';
import Markdown from './Markdown';

const STARTERS = [
  'How is this project structured?',
  'Which security issues should I fix first?',
  'How does authentication work here?',
];

export default function CodebaseChat({
  hasProject,
  projectName,
  stats,
  nodes,
  flow,
  arch,
  allFindings,
  selectedNode,
  shortPath,
  onUnauthorized,
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    if (open && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open, busy]);

  const sendQuestion = async (text) => {
    const q = (text ?? input).trim();
    if (!q || busy || !hasProject) return;

    setOpen(true);
    setInput('');
    setError('');
    const nextHistory = [...messages, { role: 'user', content: q }];
    setMessages(nextHistory);
    setBusy(true);

    try {
      const context = {
        projectName,
        stats,
        files: nodes.map((n) => shortPath(n.data.path)),
        endpoints: (flow?.endpoints || []).map((e) => ({
          method: e.method,
          path: e.path,
          protected: e.protected,
          controller: e.controller?.fn || e.controller?.text || '',
        })),
        findings: allFindings.map((f) => ({
          severity: f.severity,
          title: f.title,
          file: f.file,
          line: f.line,
        })),
        archIssues: (arch?.issues || []).map((a) => ({
          severity: a.severity,
          title: a.title,
          message: a.message,
        })),
        activeFile: selectedNode
          ? {
              path: shortPath(selectedNode.data.path),
              code: selectedNode.data.code || selectedNode.data.codeSnippet || '',
            }
          : null,
      };

      const res = await api.post('/ai/chat', {
        question: q,
        history: nextHistory.slice(-6),
        context,
      });

      if (res.data.success) {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
      }
    } catch (err) {
      if (err.response?.status === 401) return onUnauthorized();
      setError(err.response?.data?.error || 'Failed to get AI response.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendQuestion();
  };

  return (
    <div className="relative border-t border-blue-500/15 bg-[#070c24]">
      {/* Expandable Chat Drawer */}
      {open && (
        <div className="border-b border-blue-500/20 bg-[#080e2b] px-3 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Codebase AI Assistant</span>
              {selectedNode && (
                <span className="text-[11px] font-normal text-slate-400 truncate max-w-[180px]">
                  · Context: {selectedNode.data.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  title="Clear chat"
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Minimize chat"
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Ask questions about architecture, security risks, API routes, or the currently selected file.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sendQuestion(s)}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg px-3 py-2 text-xs ${
                    m.role === 'user'
                      ? 'ml-8 bg-indigo-600/25 border border-indigo-500/30 text-slate-100'
                      : 'mr-4 bg-slate-950/70 border border-slate-800 text-slate-200'
                  }`}
                >
                  {m.role === 'user' ? <p>{m.content}</p> : <Markdown text={m.content} />}
                </div>
              ))
            )}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-indigo-300 px-2">
                <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Analyzing codebase context...
              </div>
            )}
            {error && <p className="text-xs text-red-300 px-1">{error}</p>}
            <div ref={endRef} />
          </div>
        </div>
      )}

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => hasProject && setOpen(!open)}
          disabled={!hasProject}
          className="flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200 disabled:opacity-50 shrink-0"
          title={open ? 'Collapse AI Chat' : 'Expand AI Chat'}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium hidden sm:inline">AI RAG Chat</span>
          {hasProject && (open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />)}
        </button>

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => hasProject && setOpen(true)}
          disabled={!hasProject || busy}
          placeholder={hasProject ? 'Ask anything about this codebase...' : 'Load a project to chat with your codebase...'}
          className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-800 bg-slate-950/50 text-sm placeholder:text-slate-600 outline-none focus:border-indigo-500 disabled:opacity-50"
        />

        <button
          type="submit"
          disabled={!hasProject || busy || !input.trim()}
          className="h-9 w-10 shrink-0 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 flex items-center justify-center transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}