// package.json + package-lock.json වලින් packages ලැයිස්තුව (නිවැරදි versions) හදනවා
import fs from 'fs';
import path from 'path';

const MAX_MANIFESTS = 6;
const MAX_PACKAGES = 1500;
const SKIP = new Set(['node_modules', 'dist', 'build', 'coverage']);

const findFiles = (dir, name, out = [], depth = 0) => {
  if (depth > 6 || out.length >= MAX_MANIFESTS) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !e.name.startsWith('.')) findFiles(path.join(dir, e.name), name, out, depth + 1);
    } else if (e.name === name) out.push(path.join(dir, e.name));
  }
  return out;
};

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; } };

// ^4.16.0 -> 4.16.0 (lockfile නැති විට ඇස්තමේන්තුවක්)
const approxVersion = (range) => {
  if (typeof range !== 'string' || /^(workspace:|file:|link:|git|http|npm:|\*|latest|x$)/i.test(range)) return null;
  const m = /(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(range);
  return m ? `${m[1]}.${m[2] || 0}.${m[3] || 0}` : null;
};

const fromLock = (lock) => {
  const out = new Map();
  const add = (name, version, dev) => {
    if (name && version && /^\d/.test(version)) out.set(`${name}@${version}`, { name, version, dev: !!dev });
  };
  if (lock.packages) {
    Object.entries(lock.packages).forEach(([key, v]) => {
      if (!key || v.link || !v.version) return;
      const idx = key.lastIndexOf('node_modules/');
      if (idx !== -1) add(key.slice(idx + 'node_modules/'.length), v.version, v.dev);
    });
  } else if (lock.dependencies) {
    const walk = (deps) => Object.entries(deps).forEach(([name, v]) => {
      add(name, v.version, v.dev);
      if (v.dependencies) walk(v.dependencies);
    });
    walk(lock.dependencies);
  }
  return [...out.values()];
};

export const collectManifests = (rootDir) => {
  const manifests = [];
  let budget = MAX_PACKAGES;

  for (const pkgPath of findFiles(rootDir, 'package.json')) {
    const pkg = readJson(pkgPath);
    if (!pkg) continue;
    const deps = pkg.dependencies || {};
    const dev = pkg.devDependencies || {};
    const direct = { ...deps, ...dev, ...(pkg.optionalDependencies || {}) };
    const lockPath = path.join(path.dirname(pkgPath), 'package-lock.json');
    const lock = fs.existsSync(lockPath) ? readJson(lockPath) : null;

    let list = lock ? fromLock(lock).map((p) => ({ ...p, direct: p.name in direct, approx: false })) : [];
    const usesLockfile = list.length > 0;
    if (!usesLockfile) {
      list = Object.entries(direct)
        .map(([name, range]) => {
          const version = approxVersion(range);
          return version ? { name, version, dev: !(name in deps), direct: true, approx: true } : null;
        })
        .filter(Boolean);
    }
    list.sort((a, b) => Number(b.direct) - Number(a.direct));
    list = list.slice(0, Math.max(0, budget));
    budget -= list.length;
    if (list.length) manifests.push({ path: path.relative(rootDir, pkgPath).replace(/\\/g, '/'), usesLockfile, packages: list });
  }
  return manifests;
};
