// Dependency graph එකෙන් ව්‍යුහාත්මක ගැටලු හොයනවා (AI නැහැ): circular imports, god files, layer violations, unused files

const LAYER_RANK = { route: 0, middleware: 1, controller: 1, service: 2, model: 3 };
const LAYER_BY_DIR = [
  ['route', /^(routes?|routers?)$/],
  ['middleware', /^middlewares?$/],
  ['controller', /^controllers?$/],
  ['service', /^services?$/],
  ['model', /^(models?|entities|schemas?)$/],
];
const ENTRY_RE = /^(server|app|index|main|setup|seed)\.|\.config\.|^vite\.|^eslint\./i;
const TEST_RE = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\./i;

const layerOf = (path) => {
  const dirs = path.split('/').slice(0, -1).map((d) => d.toLowerCase());
  for (let i = dirs.length - 1; i >= 0; i--) {
    for (const [layer, re] of LAYER_BY_DIR) if (re.test(dirs[i])) return layer;
  }
  return null;
};

// Tarjan SCC (circular imports = size > 1 ඇති strongly connected component)
const findSccs = (ids, adj) => {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const strong = (v) => {
    idx.set(v, index); low.set(v, index); index += 1;
    stack.push(v); onStack.add(v);
    (adj.get(v) || []).forEach((w) => {
      if (!idx.has(w)) { strong(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    });
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  ids.forEach((v) => { if (!idx.has(v)) strong(v); });
  return out;
};

// SCC එක ඇතුළේ සැබෑ cycle එකක් (a -> b -> c -> a) BFS වලින්
const cyclePath = (comp, adj) => {
  const inComp = new Set(comp);
  const start = comp[0];
  const prev = new Map();
  const queue = [];
  (adj.get(start) || []).forEach((n) => { if (inComp.has(n) && !prev.has(n)) { prev.set(n, start); queue.push(n); } });
  while (queue.length) {
    const cur = queue.shift();
    if (cur === start) break;
    (adj.get(cur) || []).forEach((n) => { if (inComp.has(n) && !prev.has(n)) { prev.set(n, cur); queue.push(n); } });
  }
  // start -> ... -> start ලෙස cycle එක ආපසු හදනවා
  const chain = [];
  let cur = prev.get(start);
  let guard = 0;
  while (cur && cur !== start && guard++ < comp.length + 2) { chain.unshift(cur); cur = prev.get(cur); }
  return prev.has(start) ? [start, ...chain, start] : [start, ...comp.filter((x) => x !== start), start];
};

export const analyzeArchitecture = (nodes, edges) => {
  const ids = nodes.map((n) => n.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const adj = new Map(ids.map((id) => [id, []]));
  const fanIn = new Map(ids.map((id) => [id, 0]));
  const seen = new Set();
  edges.forEach((e) => {
    const k = `${e.source}>${e.target}`;
    if (seen.has(k) || !byId.has(e.source) || !byId.has(e.target)) return;
    seen.add(k);
    adj.get(e.source).push(e.target);
    fanIn.set(e.target, fanIn.get(e.target) + 1);
  });

  const pathOf = (id) => byId.get(id).data.path;
  const labelOf = (id) => byId.get(id).data.label;
  const issues = [];

  // 1) Circular dependencies
  findSccs(ids, adj).forEach((comp) => {
    const selfLoop = comp.length === 1 && (adj.get(comp[0]) || []).includes(comp[0]);
    if (comp.length < 2 && !selfLoop) return;
    const path = comp.length > 1 ? cyclePath(comp, adj) : [comp[0], comp[0]];
    issues.push({
      id: 'ARCH-001', severity: 'high', title: 'Circular dependency',
      message: comp.length > 1
        ? `${comp.length} files import each other in a loop, so none of them can be understood, tested or changed on its own.`
        : `${labelOf(comp[0])} imports itself.`,
      fix: 'Break the loop: move the shared code into a third module that both files import, or pass the needed value in as a function argument instead of importing it.',
      nodeIds: comp, files: comp.map(pathOf), cycle: path.map(pathOf),
    });
  });

  // 2) Layer violations: පහළ layer එකක් ඉහළ layer එකක් import කරනවා (උදා: model -> controller)
  seen.forEach((k) => {
    const [from, to] = k.split('>');
    const lf = layerOf(pathOf(from));
    const lt = layerOf(pathOf(to));
    if (lf && lt && LAYER_RANK[lf] > LAYER_RANK[lt]) {
      issues.push({
        id: 'ARCH-002', severity: 'medium', title: 'Layer violation',
        message: `A ${lf} imports a ${lt}: ${labelOf(from)} → ${labelOf(to)}. Lower layers should not depend on higher ones.`,
        fix: `Keep the dependency direction route → controller → service → model. Move the shared logic down into a ${lf}-level or service module instead of importing a ${lt}.`,
        nodeIds: [from, to], files: [pathOf(from), pathOf(to)],
      });
    }
  });

  // 3) God files (hub / orchestrator / large)
  const hubMin = Math.max(6, Math.ceil(ids.length * 0.25));
  nodes.forEach((n) => {
    const fi = fanIn.get(n.id);
    const fo = adj.get(n.id).length;
    const lines = n.data.lines || 0;
    const parts = [];
    if (fi >= hubMin) parts.push(`it is imported by ${fi} files, so a change here can break many places`);
    if (fo >= 12) parts.push(`it imports ${fo} files, so it knows too much`);
    if (lines >= 400) parts.push(`it has ${lines} lines`);
    if (!parts.length) return;
    issues.push({
      id: 'ARCH-003', severity: fi >= hubMin || fo >= 12 ? 'medium' : 'low', title: 'God file',
      message: `${labelOf(n.id)}: ${parts.join('; ')}.`,
      fix: 'Split it into smaller modules that each do one thing, and let other files import only the part they need.',
      nodeIds: [n.id], files: [pathOf(n.id)],
    });
  });

  // 4) Possibly unused: කිසිම file එකක් import කරන්නේ නැති, entry එකක් නොවන (එක issue එකක් ලෙස)
  const orphans = nodes.filter((n) => fanIn.get(n.id) === 0 && !ENTRY_RE.test(n.data.label) && !TEST_RE.test(n.data.path));
  if (orphans.length) {
    const shown = orphans.slice(0, 12);
    issues.push({
      id: 'ARCH-004', severity: 'low', title: 'Possibly unused files',
      message: `${orphans.length} file${orphans.length === 1 ? ' is' : 's are'} not imported by any other file and not a known entry file (dynamic imports are not detected, so double-check).`,
      fix: 'If a file is really unused, delete it. If it is an entry point (script, job, migration), keep it and ignore this warning.',
      nodeIds: shown.map((n) => n.id), files: shown.map((n) => n.data.path),
    });
  }

  const W = { high: 10, medium: 5, low: 2 };
  const counts = { high: 0, medium: 0, low: 0 };
  issues.forEach((it) => { counts[it.severity] += 1; });
  const score = Math.max(0, 100 - counts.high * W.high - counts.medium * W.medium - counts.low * W.low);

  const present = [...new Set(nodes.map((n) => layerOf(n.data.path)).filter(Boolean))].sort((a, b) => LAYER_RANK[a] - LAYER_RANK[b]);
  return {
    score,
    label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At risk',
    metrics: { files: ids.length, edges: seen.size, cycles: issues.filter((it) => it.id === 'ARCH-001').length, layers: present },
    counts,
    issues,
  };
};
