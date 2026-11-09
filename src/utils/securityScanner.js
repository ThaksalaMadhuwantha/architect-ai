// Rules-based security scanner (AST + patterns). AI නැහැ, නොමිලේ, තත්පර කීපයකින් මුළු repo එකම scan කරනවා.
// හැම finding එකකටම CWE අංකයක් සහ fix උපදෙසක් තියෙනවා.
import { parseCode, traverse } from './astParser.js';

export const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const WEIGHT = { high: 10, medium: 4, low: 1 };

const RULES = {
  'hardcoded-secret': { id: 'SEC-001', title: 'Hardcoded secret', cwe: 'CWE-798', fix: 'Move the value to an environment variable (process.env.X), keep it out of git, and rotate it, because it is already exposed in the source.' },
  'code-execution': { id: 'SEC-002', title: 'Dynamic code execution', cwe: 'CWE-95', fix: 'Avoid eval and new Function. Parse data with JSON.parse or use a lookup table instead.' },
  'command-injection': { id: 'SEC-003', title: 'Possible command injection', cwe: 'CWE-78', fix: 'Use execFile/spawn with an argument array (no shell) and validate input against an allow-list.' },
  'nosql-injection': { id: 'SEC-004', title: 'Possible NoSQL injection', cwe: 'CWE-943', fix: 'Cast the input to the expected type (e.g. String(value)) or validate it with a schema (Joi/Zod). express-mongo-sanitize also helps.' },
  'mass-assignment': { id: 'SEC-005', title: 'Mass assignment from request body', cwe: 'CWE-915', fix: 'Pick only the allowed fields (const { name, email } = req.body) instead of passing the whole body to the database.' },
  'jwt-hardcoded': { id: 'SEC-006', title: 'Hardcoded JWT secret', cwe: 'CWE-321', fix: 'Read the secret from process.env and use a long random value.' },
  'secret-fallback': { id: 'SEC-007', title: 'Insecure default secret', cwe: 'CWE-798', fix: 'Fail at startup when the environment variable is missing instead of falling back to a known default.' },
  'cors-open': { id: 'SEC-008', title: 'Overly permissive CORS', cwe: 'CWE-942', fix: 'Allow only your real front-end origins, e.g. cors({ origin: ["https://your-app.com"] }).' },
  'xss-sink': { id: 'SEC-009', title: 'Possible XSS sink', cwe: 'CWE-79', fix: 'Avoid innerHTML / dangerouslySetInnerHTML with dynamic data. Render text normally or sanitize it (DOMPurify).' },
  'path-traversal': { id: 'SEC-010', title: 'Possible path traversal', cwe: 'CWE-22', fix: 'Use path.basename on user input and check the resolved path stays inside the allowed folder.' },
  'weak-hash': { id: 'SEC-011', title: 'Weak hash algorithm', cwe: 'CWE-328', fix: 'Use bcrypt/argon2 for passwords and SHA-256 or better for integrity checks.' },
  'tls-disabled': { id: 'SEC-012', title: 'TLS certificate verification disabled', cwe: 'CWE-295', fix: 'Remove rejectUnauthorized: false and fix the certificate instead.' },
  'sensitive-log': { id: 'SEC-013', title: 'Sensitive value may be logged', cwe: 'CWE-532', fix: 'Do not log passwords, tokens or keys. Log a non-sensitive identifier instead.' },
  'no-helmet': { id: 'SEC-014', title: 'No security headers (helmet)', cwe: 'CWE-693', fix: 'Add the helmet middleware: app.use(helmet()).' },
  'no-rate-limit': { id: 'SEC-015', title: 'No rate limiting', cwe: 'CWE-770', fix: 'Add express-rate-limit, at least on login and other sensitive routes.' },
};

const SECRET_PATTERNS = [
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/sk-or-v1-[A-Za-z0-9]{20,}/, 'OpenRouter API key'],
  [/sk-[A-Za-z0-9_-]{32,}/, 'secret API key'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/sk_live_[0-9A-Za-z]{16,}/, 'Stripe live key'],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'private key'],
  [/mongodb(?:\+srv)?:\/\/[^:\s/@]+:[^@\s]+@/, 'database URL with credentials'],
];

