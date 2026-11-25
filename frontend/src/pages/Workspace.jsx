import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, Controls, MiniMap, Background, Handle, Position, useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import JSZip from 'jszip';
import {
  UploadCloud, FileCode, Folder, ChevronRight, ChevronDown, Search, Sparkles, LogOut,
  Lock, ShieldCheck, Network, Wrench, ArrowRightLeft, Code2, X, Maximize2, Minimize2, GitBranch,
  PanelLeftClose, PanelLeftOpen, Columns2, MessageSquare, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { saveWorkspaceDraft, loadWorkspaceDraft, clearWorkspaceDraft } from '../lib/workspaceDraft';
import Logo from '../components/Logo';
import Markdown from '../components/Markdown';
import RefactorPanel from '../components/RefactorPanel';
import CodebaseChat from '../components/CodebaseChat';

/* ---------- Graph Layout ---------- */
const W = 210, H = 56;

const commonRoot = (nodes) => {
  if (!nodes.length) return '';
  const first = nodes[0].data.path.split('/')[0];
  const all = nodes.every((n) => n.data.path.includes('/') && n.data.path.split('/')[0] === first);
  return all ? `${first}/` : '';
};

const getLayoutedElements = (nodes, edges) => {
  const root = commonRoot(nodes);
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 42, ranksep: 82 });
  nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      const folder = n.data.path.slice(root.length).split('/').slice(0, -1).join('/') || '/';
      return { ...n, type: 'file', data: { ...n.data, folder }, position: { x: p.x - W / 2, y: p.y - H / 2 } };
    }),
    edges,
  };
};

