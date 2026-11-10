import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, Controls, MiniMap, Background, Handle, Position, useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  UploadCloud, FileCode, Folder, ChevronRight, ChevronDown, Search, Sparkles, LogOut,
  Lock, Send, ShieldCheck, Network, Wrench, ArrowRightLeft, Code2, X, Maximize2, GitBranch,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Markdown from '../components/Markdown';

/* ---------- Graph ---------- */
const W = 210, H = 56;

// සියලුම paths වල පොදු root folder එක (repo-name-sha/) හොයනවා
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
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
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
  const sev = data.severity || (data.findings ? 'safe' : '');
  return (
    <div className={`file-node ${sev ? `sev-${sev}` : ''}`}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <FileCode className="w-5 h-5 text-indigo-300 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{data.label}</p>
        <p className="truncate text-[10px] text-slate-500">{data.folder}</p>
      </div>
      {n > 0 && <span className={`sev-badge sev-badge-${data.severity}`}>{n}</span>}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { file: FileNode };

function ScoreRing({ score }) {
  const r = 26, c = 2 * Math.PI * r;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0">
      <circle cx="34" cy="34" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
      <circle cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" fontSize="16" fontWeight="700" fill="#f1f5f9">{score}</text>
    </svg>
  );
}

const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const SEV_STYLE = {
  high: 'bg-red-500/15 text-red-300 border-red-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
};

/* ---------- File tree ---------- */
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
            </button>
          ))}
        </>
      )}
    </div>
  );
}

