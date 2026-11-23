import { useState } from 'react';
import {
  Sparkles, ShieldAlert, Code2, Zap, ShieldCheck, Check, RotateCcw,
  Copy, GitPullRequest, Download, ExternalLink, Maximize2, X, GitBranch, Info,
} from 'lucide-react';
import api from '../lib/api';

const MODES = [
  {
    id: 'security',
    label: 'Fix Security',
    icon: ShieldAlert,
    en: 'Patches security vulnerabilities (SQL/NoSQL injection, XSS, weak auth, hardcoded secrets) and sanitizes user inputs without changing core logic.',
    si: 'ආරක්ෂක දුර්වලතා (Injection, XSS, දුර්වල Auth, Hardcoded secrets) නිවැරදි කර user inputs ආරක්ෂිතව පරීක්ෂා (sanitize) කරයි.',
  },
  {
    id: 'clean',
    label: 'Clean & SOLID',
    icon: Code2,
    en: 'Breaks down large functions into smaller reusable helpers, improves variable naming, removes duplication, and applies SOLID design principles.',
    si: 'දිගු functions කුඩා කොටස් වලට වෙන් කර, පැහැදිලි නම් (naming) යොදා, අනවශ්‍ය නැවත ලිවීම් ඉවත් කර SOLID මූලධර්ම අනුව code එක පිරිසිදු කරයි.',
  },
  {
    id: 'modernize',
    label: 'Modernize',
    icon: Zap,
    en: 'Upgrades legacy callbacks or Promise chains to clean async/await, modern ES6+ syntax (optional chaining, destructuring), and modern standard APIs.',
    si: 'පැරණි callbacks සහ Promise chains වෙනුවට නවීන async/await සහ ES6+ ක්‍රම (optional chaining, destructuring) යොදා code එක අලුත් කරයි.',
  },
  {
    id: 'resilience',
    label: 'Resilience',
    icon: ShieldCheck,
    en: 'Adds proper try/catch error handling, null/undefined boundary checks, safe fallbacks, and meaningful HTTP/error responses to prevent crashes.',
    si: 'හදිසි crash වීම් වැළැක්වීමට try/catch error handling, null/undefined පරීක්ෂා සහ පැහැදිලි error responses එකතු කරයි.',
  },
];

// Simple line-by-line LCS diff generator for visual comparison
const computeLineDiff = (oldText, newText) => {
  const a = (oldText || '').split('\n');
  const b = (newText || '').split('\n');
  const m = a.length;
  const n = b.length;

  if (m * n > 250000) {
    return [
      ...a.map((line) => ({ type: 'del', line })),
      ...b.map((line) => ({ type: 'add', line })),
    ];
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', line: a[i++] });
    } else {
      out.push({ type: 'add', line: b[j++] });
    }
  }
  while (i < m) out.push({ type: 'del', line: a[i++] });
  while (j < n) out.push({ type: 'add', line: b[j++] });
  return out;
};

// Sanitize user-entered Git branch name
const sanitizeBranchName = (raw) =>
  raw
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9/_.-]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^[/.]+|[/.]+$/g, '');