function FileNode({ data }) {
  const n = data.findings ? data.findings.length : 0;
  const sev = data.patched ? 'safe' : data.severity || (data.findings ? 'safe' : '');
  return (
    <div className={`file-node ${sev ? `sev-${sev}` : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <FileCode className="w-5 h-5 text-indigo-300 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{data.label}</p>
        <p className="truncate text-[10px] text-slate-500">{data.folder}</p>
      </div>
      {data.patched ? (
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">FIXED</span>
      ) : (
        n > 0 && <span className={`sev-badge sev-badge-${data.severity}`}>{n}</span>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { file: FileNode };

function ScoreRing({ score }) {
  const r = 26, c = 2 * Math.PI * r;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="64" height="64" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" fontSize="16" fontWeight="700" fill="#f1f5f9">{score}</text>
    </svg>
  );
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const SEV_WEIGHT = { high: 10, medium: 4, low: 1 };
const SEV_STYLE = {
  high: 'bg-red-500/15 text-red-300 border-red-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

/* ---------- File Tree ---------- */
const buildTree = (nodes, root) => {
  const tree = { children: {}, files: [] };
  nodes.forEach((n) => {
    let cur = tree;
    n.data.path.slice(root.length).split('/').slice(0, -1).forEach((d) => {
      cur = cur.children[d] ??= { children: {}, files: [] };
    });
    cur.files.push(n);
  });
  return tree;
};

function TreeFolder({ name, node, depth, selectedId, onSelect }) {
  const [open, setOpen] = useState(depth < 2);
  return (
    <div>
      {name && (
        <button className="tree-row" style={{ paddingLeft: depth * 12 + 8 }} onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Folder className="w-4 h-4 text-amber-400" /> {name}
        </button>
      )}
      {(open || !name) && (
        <>
          {Object.entries(node.children).sort().map(([n, c]) => (
            <TreeFolder key={n} name={n} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
          {[...node.files].sort((a, b) => a.data.label.localeCompare(b.data.label)).map((f) => (
            <button key={f.id} className={`tree-row ${selectedId === f.id ? 'active' : ''}`}
              style={{ paddingLeft: (depth + 1) * 12 + 22 }} onClick={() => onSelect(f.id)}>
              <FileCode className="w-4 h-4 text-indigo-300 shrink-0" />
              <span className="truncate">{f.data.label}</span>
              {f.data.patched && <span className="ml-auto text-[9px] text-emerald-400 font-semibold">FIXED</span>}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const LANGS = [['en', 'English'], ['si', 'සිංහල'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']];

const AGENTS = [
  { id: 'arch', label: 'Arch', icon: Network },
  { id: 'sec', label: 'Security', icon: ShieldCheck },
  { id: 'flow', label: 'Flow', icon: GitBranch },
  { id: 'ref', label: 'Refactor', icon: Wrench },
];

const CENTER_VIEWS = [
  { id: 'graph', label: 'Graph', icon: Network },
  { id: 'code', label: 'Code & Chat', icon: Code2 },
  { id: 'split', label: 'Split View', icon: Columns2 },
];

const METHOD_STYLE = {
  GET: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  POST: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  PUT: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  PATCH: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  DELETE: 'text-red-300 bg-red-500/10 border-red-500/30',
};
const KIND_STYLE = { auth: 'text-emerald-300', role: 'text-emerald-300', limiter: 'text-sky-300', validation: 'text-sky-300', upload: 'text-amber-300' };

const MOBILE_TABS = [
  ['files', 'Files', Folder],
  ['graph', 'Graph', Network],
  ['code', 'Code', Code2],
  ['ai', 'Inspect', Sparkles],
];

export default function Workspace() {
  const { user, githubToken, connectGithub, clearGithubToken, logout } = useAuth();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [mobileTab, setMobileTab] = useState('graph');
  const [graphFocus, setGraphFocus] = useState(false);
  const graphFocusTimer = useRef(null);
  const [centerView, setCenterView] = useState('graph');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [avatarErr, setAvatarErr] = useState(false);
  const [workspaceNotice, setWorkspaceNotice] = useState(null);

  // Project loader state
  const loadRef = useRef(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [source, setSource] = useState('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [projectName, setProjectName] = useState('');
  const [repoMeta, setRepoMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [truncated, setTruncated] = useState(false);

  // Sandbox patches state
  const [appliedPatches, setAppliedPatches] = useState({});

  // AI Audit state
  const [analyses, setAnalyses] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [lang, setLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Security scan state
  const [agent, setAgent] = useState('arch');
  const [scan, setScan] = useState(null);
  const [onlyFile, setOnlyFile] = useState(false);
  const [focusLine, setFocusLine] = useState(null);
  const focusRef = useRef(null);

  // Endpoint flow map state
  const [flow, setFlow] = useState(null);
  const [activeEp, setActiveEp] = useState(null);

  // Architecture health state
  const [arch, setArch] = useState(null);
  const [archHl, setArchHl] = useState(null);

  // Dependency CVE scan (OSV) state
  const [deps, setDeps] = useState({ status: 'idle' });
  const [depsDirectOnly, setDepsDirectOnly] = useState(true);
  const [depsInfoLang, setDepsInfoLang] = useState('en');
  const depsToken = useRef(0);

  // AI Mentor state
  const [mentorLang, setMentorLang] = useState('en');
  const [mentor, setMentor] = useState({});
  const [mentorBusy, setMentorBusy] = useState('');
  const [mentorError, setMentorError] = useState('');

  // Auto-restore workspace and applied patches after returning from GitHub OAuth
  useEffect(() => {
    let active = true;
    loadWorkspaceDraft().then(async (draft) => {
      if (!active || !draft || !draft.nodes?.length) return;
      setNodes(draft.nodes);
      setEdges(draft.edges || []);
      setSelectedId(draft.selectedId || null);
      setAppliedPatches(draft.appliedPatches || {});
      setAnalyses(draft.analyses || {});
      setTruncated(!!draft.truncated);
      setScan(draft.scan || null);
      setFlow(draft.flow || null);
      setArch(draft.arch || null);
      setDeps(draft.deps || { status: 'idle' });
      setRepoMeta(draft.repoMeta || null);
      setRepoUrl(draft.repoUrl || '');
      setBranch(draft.branch || '');
      setProjectName(draft.projectName || '');
      setAgent(draft.agent || 'ref');
      setCenterView(draft.centerView || 'graph');

      const restoredPatchCount = Object.keys(draft.appliedPatches || {}).length;
      setWorkspaceNotice({
        type: 'success',
        text:
          restoredPatchCount > 0
            ? `GitHub connected! Restored your project and ${restoredPatchCount} patched file(s). Ready to create your PR.`
            : 'GitHub connected! Your project workspace has been restored.',
      });
      await clearWorkspaceDraft();
    });
    return () => { active = false; };
  }, [setNodes, setEdges]);

  // Save current workspace state before redirecting to GitHub OAuth
  const handleConnectGithub = async () => {
    if (nodes.length > 0) {
      await saveWorkspaceDraft({
        nodes,
        edges,
        selectedId,
        appliedPatches,
        analyses,
        truncated,
        scan,
        flow,
        arch,
        deps,
        repoMeta,
        repoUrl,
        branch,
        projectName,
        agent,
        centerView,
      });
    }
    await connectGithub();
  };

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;
  const analysis = analyses[selectedId] || {};
  const aiAnalysis = analysis[lang] || '';
  const root = useMemo(() => commonRoot(nodes), [nodes]);
  const tree = useMemo(() => buildTree(nodes, root), [nodes, root]);
  const short = (p) => p.slice(root.length);

  const allFindings = useMemo(
    () =>
      nodes
        .flatMap((n) => (n.data.findings || []).map((f) => ({ ...f, nodeId: n.id, file: n.data.path.slice(root.length) })))
        .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]),
    [nodes, root]
  );

  const liveScan = useMemo(() => {
    if (!scan) return null;
    const counts = { high: 0, medium: 0, low: 0 };
    allFindings.forEach((f) => { counts[f.severity] += 1; });
    const penalty = counts.high * SEV_WEIGHT.high + counts.medium * SEV_WEIGHT.medium + counts.low * SEV_WEIGHT.low;
    const score = Math.max(0, 100 - penalty);
    return {
      ...scan,
      score,
      label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At risk',
      counts,
      total: allFindings.length,
    };
  }, [scan, allFindings]);

  const shownFindings = onlyFile && selectedNode ? allFindings.filter((f) => f.nodeId === selectedNode.id) : allFindings;
  const matches = query.trim()
    ? nodes.filter((n) => n.data.path.toLowerCase().includes(query.trim().toLowerCase()))
    : null;

  const stats = useMemo(() => {
    const inDeg = {};
    edges.forEach((e) => { inDeg[e.target] = (inDeg[e.target] || 0) + 1; });
    let hub = null;
    nodes.forEach((n) => {
      if ((inDeg[n.id] || 0) > (hub?.count || 0)) hub = { label: n.data.label, count: inDeg[n.id] };
    });
    return { files: nodes.length, loc: nodes.reduce((s, n) => s + (n.data.lines || 0), 0), deps: edges.length, hub };
  }, [nodes, edges]);

  useEffect(() => {
    if (focusLine && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [focusLine, selectedId, centerView]);

  useEffect(() => {
    if (!loadOpen && !auditOpen) return;
    const onDown = (e) => {
      if (loadOpen && loadRef.current && !loadRef.current.contains(e.target)) setLoadOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { setLoadOpen(false); setAuditOpen(false); }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [loadOpen, auditOpen]);

  const handleLogout = () => { logout(); navigate('/'); };

  const handleGraphInteractStart = () => {
    if (window.innerWidth >= 1024 || mobileTab !== 'graph' || nodes.length === 0) return;
    if (graphFocusTimer.current) clearTimeout(graphFocusTimer.current);
    setGraphFocus(true);
  };

  const handleGraphInteractEnd = () => {
    if (window.innerWidth >= 1024) return;
    if (graphFocusTimer.current) clearTimeout(graphFocusTimer.current);
    graphFocusTimer.current = setTimeout(() => setGraphFocus(false), 2200);
  };

  useEffect(() => {
    return () => {
      if (graphFocusTimer.current) clearTimeout(graphFocusTimer.current);
    };
  }, []);

  const handleMobileTabChange = (tabId) => {
    if (graphFocusTimer.current) clearTimeout(graphFocusTimer.current);
    setGraphFocus(false);
    setMobileTab(tabId);
  };

  const selectFile = (id, openCodeView = false) => {
    setSelectedId(id);
    setLang('en');
    setAiError('');
    setFocusLine(null);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    if (openCodeView && centerView === 'graph') {
      setCenterView('split');
    }
    if (window.innerWidth < 1024) handleMobileTabChange('code');
  };

  const handleApplyPatch = (nodeId, patchedCode) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;

    const existing = appliedPatches[nodeId];
    const patchRecord = {
      path: target.data.path,
      originalCode: existing ? existing.originalCode : target.data.code || target.data.codeSnippet || '',
      patchedCode,
      originalFindings: existing ? existing.originalFindings : target.data.findings || [],
      originalSeverity: existing ? existing.originalSeverity : target.data.severity || '',
      originalLines: existing ? existing.originalLines : target.data.lines || 0,
    };

    setAppliedPatches((prev) => ({ ...prev, [nodeId]: patchRecord }));
    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                code: patchedCode,
                lines: patchedCode.split('\n').length,
                findings: [],
                severity: '',
                patched: true,
              },
            }
          : n
      )
    );
  };

  const handleRevertPatch = (nodeId) => {
    const patch = appliedPatches[nodeId];
    if (!patch) return;

    setAppliedPatches((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });

    setNodes((ns) =>
      ns.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                code: patch.originalCode,
                lines: patch.originalLines,
                findings: patch.originalFindings,
                severity: patch.originalSeverity,
                patched: false,
              },
            }
          : n
      )
    );
  };

  const handleDownloadPatchedZip = async () => {
    const zip = new JSZip();
    nodes.forEach((n) => {
      const relPath = short(n.data.path);
      const content = n.data.code || n.data.codeSnippet || '';
      zip.file(relPath, content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectName || 'architect-ai-project').replace(/[^a-z0-9-_]/gi, '_')}_patched.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const startDepsScan = async (manifests) => {
    const token = ++depsToken.current;
    const map = new Map();
    (manifests || []).forEach((m) => m.packages.forEach((p) => {
      const k = `${p.name}@${p.version}`;
      if (!map.has(k)) map.set(k, p);
    }));
    const packages = [...map.values()];
    if (!packages.length) { setDeps({ status: 'none' }); return; }
    setDeps({ status: 'loading' });
    try {
      const res = await api.post('/deps/scan', { packages });
      if (token === depsToken.current) setDeps({ status: 'done', data: res.data.data });
    } catch (err) {
      if (token === depsToken.current) setDeps({ status: 'error', error: err.response?.data?.error || 'Dependency scan failed.' });
    }
  };

  const applyGraph = (data, meta, name, activeBranch = '') => {
    const l = getLayoutedElements(data.nodes, data.edges);
    setNodes(l.nodes);
    setEdges(l.edges);
    setSelectedId(null);
    setAnalyses({});
    setAppliedPatches({});
    setTruncated(!!meta?.truncated);
    setScan(meta?.scan || null);
    setFlow(meta?.flow || null);
    setArch(meta?.arch || null);
    setArchHl(null);
    setActiveEp(null);
    setRepoMeta(meta?.source === 'github' ? { source: 'github', repo: meta.repo, branch: activeBranch } : { source: 'zip' });
    startDepsScan(meta?.manifests);
    setAgent(meta?.scan ? 'sec' : 'arch');
    setCenterView('graph');
    setProjectName(name);
    setLoadOpen(false);
    handleMobileTabChange('graph');

    // Clear stale GitHub token if backend reported it expired during a public repo fallback
    const hasValidGithub = !!githubToken && !meta?.tokenExpired;
    if (meta?.tokenExpired) {
      clearGithubToken();
    }

    if (meta?.source === 'github' && !hasValidGithub) {
      setWorkspaceNotice({
        type: 'warning',
        text: 'Public repository loaded without GitHub access. You can analyze, chat, refactor, and download ZIP — connect GitHub when you are ready to open a Pull Request.',
      });
    } else {
      setWorkspaceNotice(null);
    }
  };

  const handleRequestError = (err, fallback) => {
    console.error(err);
    const status = err.response?.status;
    const msg = err.response?.data?.error || '';
    const code = err.response?.data?.code || '';

    // Clear expired GitHub token instead of logging out of the Google/Email session
    if (status === 401 && (code === 'GITHUB_TOKEN_EXPIRED' || msg.toLowerCase().includes('github'))) {
      clearGithubToken();
      setErrorCode(code || 'GITHUB_TOKEN_EXPIRED');
      setError(msg || 'Your GitHub session has expired. Reconnect GitHub to access private repositories.');
      return;
    }

    if (status === 401) {
      return handleLogout();
    }

    setErrorCode(code);
    setError(msg || fallback);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setErrorCode('');
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/parser/upload', formData);
      if (res.data.success) applyGraph(res.data.data, res.data.meta, file.name);
    } catch (err) {
      handleRequestError(err, 'Failed to upload and parse ZIP file.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubSubmit = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim() || loading) return;
    setError('');
    setErrorCode('');
    setLoading(true);
    const trimmedBranch = branch.trim();
    try {
      const res = await api.post('/parser/github', {
        repoUrl: repoUrl.trim(),
        branch: trimmedBranch || undefined,
        githubToken: githubToken || undefined,
      });
      if (res.data.success) applyGraph(res.data.data, res.data.meta, res.data.meta?.repo || repoUrl.trim(), trimmedBranch);
    } catch (err) {
      handleRequestError(err, 'Failed to analyze GitHub repository.');
    } finally {
      setLoading(false);
    }
  };

  const handleAIAnalysis = async () => {
    if (!selectedNode) return;
    const id = selectedNode.id;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await api.post('/ai/analyze', {
        fileName: selectedNode.data.label,
        path: selectedNode.data.path,
        codeSnippet: (selectedNode.data.code || selectedNode.data.codeSnippet || '').slice(0, 4000),
      });
      if (res.data.success) {
        setAnalyses((a) => ({ ...a, [id]: { en: res.data.analysis } }));
        setLang('en');
      }
    } catch (err) {
      if (err.response?.status === 401) return handleLogout();
      setAiError(err.response?.data?.error || 'Unable to get AI Analysis. Check backend logs.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleLang = async (code, force = false) => {
    setLang(code);
    setAiError('');
    if (code === 'en' || !selectedNode || (analysis[code] && !force)) return;

    const id = selectedNode.id;
    setTranslating(true);
    try {
      const res = await api.post('/ai/translate', { text: analysis.en, language: code });
      if (res.data.success) {
        setAnalyses((a) => ({ ...a, [id]: { ...a[id], [code]: res.data.translation } }));
      }
    } catch (err) {
      if (err.response?.status === 401) return handleLogout();
      setAiError(
        err.response?.data?.error ||
          (err.response
            ? `Translation request failed (HTTP ${err.response.status}). Ensure backend is running.`
            : 'Unable to connect to backend server.')
      );
      setLang('en');
    } finally {
      setTranslating(false);
    }
  };

  const openFinding = (f) => {
    selectFile(f.nodeId, true);
    setFocusLine(f.line);
  };
  const lineSev = {};
  (selectedNode?.data.findings || []).forEach((f) => {
    if (!lineSev[f.line] || SEV_ORDER[f.severity] < SEV_ORDER[lineSev[f.line]]) lineSev[f.line] = f.severity;
  });

  const epSet = useMemo(() => (activeEp ? new Set(activeEp.nodeIds) : archHl ? new Set(archHl.nodeIds) : null), [activeEp, archHl]);
  const displayNodes = useMemo(
    () => (epSet ? nodes.map((n) => ({ ...n, className: epSet.has(n.id) ? 'ep-on' : 'ep-dim' })) : nodes),
    [nodes, epSet]
  );
  const displayEdges = useMemo(
    () =>
      epSet
        ? edges.map((e) =>
            epSet.has(e.source) && epSet.has(e.target)
              ? { ...e, animated: true, style: { stroke: '#818cf8', strokeWidth: 3 } }
              : { ...e, style: { ...e.style, opacity: 0.1 } })
        : edges,
    [edges, epSet]
  );

  const groups = Object.values(
    shownFindings.reduce((m, f) => {
      (m[f.rule] ||= { rule: f.rule, title: f.title, cwe: f.cwe, fix: f.fix, severity: f.severity, items: [] }).items.push(f);
      return m;
    }, {})
  ).sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.items.length - a.items.length);

  const mkey = (f) => `${f.nodeId}-${f.rule}-${f.line}|${mentorLang}`;
  const askMentor = async (f) => {
    const key = mkey(f);
    if (mentor[key] || mentorBusy) return;
    setMentorError('');
    setMentorBusy(key);
    const secretRule = ['hardcoded-secret', 'jwt-hardcoded', 'secret-fallback'].includes(f.rule);
    const node = nodes.find((n) => n.id === f.nodeId);
    const all = (node?.data.code || '').split('\n');
    const from = Math.max(0, f.line - 8);
    const context = secretRule
      ? f.snippet
      : all.slice(from, Math.min(all.length, f.line + 7)).map((l, i) => `${from + i + 1}: ${l}`).join('\n');
    try {
      const res = await api.post('/ai/mentor', {
        title: f.title, message: f.message, fix: f.fix, example: f.example, cwe: f.cwe,
        fileName: f.file, line: f.line, context, language: mentorLang,
      });
      if (res.data.success) setMentor((m) => ({ ...m, [key]: res.data.mentor }));
    } catch (err) {
      if (err.response?.status === 401) return handleLogout();
      setMentorError(err.response?.data?.error || 'Failed to load Mentor explanation.');
    } finally {
      setMentorBusy('');
    }
  };

  const openEndpoint = (ep) => {
    setArchHl(null);
    setActiveEp(ep);
    if (ep.routeNodeId) {
      selectFile(ep.routeNodeId);
      setFocusLine(ep.line);
    }
  };

  const flowPanel = !flow || flow.endpoints.length === 0 ? (
    <p className="text-sm text-slate-500">
      {flow ? 'No Express endpoints found (project has no router.get / router.post definitions).' : 'Load a project to automatically generate the endpoint map.'}
    </p>
  ) : (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Endpoints', flow.stats.total, 'text-white'], ['Protected', flow.stats.protected, 'text-emerald-300'], ['Open', flow.stats.open, flow.stats.open ? 'text-red-300' : 'text-slate-300']].map(([k, v, c]) => (
          <div key={k} className="rounded-xl border border-white/10 bg-slate-950/60 py-2">
            <p className={`text-lg font-bold ${c}`}>{v}</p>
            <p className="text-[11px] text-slate-400">{k}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">
        Click an endpoint to highlight its execution path (route → middleware → controller → model) on the graph. Public by design: {flow.stats.public}.
      </p>
      {activeEp && (
        <button onClick={() => setActiveEp(null)} className="text-xs text-indigo-300 hover:underline">Clear highlight</button>
      )}
      {flow.endpoints.map((ep) => (
        <button key={ep.id} onClick={() => openEndpoint(ep)}
          className={`w-full text-left rounded-xl border p-2.5 space-y-1 transition-colors ${activeEp?.id === ep.id ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-slate-950/50 hover:border-white/20'}`}>
          <div className="flex items-center gap-2">
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${METHOD_STYLE[ep.method] || METHOD_STYLE.GET}`}>{ep.method}</span>
            <span className="text-xs font-mono break-all flex-1">{ep.path}</span>
            {ep.protected ? <Lock className="w-3.5 h-3.5 text-emerald-300 shrink-0" /> : !ep.public && <span className="text-[10px] font-semibold text-red-300 shrink-0">OPEN</span>}
          </div>
          {activeEp?.id === ep.id && (
            <div className="text-[11px] space-y-0.5 pt-1">
              {ep.middleware.filter((m) => m.kind !== 'other').map((m, i) => (
                <p key={i} className={KIND_STYLE[m.kind] || 'text-slate-400'}>↳ {m.kind}: {m.text}</p>
              ))}
              <p className="text-indigo-300">↳ controller: {ep.controller.fn || ep.controller.text}</p>
              {ep.models.length > 0 && <p className="text-amber-300">↳ model: {ep.models.join(', ')}</p>}
            </div>
          )}
        </button>
      ))}
    </div>
  );

  const depsList = deps.status === 'done' ? deps.data.packages.filter((p) => !depsDirectOnly || p.direct) : [];
  const depsCounts = { high: 0, medium: 0, low: 0 };
  const viaCounts = {};
  if (deps.status === 'done') {
    deps.data.packages.filter((p) => !p.direct).forEach((p) => (p.via || []).forEach((v) => { viaCounts[v] = (viaCounts[v] || 0) + 1; }));
  }
  const viaTop = Object.entries(viaCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  depsList.forEach((p) => p.vulns.forEach((v) => { depsCounts[v.severity] += 1; }));
  const depsCard = (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Dependencies (OSV)</p>
        {deps.status === 'loading' && <span className="text-[11px] text-indigo-300 animate-pulse">Scanning…</span>}
      </div>
      <details className="text-[11px] text-slate-400">
        <summary className="cursor-pointer text-indigo-300">What is this?</summary>
        <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-slate-900/70 p-2.5">
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setDepsInfoLang('en')}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                depsInfoLang === 'en' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setDepsInfoLang('si')}
              className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                depsInfoLang === 'si' ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              සිංහල
            </button>
          </div>
          {depsInfoLang === 'en' ? (
            <p className="leading-relaxed">
              Your project relies on third-party npm packages, which in turn pull in many nested (transitive) packages.
              Some package versions contain publicly disclosed security vulnerabilities. This list checks your exact
              versions against the Open Source Vulnerabilities (OSV) database. Fix: upgrade to the &quot;Fixed in&quot;
              version. Start with <b>Direct</b> dependencies first—updating them automatically resolves most transitive issues.
            </p>
          ) : (
            <p className="leading-relaxed">
              ඔයාගේ project එක වෙනත් අය හදපු packages (npm) පාවිච්චි කරනවා, ඒවා ඇතුළේ තවත් packages ගොඩක් තියෙනවා.
              සමහර versions වල ප්‍රසිද්ධියේ දන්නා ආරක්ෂක දුර්වලතා තියෙනවා. මේ list එකෙන් පෙන්නන්නේ ඔයාගේ ඇත්තම versions
              ඒ දුර්වලතා database එකට (OSV) සසඳලා හොයාගත් ඒවා. විසඳුම: &quot;Fixed in&quot; version එකට upgrade කිරීම.
              මුලින් <b>Direct</b> ඒවා බලන්න, ඒවා update කළාම බොහෝ transitive ඒවා ඉබේම ඉවත් වෙනවා.
            </p>
          )}
        </div>
      </details>
      {deps.status === 'none' && <p className="text-xs text-slate-500">No package.json found.</p>}
      {deps.status === 'error' && <p className="text-xs text-red-300">{deps.error}</p>}
      {deps.status === 'done' && (
        <>
          <p className="text-xs text-slate-400">
            {deps.data.stats.vulnerablePackages} vulnerable packages of {deps.data.stats.scanned} scanned · {deps.data.stats.directVulnerable} direct
          </p>
          <div className="flex gap-1.5 text-[11px]">
            {['high', 'medium', 'low'].map((k) => (
              <span key={k} className={`px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[k]}`}>{k} {depsCounts[k]}</span>
            ))}
          </div>
          {deps.data.stats.approx > 0 && (
            <p className="text-[11px] text-amber-300">No lockfile found; {deps.data.stats.approx} versions were estimated from package.json ranges.</p>
          )}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/70 border border-white/10 text-xs">
            {[[true, 'Direct'], [false, 'All (incl. transitive)']].map(([v, label]) => (
              <button key={label} onClick={() => setDepsDirectOnly(v)}
                className={`py-1.5 rounded-md ${depsDirectOnly === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          {viaTop.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 space-y-1">
              <p className="font-semibold">Update these first (introducing transitive vulnerabilities):</p>
              {viaTop.map(([name, n]) => <p key={name}><span className="font-mono">{name}</span> → {n} vulnerable packages</p>)}
            </div>
          )}
          {depsList.length === 0 && <p className="text-xs text-slate-400">No known vulnerabilities in this category.</p>}
          {depsList.map((p) => (
            <details key={`${p.name}@${p.version}`} className="rounded-md border border-white/10 bg-slate-900/60 px-2.5 py-2">
              <summary className="cursor-pointer flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEV_STYLE[p.severity]}`}>{p.severity}</span>
                <span className="font-mono break-all flex-1">{p.name}@{p.version}</span>
                <span className="text-[10px] text-slate-400 text-right">{p.direct ? 'direct' : `via ${(p.via || []).join(', ') || 'transitive'}`}</span>
              </summary>
              <div className="mt-2 space-y-2">
                {p.vulns.map((v) => (
                  <div key={v.id} className="text-xs space-y-0.5">
                    <a href={`https://osv.dev/vulnerability/${v.id}`} target="_blank" rel="noreferrer" className="text-indigo-300 hover:underline break-all">{v.id}</a>
                    {v.summary && <p className="text-slate-300">{v.summary}</p>}
                    {v.fixed.length > 0 && <p className="text-emerald-300/90">Fixed in: {v.fixed.join(', ')}</p>}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </>
      )}
    </div>
  );

  const archCard = arch ? (
    <div className="space-y-3">
      <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <ScoreRing score={arch.score} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Architecture Health: {arch.label}</p>
          <p className="text-xs text-slate-400">
            {arch.metrics.files} files · {arch.metrics.edges} imports · {arch.metrics.cycles} cycle{arch.metrics.cycles === 1 ? '' : 's'}
          </p>
          <div className="flex gap-1.5 mt-1.5 text-[11px]">
            {['high', 'medium', 'low'].map((k) => (
              <span key={k} className={`px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[k]}`}>{k} {arch.counts[k]}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400">
        Score = 100 − (High×10 + Medium×5 + Low×2). Computed via deterministic graph algorithms.
        {arch.metrics.layers.length > 0 && ` Layers: ${arch.metrics.layers.join(' → ')}.`}
      </p>
      {archHl && <button onClick={() => setArchHl(null)} className="text-xs text-indigo-300 hover:underline">Clear highlight</button>}
      {arch.issues.length === 0 && (
        <p className="text-sm text-slate-400 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          No circular dependencies, layer violations, or god files detected.
        </p>
      )}
      {arch.issues.map((it, idx) => (
        <div key={`${it.id}-${idx}`}
          className={`rounded-xl border p-2.5 space-y-1.5 transition-colors ${archHl === it ? 'border-indigo-500 bg-indigo-500/15' : 'border-white/10 bg-slate-950/50'}`}>
          <button onClick={() => { setActiveEp(null); setArchHl(archHl === it ? null : it); }} className="w-full text-left space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEV_STYLE[it.severity]}`}>{it.severity}</span>
              <span className="text-sm font-medium flex-1">{it.title}</span>
            </div>
            <p className="text-[11px] text-slate-300">{it.message}</p>
            {it.cycle && <p className="text-[11px] text-amber-200 break-all">{it.cycle.map((f) => f.slice(root.length)).join('  →  ')}</p>}
          </button>
          <details>
            <summary className="text-xs text-indigo-300 cursor-pointer">How to fix</summary>
            <p className="text-xs text-emerald-300/90 mt-1.5">{it.fix}</p>
            <div className="mt-1.5 space-y-0.5">
              {it.nodeIds.slice(0, 6).map((nid, i) => (
                <button key={nid + i} onClick={() => selectFile(nid, true)} className="block text-[11px] text-indigo-300 hover:underline break-all text-left">
                  {it.files[i].slice(root.length)}
                </button>
              ))}
            </div>
          </details>
        </div>
      ))}
    </div>
  ) : null;

  const securityPanel = !liveScan ? (
    <p className="text-sm text-slate-500">Load a project to automatically run the security scan.</p>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-slate-950/60 p-3">
        <ScoreRing score={liveScan.score} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Security Health: {liveScan.label}
            {Object.keys(appliedPatches).length > 0 && (
              <span className="ml-1.5 text-[10px] text-emerald-400 font-normal">(Live Preview)</span>
            )}
          </p>
          <p className="text-xs text-slate-400">{liveScan.filesScanned} files scanned · {liveScan.total} findings</p>
          <div className="flex gap-1.5 mt-1.5 text-[11px]">
            {['high', 'medium', 'low'].map((k) => (
              <span key={k} className={`px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[k]}`}>{k} {liveScan.counts[k]}</span>
            ))}
          </div>
        </div>
      </div>

      {depsCard}

      {selectedNode && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/70 border border-white/10 text-xs">
          {[[false, 'All files'], [true, 'This file']].map(([v, label]) => (
            <button key={label} onClick={() => setOnlyFile(v)}
              className={`py-1.5 rounded-md ${onlyFile === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-[11px] text-slate-400">🎓 Mentor Language:</p>
        <div className="flex flex-wrap gap-1.5">
          {LANGS.map(([code, label]) => (
            <button key={code} onClick={() => setMentorLang(code)}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
                mentorLang === code ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-white/10 text-slate-300 hover:border-indigo-500'
              }`}>
              {label}
            </button>
          ))}
        </div>
        {mentorError && <p role="alert" className="text-xs text-red-300">{mentorError}</p>}
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          No active security issues found. Automated rules cover common patterns and are not a complete security guarantee.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.rule} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEV_STYLE[g.severity]}`}>{g.severity}</span>
              <span className="text-sm font-medium">{g.title}</span>
              <span className="ml-auto text-[11px] text-slate-400">{g.items.length} {g.items.length === 1 ? 'place' : 'places'}</span>
            </div>
            <p className="text-[11px] text-indigo-300">{g.cwe}</p>
            <p className="text-xs text-emerald-300/90">{g.fix}</p>

            <div className="space-y-1.5">
              {g.items.map((f) => (
                <div key={`${f.nodeId}-${f.line}`} className="rounded-lg border border-white/10 bg-slate-900/60">
                  <button onClick={() => openFinding(f)} className="w-full text-left px-2.5 py-2 space-y-1">
                    <p className="text-[11px] text-indigo-300 break-all">{f.file}:{f.line}</p>
                    {f.snippet && <code className="block text-[11px] text-slate-300 break-all">{f.snippet}</code>}
                  </button>
                  <details className="px-2.5 pb-2">
                    <summary className="text-xs text-indigo-300 cursor-pointer">What&apos;s wrong here &amp; suggested change</summary>
                    <div className="mt-1.5"><Markdown text={f.message} /></div>
                    {f.trace && f.trace.length > 1 && (
                      <p className="mt-2 text-[11px] text-slate-400 break-all">
                        Data flow: <span className="text-slate-200">{f.trace.join('  →  ')}</span>
                      </p>
                    )}
                    {f.example && (
                      <pre className="mt-2 text-[11px] text-emerald-200 bg-slate-950 border border-white/10 rounded p-2 whitespace-pre-wrap break-all">{f.example}</pre>
                    )}
                    <div className="mt-2">
                      {mentor[mkey(f)] ? (
                        <div className="rounded-lg border border-indigo-800/50 bg-indigo-950/40 p-2.5">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300 mb-1.5">🎓 Mentor</p>
                          <Markdown text={mentor[mkey(f)]} />
                        </div>
                      ) : (
                        <button onClick={() => askMentor(f)} disabled={!!mentorBusy}
                          className="text-xs px-2.5 py-1.5 rounded-md border border-indigo-500/50 text-indigo-200 hover:bg-indigo-500/10 disabled:opacity-50">
                          {mentorBusy === mkey(f) ? 'Thinking…' : '🎓 Explain with Mentor'}
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

  const codeLines = (selectedNode?.data.code || selectedNode?.data.codeSnippet || '').split('\n');
  const glassPanel = 'rounded-2xl border border-white/10 bg-[#070c24]/75 backdrop-blur-xl shadow-[0_8px_32px_rgba(2,6,23,0.55)]';
  const patchCount = Object.keys(appliedPatches).length;

  const auditView = (large) => (
    <div className={large ? '' : 'bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-xl'}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">AI Architecture Insights</p>
        {!large && (
          <button onClick={() => setAuditOpen(true)} title="Full view"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10">
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {LANGS.map(([code, label]) => (
          <button key={code} onClick={() => handleLang(code)} disabled={translating}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors disabled:opacity-60 ${
              lang === code ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-white/10 text-slate-300 hover:border-indigo-500'
            }`}>
            {label}
          </button>
        ))}
        {lang !== 'en' && !translating && (
          <button onClick={() => handleLang(lang, true)} title="Retry translation"
            className="ml-auto px-2.5 py-1 rounded-md text-xs border border-white/10 text-slate-400 hover:text-white hover:border-indigo-500">
            ↻ Retry
          </button>
        )}
      </div>
      {translating ? (
        <div className="flex items-center gap-2 text-indigo-300 text-xs">
          <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          Translating...
        </div>
      ) : (
        <Markdown text={aiAnalysis} large={large} />
      )}
    </div>
  );

  const userInitial = (user?.name || user?.email || 'D').charAt(0).toUpperCase();
  const showGraphPane = centerView === 'graph' || centerView === 'split';
  const showCodePane = centerView === 'code' || centerView === 'split';
  const isGraphFocused = graphFocus && mobileTab === 'graph';

  return (
    <div className="h-dvh flex flex-col bg-[#040714] bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.12),_transparent_55%)] text-slate-100 font-sans overflow-hidden">
      {/* ===== Floating Glassmorphism Navbar ===== */}
      <header
        className={`sticky top-0 z-30 shrink-0 px-2.5 sm:px-4 transition-all duration-300 ease-out ${
          isGraphFocused
            ? 'max-h-0 opacity-0 pt-0 overflow-hidden pointer-events-none lg:max-h-40 lg:opacity-100 lg:pt-3 lg:overflow-visible lg:pointer-events-auto'
            : 'max-h-40 opacity-100 pt-2 sm:pt-3'
        }`}
      >
        <div className="h-14 px-3 sm:px-4 rounded-2xl border border-white/10 bg-[#070c24]/75 backdrop-blur-xl shadow-[0_8px_32px_rgba(2,6,23,0.65)] flex items-center justify-between gap-2">
          {/* Left: Sidebar Toggle + Brand + Active Repo Pill */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Hide file explorer' : 'Show file explorer'}
              className="hidden lg:flex p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>

            <span className="hidden sm:block"><Logo size={28} /></span>
            <span className="sm:hidden"><Logo size={26} text={false} /></span>

            <div className="hidden xl:flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] max-w-[240px]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${loading ? 'bg-amber-400 animate-pulse' : projectName ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <span className="text-xs font-medium text-slate-200 truncate">
                {loading ? 'Analyzing...' : projectName || 'No project loaded'}
              </span>
            </div>
          </div>

          {/* Center: Glass Segmented Workspace View Switcher (Desktop) */}
          <nav aria-label="Workspace View" className="hidden lg:flex items-center p-1 rounded-xl border border-white/10 bg-slate-950/60 backdrop-blur-md">
            {CENTER_VIEWS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCenterView(id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${
                  centerView === id
                    ? 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(79,70,229,0.45)]'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {/* Right: Load Project + User Avatar + Logout */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div ref={loadRef} className="relative">
              <button
                onClick={() => setLoadOpen(!loadOpen)}
                className="h-9 px-3 sm:px-3.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs sm:text-sm font-medium text-indigo-100 flex items-center gap-2 transition-colors"
              >
                <UploadCloud className="w-4 h-4 text-indigo-300" />
                <span className="hidden sm:inline">Load Project</span>
                <span className="sm:hidden">Load</span>
              </button>

              {loadOpen && (
                <div className="fixed left-3 right-3 top-[68px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2.5 sm:w-96 z-40 p-4 rounded-2xl border border-white/15 bg-[#0a1030]/95 backdrop-blur-2xl shadow-2xl space-y-3">
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950/70 border border-white/10 text-xs font-medium">
                    {[['github', 'GitHub URL'], ['zip', 'ZIP Upload']].map(([id, label]) => (
                      <button key={id} onClick={() => { setSource(id); setError(''); setErrorCode(''); }}
                        className={`py-1.5 rounded-lg transition-colors ${source === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {source === 'zip' ? (
                    <div className="p-5 border-2 border-dashed border-white/15 hover:border-indigo-500 rounded-xl text-center relative cursor-pointer transition-colors">
                      <input type="file" accept=".zip" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                      <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto mb-1.5" />
                      <p className="text-sm text-slate-200 font-medium">Upload Project ZIP</p>
                      <p className="text-xs text-slate-500 mt-0.5">Max 50MB archive</p>
                    </div>
                  ) : (
                    <form onSubmit={handleGithubSubmit} className="space-y-2.5">
                      <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo"
                        className="w-full h-10 px-3 rounded-xl border border-white/10 bg-slate-950/70 text-sm outline-none focus:border-indigo-500" />
                      <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch (optional)"
                        className="w-full h-9 px-3 rounded-xl border border-white/10 bg-slate-950/50 text-xs outline-none focus:border-indigo-500" />
                      <button type="submit" disabled={loading || !repoUrl.trim()}
                        className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 transition-colors">
                        Analyze Repository
                      </button>

                      {githubToken ? (
                        <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                          <Lock className="w-3 h-3 shrink-0" /> GitHub connected — Public &amp; Private repositories + Pull Requests enabled.
                        </p>
                      ) : (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 space-y-1.5">
                          <p className="flex items-start gap-1.5 leading-relaxed">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                            <span>
                              GitHub not connected. <b>Public repositories</b> can be analyzed, refactored, and exported as ZIP, but <b>Private repositories</b> and <b>GitHub Pull Requests</b> require connecting GitHub.
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={handleConnectGithub}
                            className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline font-medium"
                          >
                            Connect GitHub Account →
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  {loading && (
                    <div className="flex items-center justify-center gap-2 text-indigo-300 text-xs py-1">
                      <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                      {source === 'github' ? 'Downloading & analyzing repo...' : 'Analyzing AST Architecture...'}
                    </div>
                  )}

                  {error && (
                    <div role="alert" className="text-xs text-red-300 bg-red-950/50 border border-red-900/60 rounded-xl px-3 py-2 space-y-1.5">
                      <p>{error}</p>
                      {(errorCode === 'GITHUB_TOKEN_EXPIRED' || errorCode === 'PRIVATE_OR_NOT_FOUND') && (
                        <button
                          type="button"
                          onClick={handleConnectGithub}
                          className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200 underline font-medium"
                        >
                          Connect GitHub Account →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="h-5 w-px bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold leading-tight text-slate-100">{user?.name}</p>
                <p className="text-[11px] text-slate-400">{user?.email}</p>
              </div>
              {user?.avatar && !avatarErr ? (
                <img
                  src={user.avatar}
                  alt={user?.name || 'User avatar'}
                  onError={() => setAvatarErr(true)}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-indigo-500/40 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600/30 ring-2 ring-indigo-500/40 flex items-center justify-center text-xs font-semibold text-indigo-200 shrink-0">
                  {userInitial}
                </div>
              )}
              <button onClick={handleLogout} title="Logout" className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {loading && <div className="h-0.5 mx-4 rounded-full bg-indigo-500 animate-pulse" />}

        {workspaceNotice && (
          <div
            className={`mt-2 mx-auto max-w-3xl rounded-xl border px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-lg backdrop-blur-xl ${
              workspaceNotice.type === 'warning'
                ? 'border-amber-500/40 bg-amber-950/85 text-amber-200'
                : 'border-emerald-500/40 bg-emerald-950/85 text-emerald-200'
            }`}
          >
            <span className="flex items-center gap-2">
              {workspaceNotice.type === 'warning' ? (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              )}
              <span>{workspaceNotice.text}</span>
            </span>
            <div className="flex items-center gap-2 shrink-0">
              {workspaceNotice.type === 'warning' && (
                <button
                  type="button"
                  onClick={handleConnectGithub}
                  className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-medium"
                >
                  Connect GitHub
                </button>
              )}
              <button type="button" onClick={() => setWorkspaceNotice(null)} className="opacity-75 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ===== Main Workspace Grid ===== */}
      <div
        className={`flex-1 min-h-0 flex flex-col p-2.5 sm:p-4 pt-2.5 sm:pt-3 gap-3 lg:grid ${
          sidebarOpen
            ? 'lg:grid-cols-[250px_minmax(0,1fr)_minmax(340px,27vw)]'
            : 'lg:grid-cols-[minmax(0,1fr)_minmax(350px,28vw)]'
        }`}
      >
        {/* Left Sidebar: Project Files + Compact Stats */}
        <aside className={`${mobileTab === 'files' ? 'flex' : 'hidden'} ${sidebarOpen ? 'lg:flex' : 'lg:hidden'} flex-col gap-3 min-h-0 flex-1`}>
          <section className={`${glassPanel} flex-1 min-h-0 flex flex-col p-3.5`}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Folder className="w-4 h-4 text-indigo-400" /> Explorer
              </h2>
              {nodes.length > 0 && <span className="text-[11px] text-slate-500">{stats.files} files</span>}
            </div>

            <div className="flex items-center gap-2 h-9 px-2.5 mb-2.5 rounded-xl border border-white/10 bg-slate-950/60 focus-within:border-indigo-500 transition-colors">
              <Search className="w-3.5 h-3.5 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter files..."
                className="flex-1 bg-transparent outline-none text-xs placeholder:text-slate-500" />
            </div>

            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {nodes.length === 0 && <p className="text-xs text-slate-500 p-2">Load a project to browse files.</p>}
              {matches
                ? matches.map((f) => (
                    <button key={f.id} className={`tree-row ${selectedId === f.id ? 'active' : ''}`} onClick={() => selectFile(f.id, true)}>
                      <FileCode className="w-4 h-4 text-indigo-300 shrink-0" />
                      <span className="truncate">{short(f.data.path)}</span>
                    </button>
                  ))
                : nodes.length > 0 && <TreeFolder name="" node={tree} depth={0} selectedId={selectedId} onSelect={(id) => selectFile(id, true)} />}
            </div>
          </section>

          {/* Compact Metrics Card */}
          <section className={`${glassPanel} p-3 space-y-2`}>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[
                ['Files', stats.files],
                ['LOC', stats.loc > 999 ? `${(stats.loc / 1000).toFixed(1)}k` : stats.loc],
                ['Imports', stats.deps],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/5 bg-slate-950/50 py-2 px-1">
                  <p className="text-sm font-bold text-white">{v}</p>
                  <p className="text-[10px] text-slate-400">{k}</p>
                </div>
              ))}
            </div>
            {stats.hub && (
              <p className="text-[11px] text-slate-400 truncate px-0.5">
                Core hub: <span className="text-indigo-300 font-medium">{stats.hub.label}</span> ({stats.hub.count})
              </p>
            )}
            {truncated && <p className="text-[11px] text-amber-300 px-0.5">Showing first 600 files.</p>}
          </section>
        </aside>

        {/* Center Stage: Adaptive Graph / Code & Chat / Split View */}
        <main className={`${mobileTab === 'graph' || mobileTab === 'code' ? 'flex' : 'hidden'} lg:flex flex-col gap-3 min-h-0 min-w-0 flex-1`}>
          {/* Dependency Graph Pane */}
          <section
            className={`${glassPanel} ${
              mobileTab === 'graph' ? 'block flex-1' : 'hidden'
            } ${showGraphPane ? 'lg:block' : 'lg:hidden'} ${
              centerView === 'split' ? 'lg:h-[52%]' : 'lg:flex-1'
            } min-h-0 relative overflow-hidden`}
          >
            <div className="absolute top-3 left-3.5 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-[#070c24]/80 backdrop-blur-md text-xs font-semibold pointer-events-none">
              <Network className="w-3.5 h-3.5 text-indigo-400" /> Dependency Graph
            </div>

            {/* Mobile Graph Fullscreen / Focus Toggle */}
            {nodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (graphFocusTimer.current) clearTimeout(graphFocusTimer.current);
                  setGraphFocus((v) => !v);
                }}
                title={isGraphFocused ? 'Show navigation' : 'Full screen graph'}
                className="lg:hidden absolute top-3 right-3.5 z-10 p-2 rounded-xl border border-white/15 bg-[#070c24]/85 backdrop-blur-md text-slate-200 hover:text-white shadow-lg"
              >
                {isGraphFocused ? <Minimize2 className="w-4 h-4 text-indigo-300" /> : <Maximize2 className="w-4 h-4 text-indigo-300" />}
              </button>
            )}

            {liveScan && (
              <div className="absolute top-3 right-3.5 z-10 hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-xl border border-white/10 bg-[#070c24]/80 backdrop-blur-md text-[11px] text-slate-300 pointer-events-none">
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-500" /> Safe</span>
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-amber-500" /> Attention</span>
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-red-500" /> Vulnerability</span>
              </div>
            )}

            {nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 flex items-center justify-center">
                  <Network className="w-6 h-6 text-indigo-400" />
                </div>
                <p className="text-sm text-slate-300 font-medium">Load a GitHub repository or ZIP to visualize its architecture</p>
                <button onClick={() => setLoadOpen(true)} className="h-10 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-medium text-white shadow-lg shadow-indigo-600/25">
                  Load Project
                </button>
              </div>
            )}

            <ReactFlow nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={(_, n) => selectFile(n.id, false)}
              onNodeDoubleClick={(_, n) => selectFile(n.id, true)}
              onMoveStart={handleGraphInteractStart}
              onMoveEnd={handleGraphInteractEnd}
              fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.1} proOptions={{ hideAttribution: true }}>
              <Background color="#334155" gap={18} />
              <Controls showInteractive={false} />
              {nodes.length > 25 && (
                <MiniMap pannable zoomable className="hidden md:block" nodeColor="#4f46e5"
                  maskColor="rgba(5,8,22,.55)" style={{ width: 130, height: 84, background: '#0a1026' }} />
              )}
            </ReactFlow>

            {/* Quick Floating AI Chat Trigger when Graph is Full-Screen */}
            {centerView === 'graph' && nodes.length > 0 && (
              <button
                type="button"
                onClick={() => setCenterView('code')}
                className="hidden lg:flex absolute bottom-3.5 right-3.5 z-10 items-center gap-2 px-3.5 py-2 rounded-xl border border-indigo-500/40 bg-[#0a1030]/90 hover:bg-indigo-600/25 backdrop-blur-xl text-xs font-medium text-indigo-200 shadow-xl transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                Open Code &amp; AI Chat
              </button>
            )}
          </section>

          {/* Code Viewer + Codebase AI RAG Chat Pane */}
          <section
            className={`${glassPanel} ${
              mobileTab === 'code' ? 'flex flex-1' : 'hidden'
            } ${showCodePane ? 'lg:flex' : 'lg:hidden'} flex-1 flex-col min-h-0 overflow-hidden`}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/10 bg-white/[0.02]">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2 shrink-0">
                <Code2 className="w-4 h-4 text-indigo-400" /> Code Viewer
                {selectedNode?.data.patched && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-[10px] font-normal normal-case text-emerald-300">
                    Patched Preview
                  </span>
                )}
              </h2>
              {selectedNode && (
                <span className="text-xs text-slate-400 truncate font-mono">
                  {short(selectedNode.data.path)} · {selectedNode.data.lines} lines
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto py-2.5 font-mono text-[12px] leading-5">
              {selectedNode
                ? codeLines.map((l, i) => (
                    <div key={i} ref={focusLine === i + 1 ? focusRef : null}
                      className={`flex border-l-2 ${
                        lineSev[i + 1] === 'high' ? 'border-red-500 bg-red-500/10' : lineSev[i + 1] ? 'border-amber-500 bg-amber-500/10' : 'border-transparent'
                      } ${focusLine === i + 1 ? 'ring-1 ring-inset ring-indigo-400' : ''}`}>
                      <span className="w-12 shrink-0 text-right pr-4 text-slate-600 select-none">{i + 1}</span>
                      <span className="whitespace-pre text-slate-200">{l}</span>
                    </div>
                  ))
                : (
                  <div className="h-full flex flex-col items-center justify-center text-center px-6 font-sans">
                    <Code2 className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400">Select any file from the Explorer or double-click a node in the Graph to inspect source code.</p>
                  </div>
                )}
            </div>

            <CodebaseChat
              hasProject={nodes.length > 0}
              projectName={projectName}
              stats={stats}
              nodes={nodes}
              flow={flow}
              arch={arch}
              allFindings={allFindings}
              selectedNode={selectedNode}
              shortPath={short}
              onUnauthorized={handleLogout}
            />
          </section>
        </main>

        {/* Right Inspector Panel: Arch | Security | Flow | Refactor */}
        <aside className={`${glassPanel} ${mobileTab === 'ai' ? 'block' : 'hidden'} lg:block flex-1 lg:flex-none min-h-0 overflow-y-auto overflow-x-hidden p-3.5 space-y-4`}>
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl border border-white/10 bg-slate-950/60">
            {AGENTS.map(({ id, label, icon: Icon }) => {
              const badge =
                id === 'sec' && liveScan?.total > 0
                  ? liveScan.total
                  : id === 'ref' && patchCount > 0
                  ? patchCount
                  : null;
              return (
                <button
                  key={id}
                  onClick={() => setAgent(id)}
                  title={label}
                  className={`min-w-0 rounded-lg py-1.5 px-1 text-[11px] font-medium flex items-center justify-center gap-1 transition-all ${
                    agent === id
                      ? 'bg-indigo-600 text-white shadow-[0_0_12px_rgba(79,70,229,0.4)]'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                  {badge !== null && (
                    <span className={`px-1 rounded text-[9px] font-bold ${agent === id ? 'bg-white/20 text-white' : 'bg-white/10 text-slate-300'}`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {agent === 'ref' && (
            <RefactorPanel
              selectedNode={selectedNode}
              shortPath={short}
              appliedPatches={appliedPatches}
              onApplyPatch={handleApplyPatch}
              onRevertPatch={handleRevertPatch}
              onDownloadZip={handleDownloadPatchedZip}
              repoMeta={repoMeta}
              githubToken={githubToken}
              onConnectGithub={handleConnectGithub}
              onUnauthorized={handleLogout}
            />
          )}

          {agent === 'arch' && archCard}
          {agent === 'sec' && securityPanel}
          {agent === 'flow' && flowPanel}

          {agent === 'arch' && selectedNode && (
            <div className="pt-3 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold truncate text-sm">{selectedNode.data.label}</p>
                <button onClick={() => { setSelectedId(null); setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>

              <button onClick={handleAIAnalysis} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 font-medium py-2.5 rounded-xl text-sm disabled:opacity-50 transition-colors">
                <Sparkles className="w-4 h-4" />
                {aiLoading ? 'Analyzing Code with AI...' : 'Run Architecture AI Audit'}
              </button>

              {aiError && (
                <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2">{aiError}</p>
              )}

              {analysis.en && auditView(false)}

              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><ArrowRightLeft className="w-3.5 h-3.5 text-indigo-400" /> Imports</div>
                  <span className="text-lg font-bold">{selectedNode.data.importsCount}</span>
                </div>
                <div className="bg-slate-950/60 p-3 rounded-xl border border-white/10">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><Code2 className="w-3.5 h-3.5 text-indigo-400" /> Exports</div>
                  <span className="text-lg font-bold">{selectedNode.data.exportsList?.length || 0}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">File Path</span>
                <p className="text-xs font-mono bg-slate-950/60 p-2.5 rounded-xl border border-white/10 text-slate-300 break-all">{short(selectedNode.data.path)}</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* ===== Mobile Floating Glass Bottom Navigation ===== */}
      <nav
        className={`lg:hidden shrink-0 px-2.5 transition-all duration-300 ease-out ${
          isGraphFocused
            ? 'max-h-0 opacity-0 pb-0 overflow-hidden pointer-events-none'
            : 'max-h-32 opacity-100 pb-[calc(3.25rem+env(safe-area-inset-bottom))]'
        }`}
      >
        <div className="grid grid-cols-4 rounded-2xl border border-white/10 bg-[#070c24]/85 backdrop-blur-xl shadow-lg p-1">
          {MOBILE_TABS.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => handleMobileTabChange(id)}
              className={`py-2 rounded-xl flex flex-col items-center gap-0.5 text-[11px] font-medium transition-colors ${
                mobileTab === id ? 'bg-indigo-600/25 text-indigo-200' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Audit Full View Modal */}
      {auditOpen && analysis.en && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setAuditOpen(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0a1030]/95 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="font-semibold truncate">{selectedNode?.data.label}</p>
              <button onClick={() => setAuditOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"><X className="w-5 h-5" /></button>
            </div>
            {auditView(true)}
          </div>
        </div>
      )}
    </div>
  );
}