const LANGS = [['en', 'English'], ['si', 'සිංහල'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']];

const AGENTS = [
  { id: 'arch', label: 'Arch', icon: Network, ready: true },
  { id: 'sec', label: 'Security', icon: ShieldCheck, ready: true },
  { id: 'flow', label: 'Flow', icon: GitBranch, ready: true },
  { id: 'ref', label: 'Refactor', icon: Wrench, ready: false },
];

const METHOD_STYLE = {
  GET: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  POST: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  PUT: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  PATCH: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  DELETE: 'text-red-300 bg-red-500/10 border-red-500/30',
};
const KIND_STYLE = { auth: 'text-emerald-300', role: 'text-emerald-300', limiter: 'text-sky-300', validation: 'text-sky-300', upload: 'text-amber-300' };

const MOBILE_TABS = [['files', 'Files', Folder], ['graph', 'Graph', Network], ['code', 'Code', Code2], ['ai', 'AI', Sparkles]];

export default function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [mobileTab, setMobileTab] = useState('graph');

  // Load project
  const loadRef = useRef(null);
  const [loadOpen, setLoadOpen] = useState(false);
  const [source, setSource] = useState('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [truncated, setTruncated] = useState(false);

  // AI
  const [analyses, setAnalyses] = useState({}); // { [fileId]: { en, si, ta, hi } }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [lang, setLang] = useState('en');
  const [translating, setTranslating] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // Security scan
  const [agent, setAgent] = useState('arch');
  const [scan, setScan] = useState(null);
  const [onlyFile, setOnlyFile] = useState(false);
  const [focusLine, setFocusLine] = useState(null);
  const focusRef = useRef(null);

  // Endpoint flow map
  const [flow, setFlow] = useState(null);
  const [activeEp, setActiveEp] = useState(null);

  // Dependency CVE scan (OSV)
  const [deps, setDeps] = useState({ status: 'idle' });
  const [depsDirectOnly, setDepsDirectOnly] = useState(true);
  const depsToken = useRef(0);

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
  }, [focusLine, selectedId]);

  // පිටතින් click කළාම / Esc ඔබපුවාම dropdown සහ modal වැහෙනවා
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

  const selectFile = (id) => {
    setSelectedId(id);
    setLang('en');
    setAiError('');
    setFocusLine(null);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    if (window.innerWidth < 1024) setMobileTab('code');
  };

  // Graph එක පෙන්නපු පස්සේ පසුබිමෙන් dependency scan එක (OSV) run වෙනවා
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
      if (token === depsToken.current) setDeps({ status: 'error', error: err.response?.data?.error || 'Dependency scan එක අසාර්ථක වුණා.' });
    }
  };

  const applyGraph = (data, meta, name) => {
    const l = getLayoutedElements(data.nodes, data.edges);
    setNodes(l.nodes);
    setEdges(l.edges);
    setSelectedId(null);
    setAnalyses({});
    setTruncated(!!meta?.truncated);
    setScan(meta?.scan || null);
    setFlow(meta?.flow || null);
    setActiveEp(null);
    startDepsScan(meta?.manifests);
    setAgent(meta?.scan ? 'sec' : 'arch');
    setProjectName(name);
    setLoadOpen(false);
    setMobileTab('graph');
  };

  const handleRequestError = (err, fallback) => {
    console.error(err);
    if (err.response?.status === 401) return handleLogout();
    setError(err.response?.data?.error || fallback);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/parser/upload', formData);
      if (res.data.success) applyGraph(res.data.data, res.data.meta, file.name);
    } catch (err) {
      handleRequestError(err, 'ZIP File එක Upload කිරීමේදී දෝෂයක් සිදු විය.');
    } finally {
      setLoading(false);
    }
  };

  const handleGithubSubmit = async (e) => {
    e.preventDefault();
    if (!repoUrl.trim() || loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/parser/github', { repoUrl: repoUrl.trim(), branch: branch.trim() || undefined });
      if (res.data.success) applyGraph(res.data.data, res.data.meta, res.data.meta?.repo || repoUrl.trim());
    } catch (err) {
      handleRequestError(err, 'GitHub repo එක analyze කිරීමේදී දෝෂයක් සිදු විය.');
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
      setAiError(err.response?.data?.error || 'AI Analysis ලබාගැනීමට නොහැකි විය. Backend log පරීක්ෂා කරන්න.');
    } finally {
      setAiLoading(false);
    }
  };

  // භාෂාව මාරු කරනවා. තවම translate කරලා නැත්නම් (හෝ force නම්) විතරක් request එකක් යවනවා
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
            ? `Translate request එක fail වුණා (HTTP ${err.response.status}). Backend එකේ අලුත් files දාලා restart කළාද බලන්න.`
            : 'Backend එකට සම්බන්ධ වෙන්න බැරි වුණා.')
      );
      setLang('en');
    } finally {
      setTranslating(false);
    }
  };

  const openFinding = (f) => {
    selectFile(f.nodeId);
    setFocusLine(f.line);
  };
  const lineSev = {};
  (selectedNode?.data.findings || []).forEach((f) => {
    if (!lineSev[f.line] || SEV_ORDER[f.severity] < SEV_ORDER[lineSev[f.line]]) lineSev[f.line] = f.severity;
  });

  // එකම rule එකේ findings එකට කණ්ඩායම් කරනවා (rule එකේ විස්තරය එක පාරයි, ස්ථාන වෙන වෙනම)
  // Endpoint එකක් select කළාම ඒකේ path එක graph එකේ highlight වෙනවා
  const epSet = useMemo(() => (activeEp ? new Set(activeEp.nodeIds) : null), [activeEp]);
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

  const openEndpoint = (ep) => {
    setActiveEp(ep);
    if (ep.routeNodeId) {
      selectFile(ep.routeNodeId);
      setFocusLine(ep.line);
    }
  };

  const flowPanel = !flow || flow.endpoints.length === 0 ? (
    <p className="text-sm text-slate-500">
      {flow ? 'Express endpoints හොයාගන්න බැරි වුණා (router.get / router.post ... නැති project එකක්).' : 'Project එකක් load කළාම endpoint map එක ඉබේම හැදෙනවා.'}
    </p>
  ) : (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Endpoints', flow.stats.total, 'text-white'], ['Protected', flow.stats.protected, 'text-emerald-300'], ['Open', flow.stats.open, flow.stats.open ? 'text-red-300' : 'text-slate-300']].map(([k, v, c]) => (
          <div key={k} className="rounded-lg border border-slate-800 bg-slate-950/50 py-2">
            <p className={`text-lg font-bold ${c}`}>{v}</p>
            <p className="text-[11px] text-slate-400">{k}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">
        Endpoint එකක් click කළාම graph එකේ ඒකේ path එක (route → middleware → controller → model) highlight වෙනවා. Login/register වගේ public by design: {flow.stats.public}.
      </p>
      {activeEp && (
        <button onClick={() => setActiveEp(null)} className="text-xs text-indigo-300 hover:underline">Clear highlight</button>
      )}
      {flow.endpoints.map((ep) => (
        <button key={ep.id} onClick={() => openEndpoint(ep)}
          className={`w-full text-left rounded-lg border p-2.5 space-y-1 ${activeEp?.id === ep.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'}`}>
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
  const depsCard = (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Dependencies (OSV)</p>
        {deps.status === 'loading' && <span className="text-[11px] text-indigo-300 animate-pulse">Scanning…</span>}
      </div>
      {deps.status === 'none' && <p className="text-xs text-slate-500">package.json හොයාගන්න බැරි වුණා.</p>}
      {deps.status === 'error' && <p className="text-xs text-red-300">{deps.error}</p>}
      {deps.status === 'done' && (
        <>
          <p className="text-xs text-slate-400">
            {deps.data.stats.vulnerablePackages} vulnerable of {deps.data.stats.scanned} packages
            {' · '}{deps.data.stats.directVulnerable} direct
          </p>
          <div className="flex gap-1.5 text-[11px]">
            {['high', 'medium', 'low'].map((k) => (
              <span key={k} className={`px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[k]}`}>{k} {deps.data.stats.counts[k]}</span>
            ))}
          </div>
          {deps.data.stats.approx > 0 && (
            <p className="text-[11px] text-amber-300">Lockfile නැති නිසා versions {deps.data.stats.approx}ක් package.json range එකෙන් ඇස්තමේන්තු කළ ඒවා.</p>
          )}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
            {[[true, 'Direct'], [false, 'All (incl. transitive)']].map(([v, label]) => (
              <button key={label} onClick={() => setDepsDirectOnly(v)}
                className={`py-1.5 rounded-md ${depsDirectOnly === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                {label}
              </button>
            ))}
          </div>
          {depsList.length === 0 && <p className="text-xs text-slate-400">මේ ගණයේ දන්නා vulnerabilities නැහැ.</p>}
          {depsList.map((p) => (
            <details key={`${p.name}@${p.version}`} className="rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-2">
              <summary className="cursor-pointer flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEV_STYLE[p.severity]}`}>{p.severity}</span>
                <span className="font-mono break-all flex-1">{p.name}@{p.version}</span>
                <span className="text-[10px] text-slate-400">{p.direct ? 'direct' : 'transitive'}</span>
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

  const securityPanel = !scan ? (
    <p className="text-sm text-slate-500">Project එකක් load කළාම security scan එක ඉබේම run වෙනවා.</p>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <ScoreRing score={scan.score} />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Security Health: {scan.label}</p>
          <p className="text-xs text-slate-400">{scan.filesScanned} files scanned · {scan.total} findings</p>
          <div className="flex gap-1.5 mt-1.5 text-[11px]">
            {['high', 'medium', 'low'].map((k) => (
              <span key={k} className={`px-1.5 py-0.5 rounded border capitalize ${SEV_STYLE[k]}`}>{k} {scan.counts[k]}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        Score = 100 − (High×10 + Medium×4 + Low×1). Rule-based scan (AST), AI නැතුව, නොමිලේ.
      </p>

      {depsCard}

      {selectedNode && (
        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
          {[[false, 'All files'], [true, 'This file']].map(([v, label]) => (
            <button key={label} onClick={() => setOnlyFile(v)}
              className={`py-1.5 rounded-md ${onlyFile === v ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-slate-400 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          No issues found by the current rules. මෙය ආරක්ෂාවේ සහතිකයක් නෙවෙයි, rules ගණන සීමිතයි.
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.rule} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${SEV_STYLE[g.severity]}`}>{g.severity}</span>
              <span className="text-sm font-medium">{g.title}</span>
              <span className="ml-auto text-[11px] text-slate-400">{g.items.length} {g.items.length === 1 ? 'place' : 'places'}</span>
            </div>
            <p className="text-[11px] text-indigo-300">{g.cwe}</p>
            <p className="text-xs text-emerald-300/90">{g.fix}</p>

            <div className="space-y-1.5">
              {g.items.map((f) => (
                <div key={`${f.nodeId}-${f.line}`} className="rounded-md border border-slate-800 bg-slate-900/60">
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
                      <pre className="mt-2 text-[11px] text-emerald-200 bg-slate-950 border border-slate-800 rounded p-2 whitespace-pre-wrap break-all">{f.example}</pre>
                    )}
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
  const panel = 'rounded-xl border border-blue-500/20 bg-[#070c24]';

  // Audit result (side panel එකේත්, full-view modal එකේත් පාවිච්චි වෙනවා)
  const auditView = (large) => (
    <div className={large ? '' : 'bg-indigo-950/40 border border-indigo-800/50 p-3 rounded-xl'}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">AI Architecture Insights</p>
        {!large && (
          <button onClick={() => setAuditOpen(true)} title="Full view"
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800">
            <Maximize2 className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {LANGS.map(([code, label]) => (
          <button key={code} onClick={() => handleLang(code)} disabled={translating}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors disabled:opacity-60 ${
              lang === code ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-300 hover:border-indigo-500'
            }`}>
            {label}
          </button>
        ))}
        {lang !== 'en' && !translating && (
          <button onClick={() => handleLang(lang, true)} title="නැවත translate කරන්න (free request එකක් වැය වෙනවා)"
            className="ml-auto px-2.5 py-1 rounded-md text-xs border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500">
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

  return (
    <div className="h-dvh flex flex-col bg-[#050816] text-slate-100 font-sans overflow-hidden">
      {/* ===== Top bar ===== */}
      <header className="h-14 sm:h-16 shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 border-b border-blue-500/20 bg-[#070c24]">
        <div className="flex items-center gap-4 min-w-0">
          <span className="hidden sm:block"><Logo size={30} /></span>
          <span className="sm:hidden"><Logo size={28} text={false} /></span>
          <div className="min-w-0 sm:border-l sm:border-slate-700 sm:pl-5">
            <p className="text-sm font-semibold truncate max-w-[140px] sm:max-w-[260px]">
              {loading ? 'Analyzing...' : projectName || 'No project loaded'}
            </p>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <i className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : projectName ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              {loading ? 'Please wait' : 'Active Project'}
            </p>
          </div>
        </div>

        <div ref={loadRef} className="relative">
          <button onClick={() => setLoadOpen(!loadOpen)}
            className="h-10 px-3 sm:px-4 rounded-lg border border-blue-500/50 hover:bg-blue-500/10 text-sm flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-blue-300" />
            <span className="hidden sm:inline">GitHub / ZIP Upload</span>
            <span className="sm:hidden">Load</span>
          </button>
          {loadOpen && (
            <div className="fixed left-3 right-3 top-[60px] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 z-30 p-4 rounded-xl border border-blue-500/30 bg-[#0a1030] shadow-2xl space-y-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-950/60 border border-slate-800 text-sm">
                {[['github', 'GitHub URL'], ['zip', 'ZIP Upload']].map(([id, label]) => (
                  <button key={id} onClick={() => { setSource(id); setError(''); }}
                    className={`py-1.5 rounded-md ${source === id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>

              {source === 'zip' ? (
                <div className="p-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-center relative cursor-pointer">
                  <input type="file" accept=".zip" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                  <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto mb-1" />
                  <p className="text-sm text-slate-300">Upload Project ZIP</p>
                </div>
              ) : (
                <form onSubmit={handleGithubSubmit} className="space-y-2.5">
                  <input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/user/repo"
                    className="w-full h-10 px-3 rounded-lg border border-slate-700 bg-slate-950/60 text-sm outline-none focus:border-indigo-500" />
                  <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch (optional)"
                    className="w-full h-9 px-3 rounded-lg border border-slate-800 bg-slate-950/40 text-xs outline-none focus:border-indigo-500" />
                  <button type="submit" disabled={loading || !repoUrl.trim()}
                    className="w-full h-10 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50">
                    Analyze Repository
                  </button>
                  <p className="text-xs text-slate-500">Public repositories only.</p>
                </form>
              )}

              {loading && (
                <div className="flex items-center justify-center gap-2 text-indigo-400 text-sm">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  {source === 'github' ? 'Downloading & analyzing repo...' : 'Analyzing AST Architecture...'}
                </div>
              )}
              {error && <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium leading-tight">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>
          <button onClick={handleLogout} title="Logout" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      {loading && <div className="h-0.5 shrink-0 bg-indigo-500 animate-pulse" />}

      {/* ===== Body ===== */}
      <div className="flex-1 min-h-0 flex flex-col p-2 sm:p-3 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_minmax(340px,28vw)] lg:gap-3">
        {/* Left: files + stats */}
        <aside className={`${mobileTab === 'files' ? 'flex' : 'hidden'} lg:flex flex-col gap-3 min-h-0 flex-1`}>
          <section className={`${panel} flex-1 min-h-0 flex flex-col p-3`}>
            <h2 className="text-sm font-semibold mb-2.5 flex items-center gap-2"><Folder className="w-4 h-4 text-blue-300" /> Project Files</h2>
            <div className="flex items-center gap-2 h-9 px-2.5 mb-2 rounded-lg border border-slate-700/80 bg-slate-950/50 focus-within:border-blue-500">
              <Search className="w-4 h-4 text-slate-500" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-500" />
            </div>
            <div className="flex-1 overflow-y-auto -mx-1 px-1">
              {nodes.length === 0 && <p className="text-xs text-slate-500 p-2">Project එකක් load කරන්න.</p>}
              {matches
                ? matches.map((f) => (
                    <button key={f.id} className={`tree-row ${selectedId === f.id ? 'active' : ''}`} onClick={() => selectFile(f.id)}>
                      <FileCode className="w-4 h-4 text-indigo-300 shrink-0" />
                      <span className="truncate">{short(f.data.path)}</span>
                    </button>
                  ))
                : nodes.length > 0 && <TreeFolder name="" node={tree} depth={0} selectedId={selectedId} onSelect={selectFile} />}
            </div>
          </section>

          <section className={`${panel} p-3 space-y-2`}>
            <h2 className="text-sm font-semibold mb-1">Quick Stats</h2>
            {[['Total Files', stats.files], ['Lines of Code', stats.loc.toLocaleString()], ['Dependencies', stats.deps]].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                <span className="text-xs text-slate-400">{k}</span>
                <span className="text-lg font-bold">{v}</span>
              </div>
            ))}
            {stats.hub && (
              <p className="text-xs text-slate-400 px-1">
                Most depended on: <span className="text-indigo-300">{stats.hub.label}</span> ({stats.hub.count})
              </p>
            )}
            {truncated && <p className="text-xs text-amber-300 px-1">පළමු files 600 විතරයි පෙන්නන්නේ.</p>}
          </section>
        </aside>

        {/* Center: graph + code */}
        <main className={`${mobileTab === 'graph' || mobileTab === 'code' ? 'flex' : 'hidden'} lg:flex flex-col gap-3 min-h-0 min-w-0 flex-1`}>
          <section className={`${panel} ${mobileTab === 'graph' ? 'block' : 'hidden'} lg:block flex-1 min-h-0 relative overflow-hidden`}>
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2 text-sm font-semibold pointer-events-none">
              <Network className="w-4 h-4 text-blue-300" /> Dependency Graph
            </div>
            {scan && (
              <div className="absolute top-3 right-4 z-10 hidden sm:flex items-center gap-3 text-[11px] text-slate-400 pointer-events-none">
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-emerald-500" /> Safe</span>
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-amber-500" /> Needs attention</span>
                <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-red-500" /> Vulnerability</span>
              </div>
            )}
            {nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center text-slate-400 text-sm">
                Load a project to see its architecture
                <button onClick={() => setLoadOpen(true)} className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Load Project</button>
              </div>
            )}
            <ReactFlow nodes={displayNodes} edges={displayEdges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={(_, n) => selectFile(n.id)}
              fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.1} proOptions={{ hideAttribution: true }}>
              <Background color="#334155" gap={18} />
              <Controls showInteractive={false} />
              {nodes.length > 25 && (
                <MiniMap pannable zoomable className="hidden md:block" nodeColor="#4f46e5"
                  maskColor="rgba(5,8,22,.5)" style={{ width: 140, height: 90, background: '#0a1026' }} />
              )}
            </ReactFlow>
          </section>

          <section className={`${panel} ${mobileTab === 'code' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:h-[36%] lg:min-h-[190px] flex-col min-h-0`}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-blue-500/15">
              <h2 className="text-sm font-semibold flex items-center gap-2 shrink-0"><Code2 className="w-4 h-4 text-blue-300" /> Code Viewer</h2>
              {selectedNode && (
                <span className="text-xs text-slate-400 truncate">{short(selectedNode.data.path)} · {selectedNode.data.lines} lines</span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto py-2 font-mono text-[12px] leading-5">
              {selectedNode
                ? codeLines.map((l, i) => (
                    <div key={i} ref={focusLine === i + 1 ? focusRef : null}
                      className={`flex border-l-2 ${
                        lineSev[i + 1] === 'high' ? 'border-red-500 bg-red-500/10' : lineSev[i + 1] ? 'border-amber-500 bg-amber-500/10' : 'border-transparent'
                      } ${focusLine === i + 1 ? 'ring-1 ring-inset ring-indigo-400' : ''}`}>
                      <span className="w-12 shrink-0 text-right pr-4 text-slate-600 select-none">{i + 1}</span>
                      <span className="whitespace-pre text-slate-300">{l}</span>
                    </div>
                  ))
                : <p className="px-4 text-slate-500 font-sans text-sm">Graph එකේ හෝ file tree එකේ file එකක් select කරන්න.</p>}
            </div>
            <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-t border-blue-500/15">
              <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
              <span className="text-sm font-medium hidden sm:inline">AI RAG Chat</span>
              <input disabled placeholder="Ask anything about this codebase... (coming soon)" title="Coming soon"
                className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-slate-800 bg-slate-950/50 text-sm placeholder:text-slate-600" />
              <button disabled className="h-9 w-10 shrink-0 rounded-lg bg-blue-600/40 flex items-center justify-center"><Send className="w-4 h-4" /></button>
            </div>
          </section>
        </main>

        {/* Right: AI panel */}
        <aside className={`${panel} ${mobileTab === 'ai' ? 'block' : 'hidden'} lg:block flex-1 lg:flex-none min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4`}>
          <div className="flex gap-2">
            {AGENTS.map(({ id, label, icon: Icon, ready }) => (
              <button key={id} disabled={!ready} onClick={() => setAgent(id)} title={ready ? label : 'Coming soon'}
                className={`flex-1 min-w-0 rounded-lg border px-1.5 py-1.5 text-[11px] flex items-center justify-center gap-1 transition-colors ${
                  !ready ? 'border-slate-800 text-slate-500' : agent === id ? 'border-blue-500/60 bg-blue-500/15 text-white' : 'border-slate-700 text-slate-300 hover:border-blue-500/60'
                }`}>
                {ready ? <Icon className="w-4 h-4" /> : <Lock className="w-3.5 h-3.5" />} {label}
              </button>
            ))}
          </div>

          {agent === 'sec' ? securityPanel : agent === 'flow' ? flowPanel : !selectedNode ? (
            <p className="text-sm text-slate-500">File එකක් select කළාම ඒකේ AI audit සහ details මෙතන පෙනෙනවා.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold truncate">{selectedNode.data.label}</p>
                <button onClick={() => { setSelectedId(null); setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); }}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
              </div>

              <button onClick={handleAIAnalysis} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 font-medium py-2.5 rounded-xl disabled:opacity-50">
                <Sparkles className="w-4 h-4" />
                {aiLoading ? 'Analyzing Code with AI...' : 'Run Architecture AI Audit'}
              </button>

              {aiError && (
                <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">{aiError}</p>
              )}

              {analysis.en && auditView(false)}

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><ArrowRightLeft className="w-4 h-4 text-indigo-400" /> Imports</div>
                  <span className="text-lg font-bold">{selectedNode.data.importsCount}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><Code2 className="w-4 h-4 text-indigo-400" /> Exports</div>
                  <span className="text-lg font-bold">{selectedNode.data.exportsList?.length || 0}</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">File Path</span>
                <p className="text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 break-all">{short(selectedNode.data.path)}</p>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden shrink-0 grid grid-cols-4 border-t border-blue-500/20 bg-[#070c24] pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map(([id, label, Icon]) => (
          <button key={id} onClick={() => setMobileTab(id)}
            className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] ${mobileTab === id ? 'text-indigo-300' : 'text-slate-500'}`}>
            <Icon className="w-5 h-5" /> {label}
          </button>
        ))}
      </nav>

      {/* Audit full view */}
      {auditOpen && analysis.en && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setAuditOpen(false)}>
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-blue-500/30 bg-[#0a1030] p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="font-semibold truncate">{selectedNode?.data.label}</p>
              <button onClick={() => setAuditOpen(false)} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-5 h-5" /></button>
            </div>
            {auditView(true)}
          </div>
        </div>
      )}
    </div>
  );
}