export default function RefactorPanel({
  selectedNode,
  shortPath,
  appliedPatches,
  onApplyPatch,
  onRevertPatch,
  onDownloadZip,
  repoMeta,
  githubToken,
  onConnectGithub,
  onUnauthorized,
}) {
  const [mode, setMode] = useState('security');
  const [goalInfoLang, setGoalInfoLang] = useState('en');
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('diff');
  const [copied, setCopied] = useState(false);
  const [diffModalOpen, setDiffModalOpen] = useState(false);

  // GitHub Pull Request push state
  const [customBranch, setCustomBranch] = useState('');
  const [prBusy, setPrBusy] = useState(false);
  const [prResult, setPrResult] = useState(null);
  const [prError, setPrError] = useState('');

  const patchCount = Object.keys(appliedPatches).length;
  const activePatch = selectedNode ? appliedPatches[selectedNode.id] : null;
  const cacheKey = selectedNode ? `${selectedNode.id}:${mode}` : '';
  const result = results[cacheKey] || null;
  const activeModeObj = MODES.find((m) => m.id === mode) || MODES[0];

  const originalCode = activePatch
    ? activePatch.originalCode
    : selectedNode?.data.code || selectedNode?.data.codeSnippet || '';

  const handleRefactor = async () => {
    if (!selectedNode || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/ai/refactor', {
        fileName: selectedNode.data.label,
        path: shortPath(selectedNode.data.path),
        code: originalCode,
        mode,
        findings: activePatch ? activePatch.originalFindings : selectedNode.data.findings || [],
      });
      if (res.data.success) {
        setResults((prev) => ({
          ...prev,
          [cacheKey]: {
            summary: res.data.summary,
            changes: res.data.changes || [],
            refactoredCode: res.data.refactoredCode,
          },
        }));
      }
    } catch (err) {
      if (err.response?.status === 401) return onUnauthorized();
      setError(err.response?.data?.error || 'Failed to refactor code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (text) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handlePushPR = async () => {
    if (prBusy || patchCount === 0) return;
    setPrBusy(true);
    setPrError('');
    setPrResult(null);
    try {
      const files = Object.values(appliedPatches).map((p) => ({
        path: p.path,
        code: p.patchedCode,
      }));
      const cleanBranch = sanitizeBranchName(customBranch);
      const res = await api.post('/parser/push-pr', {
        repo: repoMeta.repo,
        baseBranch: repoMeta.branch,
        newBranch: cleanBranch || undefined,
        files,
        githubToken,
      });
      if (res.data.success) {
        setPrResult(res.data);
      }
    } catch (err) {
      if (err.response?.status === 401) return onUnauthorized();
      setPrError(err.response?.data?.error || 'Failed to create Pull Request on GitHub.');
    } finally {
      setPrBusy(false);
    }
  };

  const renderDiffView = (large = false) => {
    if (!result) return null;
    const diffLines = computeLineDiff(originalCode, result.refactoredCode);
    return (
      <div className={`font-mono text-[11px] leading-5 overflow-auto rounded-lg border border-slate-800 bg-slate-950 ${large ? 'max-h-[65vh]' : 'max-h-64'}`}>
        {viewMode === 'diff' ? (
          diffLines.map((d, idx) => (
            <div
              key={idx}
              className={`flex px-2 ${
                d.type === 'add'
                  ? 'bg-emerald-500/15 text-emerald-200'
                  : d.type === 'del'
                  ? 'bg-red-500/15 text-red-300 line-through opacity-80'
                  : 'text-slate-400'
              }`}
            >
              <span className="w-5 shrink-0 select-none opacity-70">
                {d.type === 'add' ? '+' : d.type === 'del' ? '-' : ' '}
              </span>
              <span className="whitespace-pre">{d.line}</span>
            </div>
          ))
        ) : (
          <pre className="p-3 text-slate-200 whitespace-pre">{result.refactoredCode}</pre>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sandbox Export & GitHub PR Banner */}
      {patchCount > 0 && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-300">
              Sandbox Active: {patchCount} file{patchCount > 1 ? 's' : ''} patched
            </p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200">
              Live Preview
            </span>
          </div>

          {/* Developer Custom Branch Name Input */}
          {repoMeta?.source === 'github' && repoMeta?.repo && githubToken && (
            <div className="space-y-1">
              <label className="text-[11px] text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                Target PR Branch Name <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="text"
                value={customBranch}
                onChange={(e) => setCustomBranch(e.target.value)}
                placeholder="e.g. fix/auth-security-patch"
                className="w-full h-8 px-2.5 rounded-lg border border-emerald-500/30 bg-slate-950/80 text-xs font-mono text-slate-100 placeholder:text-slate-500 outline-none focus:border-emerald-400"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-2">
            {repoMeta?.source === 'github' && repoMeta?.repo && (
              <button
                type="button"
                onClick={handlePushPR}
                disabled={prBusy || !githubToken}
                title={!githubToken ? 'Sign in with GitHub to create Pull Requests' : 'Create branch & open Pull Request'}
                className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <GitPullRequest className="w-4 h-4" />
                {prBusy ? 'Creating Pull Request...' : 'Push Fixes as GitHub PR'}
              </button>
            )}

            <button
              type="button"
              onClick={onDownloadZip}
              className="w-full py-2 px-3 rounded-lg border border-emerald-500/40 hover:bg-emerald-500/10 text-xs font-medium text-emerald-200 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Patched Project (.zip)
            </button>
          </div>

          {!githubToken && repoMeta?.source === 'github' && (
            <button
              type="button"
              onClick={onConnectGithub}
              className="w-full py-1.5 px-3 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-[11px] font-medium text-indigo-200 flex items-center justify-center gap-1.5"
            >
              Connect GitHub Account to Push PR
            </button>
          )}

          {prError && (
            <p role="alert" className="text-xs text-red-300 bg-red-950/50 border border-red-900/60 rounded p-2">
              {prError}
            </p>
          )}

          {prResult && (
            <div className="rounded-lg border border-emerald-500/40 bg-slate-950/70 p-2.5 text-xs space-y-1">
              <p className="text-emerald-300 font-medium">Pull Request #{prResult.prNumber} created!</p>
              <p className="text-[11px] text-slate-400 font-mono">Branch: {prResult.branch}</p>
              <a
                href={prResult.prUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-indigo-300 hover:underline pt-1"
              >
                Open Pull Request on GitHub <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}

      {!selectedNode ? (
        <p className="text-sm text-slate-500">
          Select a file from the dependency graph or file tree to refactor and test fixes in the live sandbox.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{selectedNode.data.label}</p>
              <p className="text-[11px] text-slate-400 truncate">{shortPath(selectedNode.data.path)}</p>
            </div>
            {activePatch && (
              <button
                type="button"
                onClick={() => onRevertPatch(selectedNode.id)}
                className="shrink-0 px-2.5 py-1 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-xs flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Revert
              </button>
            )}
          </div>

          {/* Goal Preset Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-slate-400">Refactoring Goal</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setGoalInfoLang('en')}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    goalInfoLang === 'en'
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setGoalInfoLang('si')}
                  className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                    goalInfoLang === 'si'
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  සිංහල
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    mode === id
                      ? 'border-indigo-500 bg-indigo-500/15 text-white'
                      : 'border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-medium">
                    <Icon className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                    <span className="truncate">{label}</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Bilingual Explanation Box for the Selected Goal */}
            <div className="rounded-lg border border-white/10 bg-slate-950/60 p-2.5 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 min-w-0">
                <p className="text-[11px] font-semibold text-indigo-200">{activeModeObj.label}</p>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {goalInfoLang === 'si' ? activeModeObj.si : activeModeObj.en}
                </p>
              </div>
            </div>

            {/* Collapsible Guide for All 4 Refactoring Modes */}
            <details className="text-[11px] text-slate-400">
              <summary className="cursor-pointer text-indigo-300 hover:underline">
                {goalInfoLang === 'si' ? 'සියලුම විකල්ප 4 පිළිබඳ විස්තරය බලන්න' : 'Compare all 4 refactoring goals'}
              </summary>
              <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-slate-950/70 p-2.5">
                {MODES.map((m) => (
                  <div key={m.id} className="space-y-0.5">
                    <p className="font-semibold text-slate-200">{m.label}</p>
                    <p className="text-slate-400 leading-relaxed">{goalInfoLang === 'si' ? m.si : m.en}</p>
                  </div>
                ))}
              </div>
            </details>
          </div>

          <button
            type="button"
            onClick={handleRefactor}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 font-medium py-2.5 rounded-xl text-sm disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {busy ? 'Generating Refactored Code...' : 'Generate AI Refactor'}
          </button>

          {error && (
            <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-3 rounded-xl border border-indigo-800/50 bg-indigo-950/25 p-3">
              <p className="text-xs text-slate-200 leading-relaxed">{result.summary}</p>

              {/* Diff / Full Code Controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode('diff')}
                    className={`px-2 py-1 rounded-md ${viewMode === 'diff' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    Visual Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('code')}
                    className={`px-2 py-1 rounded-md ${viewMode === 'code' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
                  >
                    Clean Code
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCopy(result.refactoredCode)}
                    title="Copy refactored code"
                    className="p-1.5 rounded-md border border-slate-800 text-slate-400 hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiffModalOpen(true)}
                    title="Expand diff view"
                    className="p-1.5 rounded-md border border-slate-800 text-slate-400 hover:text-white"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {renderDiffView(false)}

              {/* Apply / Revert Sandbox Simulation Button */}
              {activePatch?.patchedCode === result.refactoredCode ? (
                <button
                  type="button"
                  onClick={() => onRevertPatch(selectedNode.id)}
                  className="w-full py-2 rounded-lg border border-amber-500/50 bg-amber-500/10 text-amber-200 text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Applied in Preview · Revert to Original
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onApplyPatch(selectedNode.id, result.refactoredCode)}
                  className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Apply Fix to Preview
                </button>
              )}

              {/* Educational Breakdown for Junior Developers */}
              {result.changes.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                    Why Each Change Matters
                  </p>
                  {result.changes.map((c, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-800 bg-slate-950/70 p-2 space-y-0.5">
                      <p className="text-xs font-medium text-slate-100">{c.title}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{c.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Full-Screen Diff Modal */}
      {diffModalOpen && result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setDiffModalOpen(false)}
        >
          <div className="w-full max-w-4xl rounded-2xl border border-blue-500/30 bg-[#0a1030] p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">{selectedNode?.data.label} — Diff Comparison</p>
              <button
                type="button"
                onClick={() => setDiffModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderDiffView(true)}
          </div>
        </div>
      )}
    </div>
  );
}