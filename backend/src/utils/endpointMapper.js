// Express endpoint map + authentication coverage (AST, AI නැහැ)
// route -> middleware -> controller -> model දාමය හදනවා, ඒ වගේම auth නැති endpoints හඳුනාගන්නවා.
import { parseCode, traverse } from './astParser.js';

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']);
const OBJ_RE = /^(router|app|route|routes|api|server|\w*router|\w*routes|\w*app)$/i;
const MODEL_RE = /mongoose\.model\s*\(|new\s+(?:mongoose\.)?Schema\s*\(|sequelize\.define\s*\(/;
const CANDIDATE_RE = /\.(get|post|put|patch|delete|all|use|route)\s*\(/;
// Login/register වගේ ඒවා හිතාමතාම public
const PUBLIC_RE = /(login|logout|register|signup|sign-up|signin|sign-in|forgot|reset|refresh|health|status|ping|callback|webhook|public|^\/?$)/i;

// අනුපිළිවෙල වැදගත්: authLimiter (limiter) / authorize (role) auth ලෙස වැරදි වර්ගීකරණය නොවෙන්න
const KIND_RULES = [
  ['limiter', /(limit|throttle)/i],
  ['validation', /(valid|schema|joi|zod|celebrate|sanitiz)/i],
  ['upload', /(upload|multer)/i],
  ['role', /(role|admin|permission|authori[sz]e|rbac|checkaccess)/i],
  ['auth', /(auth|protect|verify|jwt|token|guard|session|passport|loggedin|requireuser|ensure)/i],
];
const classify = (text, file) => {
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return file && /auth/i.test(file) ? 'auth' : 'other';
};

const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '/index.js', '/index.ts', '/index.jsx', '/index.tsx'];
const normalize = (p) => {
  const out = [];
  p.split('/').forEach((seg) => {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  });
  return out.join('/');
};
const joinPath = (...parts) =>
  `/${parts.filter(Boolean).map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ---------- AST helpers ---------- */
const chainOf = (n) => {
  const out = [];
  let cur = n;
  while (cur && (cur.type === 'MemberExpression' || cur.type === 'OptionalMemberExpression')) {
    const p = cur.property;
    out.unshift(cur.computed ? (p && p.value !== undefined ? String(p.value) : '?') : (p && p.name) || '?');
    cur = cur.object;
  }
  out.unshift(cur && cur.type === 'Identifier' ? cur.name : '?');
  return out;
};
const pathOf = (n) => {
  if (!n) return null;
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis.map((q) => q.value.cooked).join('');
  return null;
};
const flatten = (args) => args.flatMap((a) => (a && a.type === 'ArrayExpression' ? flatten(a.elements.filter(Boolean)) : [a]));

const handlerOf = (n) => {
  if (!n) return null;
  switch (n.type) {
    case 'Identifier': return { text: n.name, object: null, name: n.name };
    case 'MemberExpression':
    case 'OptionalMemberExpression': {
      const c = chainOf(n);
      return { text: c.join('.'), object: c[0], name: c[c.length - 1] };
    }
    case 'CallExpression': {
      const a0 = n.arguments[0];
      if (n.callee.type === 'Identifier' && n.callee.name === 'require' && a0 && a0.type === 'StringLiteral') {
        return { text: `require('${a0.value}')`, requireSource: a0.value, name: '' };
      }
      const inner = handlerOf(n.callee);
      return inner ? { ...inner, text: `${inner.text}()` } : null;
    }
    case 'ArrowFunctionExpression':
    case 'FunctionExpression': return { text: '(inline handler)', inline: true, name: '' };
    default: return null;
  }
};

// router.route('/x').get(a).post(b) => { obj: 'router', path: '/x' }
const unwrapRoute = (n) => {
  let cur = n;
  while (cur && cur.type === 'CallExpression' && cur.callee.type === 'MemberExpression') {
    const c = cur.callee;
    if (!c.computed && c.property && c.property.name === 'route') {
      return c.object.type === 'Identifier' ? { obj: c.object.name, path: pathOf(cur.arguments[0]) ?? '' } : null;
    }
    cur = c.object;
  }
  return null;
};

/* ---------- එක file එකක් ගැන තොරතුරු ---------- */
const extractFile = (code, relPath) => {
  const info = { path: relPath, code, imports: {}, routes: [], uses: [], fns: {} };
  const ast = parseCode(code);
  const routerVars = new Set();
  const setImport = (local, source, name) => { info.imports[local] = { source, name }; };
  const range = (n) => (typeof n.start === 'number' && typeof n.end === 'number' ? [n.start, n.end] : null);
  const isFn = (n) => n && (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression');

  traverse(ast, {
    ImportDeclaration({ node }) {
      node.specifiers.forEach((s) => {
        if (s.type === 'ImportDefaultSpecifier') setImport(s.local.name, node.source.value, 'default');
        else if (s.type === 'ImportNamespaceSpecifier') setImport(s.local.name, node.source.value, '*');
        else setImport(s.local.name, node.source.value, (s.imported && (s.imported.name || s.imported.value)) || s.local.name);
      });
    },
    VariableDeclarator({ node }) {
      const { id, init } = node;
      if (!init) return;
      // const x = require('...') / const { a, b } = require('...')
      if (init.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'require') {
        const src = pathOf(init.arguments[0]);
        if (src !== null) {
          if (id.type === 'Identifier') setImport(id.name, src, 'default');
          else if (id.type === 'ObjectPattern') {
            id.properties.forEach((p) => {
              if (p.type === 'ObjectProperty' && p.value && p.value.type === 'Identifier') {
                setImport(p.value.name, src, (p.key && (p.key.name || p.key.value)) || p.value.name);
              }
            });
          }
        }
      }
      // const router = express.Router() / const app = express()
      if (id.type === 'Identifier' && init.type === 'CallExpression') {
        const cc = chainOf(init.callee);
        if (cc.join('.') === 'express.Router' || cc[0] === 'Router' || cc.join('.') === 'express') routerVars.add(id.name);
      }
      if (id.type === 'Identifier' && isFn(init)) {
        const r = range(node);
        if (r) info.fns[id.name] = r;
      }
    },
    FunctionDeclaration({ node }) {
      const r = range(node);
      if (node.id && r) info.fns[node.id.name] = r;
    },
    // exports.fn = async () => {} / module.exports.fn = ...
    AssignmentExpression({ node }) {
      const c = chainOf(node.left);
      if ((c[0] === 'exports' || (c[0] === 'module' && c[1] === 'exports')) && c.length >= 2 && isFn(node.right)) {
        const r = range(node.right);
        if (r) info.fns[c[c.length - 1]] = r;
      }
    },
    CallExpression({ node }) {
      const c = node.callee;
      if (c.type !== 'MemberExpression' || c.computed || !c.property) return;
      const method = c.property.name;
      const isUse = method === 'use';
      if (!METHODS.has(method) && !isUse) return;

      let objName = null;
      let routePath = null;
      if (c.object.type === 'Identifier') objName = c.object.name;
      else if (c.object.type === 'CallExpression') {
        const r = unwrapRoute(c.object);
        if (!r) return;
        objName = r.obj;
        routePath = r.path;
      } else return;
      if (!objName || !(routerVars.has(objName) || OBJ_RE.test(objName))) return;

      const args = flatten(node.arguments);
      const line = (node.loc && node.loc.start && node.loc.start.line) || 0;

      if (isUse) {
        const p = pathOf(args[0]);
        const handlers = (p !== null ? args.slice(1) : args).map(handlerOf).filter(Boolean);
        if (handlers.length) info.uses.push({ path: p || '', args: handlers, line });
        return;
      }
      let p = routePath;
      let handlerNodes = args;
      if (p === null) {
        p = pathOf(args[0]);
        handlerNodes = p !== null ? args.slice(1) : args;
      }
      const handlers = handlerNodes.map(handlerOf).filter(Boolean);
      if (!handlers.length) return; // app.get('env') වගේ settings
      info.routes.push({ method, path: p || '', handlers, line });
    },
  });
  return info;
};

/* ---------- මුළු project එකම ---------- */
export const mapEndpoints = (entries) => {
  const fileSet = new Set(entries.map((e) => e.path));
  const codeOf = new Map(entries.map((e) => [e.path, e.code]));
  const modelSet = new Set(entries.filter((e) => MODEL_RE.test(e.code)).map((e) => e.path));
  const cache = new Map();

  const getInfo = (path) => {
    if (!path || !codeOf.has(path)) return null;
    if (!cache.has(path)) {
      try { cache.set(path, extractFile(codeOf.get(path), path)); } catch { cache.set(path, null); }
    }
    return cache.get(path);
  };
  const resolve = (from, source) => {
    if (!source || !source.startsWith('.')) return null;
    const dir = from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '';
    const base = normalize(`${dir}/${source}`);
    for (const ext of EXTS) if (fileSet.has(base + ext)) return base + ext;
    return null;
  };

  // Route files (router.get/post/use ඇති files)
  const candidates = entries
    .filter((e) => CANDIDATE_RE.test(e.code) && !modelSet.has(e.path))
    .map((e) => getInfo(e.path))
    .filter((i) => i && (i.routes.length || i.uses.length));
  const routeFiles = new Map(candidates.map((i) => [i.path, i]));

  const fileOfHandler = (from, h) => {
    if (h.requireSource) return resolve(from, h.requireSource);
    const imp = (getInfo(from) || { imports: {} }).imports[h.object || h.name];
    return imp ? resolve(from, imp.source) : null;
  };
  const mountTarget = (from, h) => {
    const f = fileOfHandler(from, h);
    return f && routeFiles.has(f) ? routeFiles.get(f) : null;
  };

  // කොයි route files වෙනත් file එකකින් mount කරලාද
  const mounted = new Set();
  candidates.forEach((file) => file.uses.forEach((u) => u.args.forEach((h) => {
    const t = mountTarget(file.path, h);
    if (t) mounted.add(t.path);
  })));

  const modelsFor = (path, fn) => {
    const info = getInfo(path);
    if (!info) return [];
    const r = info.fns[fn];
    const body = r ? info.code.slice(r[0], r[1]) : info.code;
    const out = [];
    Object.entries(info.imports).forEach(([local, imp]) => {
      const target = resolve(path, imp.source);
      if (target && modelSet.has(target) && new RegExp(`\\b${escapeRe(local)}\\b`).test(body)) out.push({ name: local, file: target });
    });
    return out;
  };

  const endpoints = [];
  const issues = [];

  const emit = (file, r, fullPath, mwItems, chain) => {
    const middleware = mwItems.map(({ h, from }) => {
      const f = fileOfHandler(from, h);
      return { text: h.text, kind: classify(h.text, f), file: f };
    });
    const ctrlH = r.handlers[r.handlers.length - 1];
    let ctrl = { text: ctrlH.text, file: file.path, fn: ctrlH.name };
    if (!ctrlH.inline) {
      const imp = file.imports[ctrlH.object || ctrlH.name];
      if (imp) {
        ctrl = {
          text: ctrlH.text,
          file: resolve(file.path, imp.source),
          fn: imp.name === 'default' || imp.name === '*' ? (ctrlH.object ? ctrlH.name : 'default') : imp.name,
        };
      }
    } else ctrl.fn = '';
    const models = ctrl.file && !ctrlH.inline ? modelsFor(ctrl.file, ctrl.fn) : [];

    const isProtected = middleware.some((m) => m.kind === 'auth' || m.kind === 'role');
    const isPublic = PUBLIC_RE.test(fullPath) && !isProtected;
    const method = r.method.toUpperCase();
    endpoints.push({ method, path: fullPath, file: file.path, line: r.line, middleware, controller: ctrl, models, protected: isProtected, public: isPublic, mountFiles: chain });

    const snippet = ((codeOf.get(file.path) || '').split('\n')[r.line - 1] || '').trim().slice(0, 140);
    if (!isProtected && !isPublic && r.method !== 'options' && r.method !== 'head') {
      issues.push({
        file: file.path, line: r.line, rule: 'missing-auth', snippet,
        severity: r.method === 'get' ? 'low' : r.method === 'post' ? 'medium' : 'high',
        message: `\`${method} ${fullPath}\` has no authentication middleware before \`${ctrlH.text}\`. If it is meant to be public that is fine, otherwise anyone can call it.`,
      });
    }
    if (isProtected && /\/admin(\/|$)/i.test(fullPath) && !middleware.some((m) => m.kind === 'role')) {
      issues.push({
        file: file.path, line: r.line, rule: 'missing-role-check', severity: 'medium', snippet,
        message: `\`${method} ${fullPath}\` looks like an admin route but only checks that the user is logged in, not their role.`,
      });
    }
  };

  const walk = (file, prefix, inherited, depth, chain = []) => {
    if (depth > 6) return;
    const mounts = [];
    const mws = [];
    [...file.uses].sort((a, b) => a.line - b.line).forEach((u) => {
      const targets = [];
      const others = [];
      u.args.forEach((h) => {
        const t = mountTarget(file.path, h);
        if (t) targets.push(t); else others.push(h);
      });
      if (targets.length) targets.forEach((t) => mounts.push({ u, file: t, others }));
      else others.forEach((h) => mws.push({ h, from: file.path, line: u.line, scope: joinPath(prefix, u.path) }));
    });

    const inScope = (fullPath) => (m) => !m.scope || m.scope === '/' || fullPath === m.scope || fullPath.startsWith(`${m.scope}/`);

    [...file.routes].sort((a, b) => a.line - b.line).forEach((r) => {
      const fullPath = joinPath(prefix, r.path);
      const items = [...inherited, ...mws.filter((m) => m.line < r.line)].filter(inScope(fullPath))
        .map((m) => ({ h: m.h, from: m.from }))
        .concat(r.handlers.slice(0, -1).map((h) => ({ h, from: file.path })));
      emit(file, r, fullPath, items, chain);
    });

    mounts.forEach((m) => {
      const scope = joinPath(prefix, m.u.path);
      walk(
        m.file,
        scope,
        [...inherited, ...mws.filter((x) => x.line < m.u.line), ...m.others.map((h) => ({ h, from: file.path, line: m.u.line, scope }))],
        depth + 1,
        [...chain, file.path]
      );
    });
  };

  candidates.filter((f) => !mounted.has(f.path)).forEach((root) => walk(root, '', [], 0));

  const open = endpoints.filter((e) => !e.protected && !e.public).length;
  return {
    endpoints,
    issues,
    stats: {
      total: endpoints.length,
      protected: endpoints.filter((e) => e.protected).length,
      public: endpoints.filter((e) => e.public).length,
      open,
    },
  };
};
