import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow, Controls, Background, Handle, Position, useNodesState, useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  UploadCloud, FileCode, Folder, ChevronRight, ChevronDown, Search, Sparkles, LogOut,
  Lock, Send, ShieldCheck, Network, Wrench, ArrowRightLeft, Code2, X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Markdown from '../components/Markdown';

/* ---------- Graph ---------- */
const W = 210, H = 56;

const getLayoutedElements = (nodes, edges) => {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 80 });
  nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      return { ...n, type: 'file', position: { x: p.x - W / 2, y: p.y - H / 2 } };
    }),
    edges,
  };
};

function FileNode({ data }) {
  const folder = data.path.split('/').slice(0, -1).join('/') || '/';
  return (
    <div className="file-node">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <FileCode className="w-5 h-5 text-indigo-300 shrink-0" />
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold">{data.label}</p>
        <p className="truncate text-[10px] text-slate-500">{folder}</p>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}
const nodeTypes = { file: FileNode };

/* ---------- File tree ---------- */
const buildTree = (nodes) => {
  const root = { children: {}, files: [] };
  nodes.forEach((n) => {
    let cur = root;
    n.data.path.split('/').slice(0, -1).forEach((d) => {
      cur = cur.children[d] ??= { children: {}, files: [] };
    });
    cur.files.push(n);
  });
  return root;
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
  { id: 'arch', label: 'Architecture', icon: Network, ready: true },
  { id: 'sec', label: 'Security', icon: ShieldCheck, ready: false },
  { id: 'ref', label: 'Refactoring', icon: Wrench, ready: false },
];

export default function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  // Load project
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

  const selectedNode = nodes.find((n) => n.id === selectedId) || null;
  const analysis = analyses[selectedId] || {};
  const aiAnalysis = analysis[lang] || '';
  const tree = useMemo(() => buildTree(nodes), [nodes]);
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
    return {
      files: nodes.length,
      loc: nodes.reduce((s, n) => s + (n.data.lines || 0), 0),
      deps: edges.length,
      hub,
    };
  }, [nodes, edges]);

  const handleLogout = () => { logout(); navigate('/'); };

  const selectFile = (id) => {
    setSelectedId(id);
    setLang('en');
    setAiError('');
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
  };

  const applyGraph = (data, meta, name) => {
    const l = getLayoutedElements(data.nodes, data.edges);
    setNodes(l.nodes);
    setEdges(l.edges);
    setSelectedId(null);
    setAnalyses({});
    setTruncated(!!meta?.truncated);
    setProjectName(name);
    setLoadOpen(false);
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

  // භාෂාව මාරු කරනවා. තවම translate කරලා නැත්නම් විතරක් request එකක් යවනවා (cache කරනවා)
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

  const codeLines = (selectedNode?.data.code || selectedNode?.data.codeSnippet || '').split('\n');
  const panel = 'rounded-xl border border-blue-500/20 bg-[#070c24]';

  return (
    <div className="h-screen flex flex-col bg-[#050816] text-slate-100 font-sans overflow-hidden">
      {/* ===== Top bar ===== */}
      <header className="h-16 shrink-0 flex items-center justify-between px-5 border-b border-blue-500/20 bg-[#070c24]">
        <div className="flex items-center gap-6">
          <Logo size={30} />
          <div className="hidden md:block border-l border-slate-700 pl-6">
            <p className="text-sm font-semibold truncate max-w-[260px]">{projectName || 'No project loaded'}</p>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <i className={`w-1.5 h-1.5 rounded-full ${projectName ? 'bg-emerald-400' : 'bg-slate-600'}`} /> Active Project
            </p>
          </div>
        </div>

        <div className="relative">
          <button onClick={() => setLoadOpen(!loadOpen)}
            className="h-10 px-4 rounded-lg border border-blue-500/50 hover:bg-blue-500/10 text-sm flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-blue-300" /> GitHub / ZIP Upload
          </button>
          {loadOpen && (
            <div className="absolute right-0 mt-2 w-96 z-30 p-4 rounded-xl border border-blue-500/30 bg-[#0a1030] shadow-2xl space-y-3">
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
                    className="w-full h-10 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 text-sm font-medium disabled:opacity-50">
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

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-tight">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.email}</p>
          </div>
          <button onClick={handleLogout} title="Logout" className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ===== Body ===== */}
      <div className="flex-1 min-h-0 grid grid-cols-[270px_1fr_340px] gap-3 p-3">
        {/* Left: files + stats */}
        <aside className="flex flex-col gap-3 min-h-0">
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
                      <span className="truncate">{f.data.path}</span>
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
        <main className="flex flex-col gap-3 min-h-0 min-w-0">
          <section className={`${panel} flex-1 min-h-0 relative overflow-hidden`}>
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2 text-sm font-semibold pointer-events-none">
              <Network className="w-4 h-4 text-blue-300" /> Code Architecture Dependency Graph
            </div>
            {nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-slate-400 text-sm">
                Load a project to see its architecture
                <button onClick={() => setLoadOpen(true)} className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">Load Project</button>
              </div>
            )}
            <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onNodeClick={(_, n) => selectFile(n.id)} fitView proOptions={{ hideAttribution: true }}>
              <Background color="#334155" gap={18} />
              <Controls />
            </ReactFlow>
          </section>

          <section className={`${panel} h-[36%] min-h-[190px] flex flex-col`}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-500/15">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Code2 className="w-4 h-4 text-blue-300" /> Code Viewer</h2>
              {selectedNode && <span className="text-xs text-slate-400">{selectedNode.data.path} · {selectedNode.data.lines} lines</span>}
            </div>
            <div className="flex-1 overflow-auto py-2 font-mono text-[12px] leading-5">
              {selectedNode
                ? codeLines.map((l, i) => (
                    <div key={i} className="flex">
                      <span className="w-12 shrink-0 text-right pr-4 text-slate-600 select-none">{i + 1}</span>
                      <span className="whitespace-pre text-slate-300">{l}</span>
                    </div>
                  ))
                : <p className="px-4 text-slate-500 font-sans text-sm">Graph එකේ හෝ file tree එකේ file එකක් select කරන්න.</p>}
            </div>
            <div className="flex items-center gap-3 px-3 py-2 border-t border-blue-500/15">
              <Sparkles className="w-4 h-4 text-violet-300" />
              <span className="text-sm font-medium">AI RAG Chat</span>
              <input disabled placeholder="Ask anything about this codebase... (coming soon)" title="Coming soon"
                className="flex-1 h-9 px-3 rounded-lg border border-slate-800 bg-slate-950/50 text-sm placeholder:text-slate-600" />
              <button disabled className="h-9 w-10 rounded-lg bg-blue-600/40 flex items-center justify-center"><Send className="w-4 h-4" /></button>
            </div>
          </section>
        </main>

        {/* Right: AI panel */}
        <aside className={`${panel} min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4`}>
          <h2 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-300" /> AI Agents</h2>
          <div className="grid grid-cols-3 gap-2">
            {AGENTS.map(({ id, label, icon: Icon, ready }) => (
              <div key={id} className={`rounded-lg border p-2.5 text-center text-xs relative ${ready ? 'border-blue-500/60 bg-blue-500/10' : 'border-slate-800 opacity-50'}`}>
                {!ready && <Lock className="w-3 h-3 absolute top-1.5 right-1.5" />}
                <Icon className="w-5 h-5 mx-auto mb-1" /> {label}
              </div>
            ))}
          </div>

          {!selectedNode ? (
            <p className="text-sm text-slate-500">File එකක් select කළාම ඒකේ details සහ AI audit මෙතන පෙනෙනවා.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="font-semibold truncate">{selectedNode.data.label}</p>
                <button onClick={() => { setSelectedId(null); setNodes((ns) => ns.map((n) => ({ ...n, selected: false }))); }}
                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"><X className="w-4 h-4" /></button>
              </div>

              <button onClick={handleAIAnalysis} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 font-medium py-2.5 rounded-xl disabled:opacity-50">
                <Sparkles className="w-4 h-4 text-amber-300" />
                {aiLoading ? 'Analyzing Code with AI...' : 'Run Architecture AI Audit'}
              </button>

              {aiError && (
                <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">{aiError}</p>
              )}

              {analysis.en && (
                <div className="bg-indigo-950/40 border border-indigo-800/50 p-3 rounded-xl">
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300 mb-2">AI Architecture Insights</p>
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
                    <Markdown text={aiAnalysis} />
                  )}
                </div>
              )}

              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">File Path</span>
                <p className="text-xs font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 break-all">{selectedNode.data.path}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><ArrowRightLeft className="w-4 h-4 text-indigo-400" /> Imports</div>
                  <span className="text-lg font-bold">{selectedNode.data.importsCount}</span>
                </div>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><Code2 className="w-4 h-4 text-emerald-400" /> Exports</div>
                  <span className="text-lg font-bold">{selectedNode.data.exportsList?.length || 0}</span>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