const NAME_RE = /(api[_-]?key|secret|passw(?:or)?d|pwd|token|private[_-]?key|access[_-]?key|auth[_-]?key)/i;
const NAME_SKIP = /(type|field|label|name|regex|pattern|placeholder|message|msg|error|header|prefix|storage|length|ttl|expires?|expiry|url|path)$/i;
const PLACEHOLDER = /^(your|<|\$\{|\{\{|x{3,}|change|example|placeholder|todo|dummy|\*{3,}|\.{3})/i;
const REQ_NAMES = new Set(['req', 'request']);
const REQ_PARTS = ['body', 'query', 'params', 'headers', 'cookies'];
const NOSQL_METHODS = new Set(['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'countDocuments', 'exists', 'where']);
const MASS_METHODS = new Set(['create', 'insertMany', 'findByIdAndUpdate', 'findOneAndUpdate', 'updateOne', 'updateMany', 'assign']);
const FS_METHODS = new Set(['readFile', 'readFileSync', 'createReadStream', 'sendFile', 'writeFile', 'writeFileSync', 'unlink', 'unlinkSync', 'readdir', 'readdirSync']);

/* ---------- AST helpers ---------- */
const isStr = (n) => !!n && (n.type === 'StringLiteral' || (n.type === 'TemplateLiteral' && n.expressions.length === 0));
const strVal = (n) => (n.type === 'StringLiteral' ? n.value : n.quasis.map((q) => q.value.cooked).join(''));
const keyName = (k) => (!k ? '' : k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : '');

// a.b.c => ['a','b','c']
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
const reqSource = (n) => {
  const c = chainOf(n);
  return REQ_NAMES.has(c[0]) && REQ_PARTS.includes(c[1]) ? c[1] : null;
};
const srcText = (n) => (n.type === 'Identifier' ? n.name : chainOf(n).join('.'));
const calleeProp = (node) => {
  const c = node.callee;
  return c && (c.type === 'MemberExpression' || c.type === 'OptionalMemberExpression') && !c.computed && c.property ? c.property.name : '';
};

const makeFinding = (rule, severity, line, message, snippet) => ({
  id: RULES[rule].id, rule, severity, line, title: RULES[rule].title,
  message, cwe: RULES[rule].cwe, fix: RULES[rule].fix, snippet,
});

/* ---------- per-file rules ---------- */
const runRules = (ast, code, relPath, traverseFn) => {
  const lines = code.split('\n');
  const findings = [];
  const seen = new Set();
  const modules = new Set();
  const meta = { modules: [], expressLine: 0, expressSnippet: '' };
  const isTestFile = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[jt]sx?$/.test(relPath);
  const usesCp = /child_process/.test(code);

  const tainted = new Set(); // req.* වලින් ආපු variables
  const objTainted = new Set(); // body/query වලින් ආපු (object විය හැකි) variables
  const bodyWhole = new Set(); // const data = req.body
  const origin = new Map(); // variable -> req.body / req.query ... (data-flow trace එකට)

  const add = (rule, severity, node, message, mask, extra) => {
    const line = (node && node.loc && node.loc.start && node.loc.start.line) || 0;
    const key = `${rule}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    let snippet = (lines[line - 1] || '').trim();
    if (mask) snippet = snippet.split(mask).join('***'); // secret අගය UI එකේ පෙන්නන්නේ නැහැ
    findings.push({ ...makeFinding(rule, severity, line, message, snippet.slice(0, 140)), ...extra });
  };

  const isTainted = (n) => {
    if (!n) return false;
    switch (n.type) {
      case 'Identifier': return tainted.has(n.name);
      case 'MemberExpression':
      case 'OptionalMemberExpression': return !!reqSource(n) || isTainted(n.object);
      case 'TemplateLiteral': return n.expressions.some(isTainted);
      case 'BinaryExpression': return n.operator === '+' && (isTainted(n.left) || isTainted(n.right));
      case 'CallExpression': {
        const c = chainOf(n.callee);
        return c[0] === 'path' && ['join', 'resolve', 'normalize'].includes(c[1]) && n.arguments.some(isTainted);
      }
      default: return false;
    }
  };
  // Tainted expression එකක් ආපු තැන (req.body වගේ)
  const originOf = (n) => {
    if (!n) return '';
    switch (n.type) {
      case 'Identifier': return origin.get(n.name) || '';
      case 'MemberExpression':
      case 'OptionalMemberExpression': { const s = reqSource(n); return s ? `req.${s}` : originOf(n.object); }
      case 'TemplateLiteral': return n.expressions.map(originOf).find(Boolean) || '';
      case 'BinaryExpression': return originOf(n.left) || originOf(n.right);
      case 'CallExpression': return n.arguments.map(originOf).find(Boolean) || '';
      default: return '';
    }
  };
  const isBodyLike = (n) => {
    if (!n) return false;
    if (n.type === 'Identifier') return objTainted.has(n.name);
    if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
      const s = reqSource(n);
      return s ? s === 'body' || s === 'query' : isBodyLike(n.object);
    }
    return false;
  };
  const isWholeBody = (n) => {
    if (!n) return false;
    if (n.type === 'Identifier') return bodyWhole.has(n.name);
    const c = chainOf(n);
    return n.type === 'MemberExpression' && REQ_NAMES.has(c[0]) && c.length === 2 && c[1] === 'body';
  };
  const hasWholeBody = (n) =>
    isWholeBody(n) || (n.type === 'ObjectExpression' && n.properties.some((p) => p.type === 'SpreadElement' && isWholeBody(p.argument)));

  const collectTaint = (node) => {
    const { id, init } = node;
    if (!init) return;
    const base = init.type === 'LogicalExpression' ? init.left : init;
    const names = [];
    if (id.type === 'Identifier') names.push(id.name);
    else if (id.type === 'ObjectPattern') {
      id.properties.forEach((p) => {
        if (p.type === 'ObjectProperty') {
          const v = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
          if (v.type === 'Identifier') names.push(v.name);
        } else if (p.type === 'RestElement' && p.argument.type === 'Identifier') names.push(p.argument.name);
      });
    }
    const src = reqSource(base);
    if (src) {
      names.forEach((n) => {
        tainted.add(n);
        origin.set(n, `req.${src}`);
        if (src === 'body' || src === 'query') objTainted.add(n);
      });
      if (id.type === 'Identifier' && isWholeBody(base)) bodyWhole.add(id.name);
    } else if (isTainted(base)) {
      names.forEach((n) => { tainted.add(n); origin.set(n, originOf(base)); });
      if (isBodyLike(base)) names.forEach((n) => objTainted.add(n));
    }
  };

  const checkPatterns = (value, node) => {
    for (const [re, label] of SECRET_PATTERNS) {
      const m = re.exec(value);
      if (m) return add('hardcoded-secret', 'high', node, `Looks like a ${label}.`, m[0]);
    }
  };

  const checkNamedSecret = (name, valueNode, node) => {
    if (isTestFile || !name || !NAME_RE.test(name) || NAME_SKIP.test(name) || !isStr(valueNode)) return;
    const v = strVal(valueNode);
    if (v.length < 8 || /\s/.test(v) || v.includes('/') || PLACEHOLDER.test(v)) return;
    const strong = (/\d/.test(v) && /[A-Za-z]/.test(v)) || v.length >= 16;
    add('hardcoded-secret', strong ? 'high' : 'medium', node, `"${name}" is assigned a literal value in the source code.`, v);
  };

  const visitCall = (node) => {
    const c = node.callee;
    const args = node.arguments;
    const prop = calleeProp(node);
    const cc = chainOf(c);

    if (c.type === 'Identifier') {
      if (c.name === 'eval') add('code-execution', 'high', node, 'eval() runs arbitrary code.');
      if (c.name === 'express' && args.length === 0 && !meta.expressLine) {
        meta.expressLine = node.loc.start.line;
        meta.expressSnippet = (lines[meta.expressLine - 1] || '').trim().slice(0, 140);
      }
      if (c.name === 'cors' && args.length === 0) add('cors-open', 'low', node, 'cors() with no options allows every origin.');
      if (c.name === 'require' && isStr(args[0])) modules.add(strVal(args[0]));
    }

    // child_process.exec / execSync
    const isExec = (c.type === 'Identifier' && usesCp && (c.name === 'exec' || c.name === 'execSync')) ||
      (/^(cp|child_?process)$/i.test(cc[0]) && (prop === 'exec' || prop === 'execSync'));
    if (isExec && args[0] && !isStr(args[0])) {
      if (isTainted(args[0])) {
        add('command-injection', 'high', node, `${originOf(args[0]) || 'User input'} reaches a shell command.`, undefined,
          { trace: [originOf(args[0]), `${cc.join('.')}(…)`].filter(Boolean), example: "execFile('ls', [dir])  // arguments as an array, no shell" });
      }
      else if (args[0].type === 'TemplateLiteral' || args[0].type === 'BinaryExpression') {
        add('command-injection', 'medium', node, 'A shell command is built from dynamic values.');
      }
    }

    // jwt.sign(payload, 'literal')
    if (/^(jwt|jsonwebtoken)$/i.test(cc[0]) && (prop === 'sign' || prop === 'verify') && isStr(args[1])) {
      add('jwt-hardcoded', 'high', node, 'The JWT secret is a string literal in the source code.', strVal(args[1]));
    }

    // NoSQL injection
    if (NOSQL_METHODS.has(prop) && args[0]) {
      const a = args[0];
      const risky = []; // { key, text, from }
      if (isBodyLike(a)) risky.push({ key: null, text: srcText(a), from: originOf(a) });
      else if (a.type === 'ObjectExpression') {
        a.properties.forEach((p) => {
          if (p.type === 'SpreadElement' && isBodyLike(p.argument)) risky.push({ key: null, text: srcText(p.argument), from: originOf(p.argument) });
          else if (p.type === 'ObjectProperty' && isBodyLike(p.value)) risky.push({ key: keyName(p.key), text: srcText(p.value), from: originOf(p.value) });
        });
      }
      if (risky.length) {
        const fields = risky.filter((r) => r.key);
        const names = risky.map((r) => r.text).join(', ');
        add('nosql-injection', 'medium', node,
          `${names} comes from ${risky[0].from || 'the request'} and is used directly in a ${cc.join('.')}() filter, so an attacker can send an object like {"$gt": ""} instead of a plain value.`,
          undefined,
          {
            trace: [risky[0].from, names, `${cc.join('.')}({ … })`].filter(Boolean),
            example: fields.length ? fields.map((r) => `${r.key}: String(${r.text})`).join(', ') : 'Validate the request body with a schema before querying',
          });
      }
    }

    // Mass assignment
    if (MASS_METHODS.has(prop) && args.some(hasWholeBody)) {
      add('mass-assignment', 'medium', node, 'The whole request body is passed to the database, so a client can set fields such as role or isAdmin.', undefined,
        { trace: ['req.body', `${cc.join('.')}(…)`], example: 'const { name, email } = req.body;  // use only the fields you allow' });
    }

    // Path traversal
    if (FS_METHODS.has(prop) && args[0] && isTainted(args[0])) {
      add('path-traversal', 'high', node, `${originOf(args[0]) || 'User input'} is used to build a file path.`, undefined,
        { trace: [originOf(args[0]), `${cc.join('.')}(…)`].filter(Boolean), example: 'path.join(BASE_DIR, path.basename(input))' });
    }

    // Weak hashes
    if (prop === 'createHash' && isStr(args[0]) && /^(md5|sha1)$/i.test(strVal(args[0]))) {
      add('weak-hash', 'medium', node, `${strVal(args[0]).toUpperCase()} is not safe for passwords or security checks.`);
    }

    // Sensitive logging
    if (cc[0] === 'console' && ['log', 'info', 'debug', 'warn', 'error'].includes(cc[1])) {
      const sensitive = (a) => {
        const nm = a.type === 'Identifier' ? a.name : a.type === 'MemberExpression' ? (a.property && a.property.name) || '' : '';
        return /(password|passwd|secret|token|api_?key)/i.test(nm);
      };
      if (args.some((a) => sensitive(a) || (a.type === 'TemplateLiteral' && a.expressions.some(sensitive)))) {
        add('sensitive-log', 'low', node, 'A password, token or key may end up in the logs.');
      }
    }

    // document.write
    if (cc[0] === 'document' && cc[1] === 'write') add('xss-sink', 'medium', node, 'document.write with dynamic content can enable XSS.');
  };

  const visitors = {
    ImportDeclaration: (n) => modules.add(n.source.value),
    VariableDeclarator: (n) => {
      collectTaint(n);
      if (n.id.type === 'Identifier' && n.init) checkNamedSecret(n.id.name, n.init, n);
    },
    AssignmentExpression: (n) => {
      const l = n.left;
      if (l.type === 'MemberExpression' && l.property) {
        const p = l.property.name;
        if ((p === 'innerHTML' || p === 'outerHTML') && !isStr(n.right)) add('xss-sink', 'medium', n, `Assigning dynamic content to ${p} can enable XSS.`);
        const cl = chainOf(l);
        if (cl.join('.') === 'process.env.NODE_TLS_REJECT_UNAUTHORIZED' && isStr(n.right) && strVal(n.right) === '0') {
          add('tls-disabled', 'medium', n, 'TLS certificate verification is turned off for the whole process.');
        }
        checkNamedSecret(p, n.right, n);
      } else if (l.type === 'Identifier') checkNamedSecret(l.name, n.right, n);
    },
    ObjectProperty: (n) => {
      const k = keyName(n.key);
      checkNamedSecret(k, n.value, n);
      if (k === 'origin' && ((n.value.type === 'StringLiteral' && n.value.value === '*') || (n.value.type === 'BooleanLiteral' && n.value.value === true))) {
        add('cors-open', 'medium', n, 'CORS origin is set to allow every site.');
      }
      if (k === 'rejectUnauthorized' && n.value.type === 'BooleanLiteral' && n.value.value === false) {
        add('tls-disabled', 'medium', n, 'rejectUnauthorized: false disables certificate checks.');
      }
    },
    StringLiteral: (n) => checkPatterns(n.value, n),
    TemplateLiteral: (n) => { if (n.expressions.length === 0) checkPatterns(strVal(n), n); },
    CallExpression: visitCall,
    NewExpression: (n) => {
      if (n.callee.type === 'Identifier' && n.callee.name === 'Function' && n.arguments.length) {
        add('code-execution', 'high', n, 'new Function() runs arbitrary code.');
      }
      if (n.arguments.some(hasWholeBody)) add('mass-assignment', 'medium', n, 'The whole request body is passed to a model constructor.');
    },
    LogicalExpression: (n) => {
      if ((n.operator === '||' || n.operator === '??') && isStr(n.right) && strVal(n.right).length > 0) {
        const c = chainOf(n.left);
        if (c[0] === 'process' && c[1] === 'env' && c[2] && /(secret|key|token|salt|passw)/i.test(c[2])) {
          add('secret-fallback', 'medium', n, `process.env.${c[2]} falls back to a hardcoded default.`, strVal(n.right));
        }
      }
    },
    JSXAttribute: (n) => {
      if (n.name && n.name.name === 'dangerouslySetInnerHTML') add('xss-sink', 'medium', n, 'dangerouslySetInnerHTML renders raw HTML.');
    },
  };

  // එක rule එකක error එකක් නිසා මුළු scan එකම නතර වෙන්න දෙන්නේ නැහැ
  const safe = (fn) => ({ node }) => { try { fn(node); } catch { /* ignore */ } };
  const wrapped = {};
  Object.keys(visitors).forEach((k) => { wrapped[k] = safe(visitors[k]); });
  traverseFn(ast, wrapped);

  meta.modules = [...modules];
  return { findings, meta };
};

// Parse කරන්න බැරි files වලට: රටා පමණක් (secrets) පේළියෙන් පේළිය
const regexOnly = (code) => {
  const out = [];
  code.split('\n').forEach((l, i) => {
    for (const [re, label] of SECRET_PATTERNS) {
      const m = re.exec(l);
      if (m) {
        out.push(makeFinding('hardcoded-secret', 'high', i + 1, `Looks like a ${label}.`, l.split(m[0]).join('***').trim().slice(0, 140)));
        break;
      }
    }
  });
  return out;
};

export const scanSource = (code, relPath) => {
  const empty = { findings: [], meta: { modules: [], expressLine: 0, expressSnippet: '' } };
  if (!code || code.length > 400000) return empty;
  let ast;
  try {
    ast = parseCode(code);
  } catch {
    return { ...empty, findings: regexOnly(code) };
  }
  try {
    return runRules(ast, code, relPath, traverse);
  } catch {
    return empty;
  }
};

// Repo මට්ටමේ rules: helmet / rate limit එකක් project එකේ කොහෙවත් නැද්ද
export const scanRepoLevel = (entries) => {
  const modules = new Set(entries.flatMap((e) => e.meta.modules));
  const apps = entries.filter((e) => e.meta.expressLine);
  if (!apps.length) return;
  const app = apps.find((a) => /(^|\/)(server|app|index)\.[jt]s$/.test(a.path)) || apps[0];
  if (!modules.has('helmet')) {
    app.findings.push(makeFinding('no-helmet', 'low', app.meta.expressLine, 'No helmet middleware was found anywhere in the project.', app.meta.expressSnippet));
  }
  if (!modules.has('express-rate-limit') && !modules.has('rate-limiter-flexible')) {
    app.findings.push(makeFinding('no-rate-limit', 'low', app.meta.expressLine, 'No rate limiting library was found, so login and other routes can be brute-forced.', app.meta.expressSnippet));
  }
};

export const topSeverity = (findings) =>
  findings.reduce((best, f) => (best === '' || SEV_ORDER[f.severity] < SEV_ORDER[best] ? f.severity : best), '');

// Health score = 100 - (High x10 + Medium x4 + Low x1), අවම 0
export const summarize = (findings) => {
  const counts = { high: 0, medium: 0, low: 0 };
  findings.forEach((f) => { counts[f.severity] += 1; });
  const penalty = counts.high * WEIGHT.high + counts.medium * WEIGHT.medium + counts.low * WEIGHT.low;
  const score = Math.max(0, 100 - penalty);
  return { score, label: score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'At risk', counts, total: findings.length };
};
