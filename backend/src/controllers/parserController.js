import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseFileToAST } from '../utils/astParser.js';
import { scanSource, scanRepoLevel, summarize, topSeverity, makeFinding } from '../utils/securityScanner.js';
import { mapEndpoints } from '../utils/endpointMapper.js';
import { collectManifests } from '../utils/depsCollector.js';
import { analyzeArchitecture } from '../utils/architectureAnalyzer.js';

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // Max GitHub ZIP size (50MB)
const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024; // Max extracted size
const MAX_FILES = 600; // Max files included in graph
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const sendError = (res, error, fallback) => {
  console.error('Parsing error:', error);
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    error: error.status ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
  });
};

const normalizePath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/* ---------- Core graph builder from ZIP (shared by upload and GitHub) ---------- */
const buildGraphFromZip = async (zipPath) => {
  const extractDir = path.join('extracted', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  try {
    let zip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      throw new HttpError(400, 'Unable to read ZIP file. Please upload a valid ZIP archive.');
    }

    // Protect against zip-slip and zip-bomb attacks
    let totalSize = 0;
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/');
      if (name.startsWith('/') || name.split('/').includes('..')) {
        throw new HttpError(400, 'ZIP archive contains unsafe file paths.');
      }
      totalSize += entry.header.size;
    }
    if (totalSize > MAX_UNZIPPED_BYTES) {
      throw new HttpError(413, 'Project is too large (exceeds 300MB extracted size).');
    }

    zip.extractAllTo(extractDir, true);

    const nodes = [];
    const edges = [];
    const filePathToIdMap = {};
    const rawEdges = [];
    let idCounter = 1;
    let truncated = false;
    let codeBudget = 5 * 1024 * 1024; // Total code payload budget in response
    const scanEntries = [];
    const sources = [];

    const collectFiles = (dir) => {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (truncated) return;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (!SKIP_DIRS.has(file) && !file.startsWith('.')) {
            collectFiles(fullPath);
          }
        } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
          if (nodes.length >= MAX_FILES) {
            truncated = true;
            return;
          }

          const relativePath = normalizePath(path.relative(extractDir, fullPath));
          const nodeId = `node_${idCounter++}`;

          filePathToIdMap[relativePath] = nodeId;
          filePathToIdMap[relativePath.replace(/\.[^/.]+$/, '')] = nodeId;
          filePathToIdMap[`${relativePath.replace(/\.[^/.]+$/, '')}/index`] = nodeId;

          const fileContent = fs.readFileSync(fullPath, 'utf-8');
          const code = codeBudget > 0 ? fileContent.slice(0, 20000) : '';
          codeBudget -= code.length;

          // Skip single-file AST parse failures without failing the whole repo
          let imports = [];
          let exports = [];
          try {
            const parsed = parseFileToAST(fullPath);
            imports = parsed.imports || [];
            exports = parsed.exports || [];
          } catch (err) {
            console.warn(`AST parse skipped: ${relativePath} (${err.message})`);
          }

          sources.push({ path: relativePath, code: fileContent });
          const scanResult = scanSource(fileContent, relativePath);
          scanEntries.push({ nodeId, path: relativePath, findings: scanResult.findings, meta: scanResult.meta });

          nodes.push({
            id: nodeId,
            type: 'default',
            data: {
              label: file,
              path: relativePath,
              importsCount: imports.length,
              exportsList: exports,
              codeSnippet: fileContent.slice(0, 1000),
              code,
              lines: fileContent.split('\n').length,
              findings: scanResult.findings,
              severity: '',
            },
            position: { x: 0, y: 0 },
          });

          imports.forEach((imp) => {
            if (imp.startsWith('.')) {
              const currentDir = path.dirname(relativePath);
              const resolvedImport = normalizePath(path.join(currentDir, imp));
              rawEdges.push({ sourceId: nodeId, targetImport: resolvedImport });
            }
          });
        }
      }
    };

    collectFiles(extractDir);

    scanRepoLevel(scanEntries);

    // Endpoint map + auth coverage (route -> middleware -> controller -> model)
    let flow = null;
    try {
      const mapped = mapEndpoints(sources);
      const idOf = (p) => (p ? filePathToIdMap[p] : undefined);
      mapped.issues.forEach((i) => {
        const entry = scanEntries.find((e) => e.path === i.file);
        if (entry) entry.findings.push(makeFinding(i.rule, i.severity, i.line, i.message, i.snippet));
      });
      flow = {
        stats: mapped.stats,
        endpoints: mapped.endpoints.map((e, idx) => ({
          id: `ep_${idx}`,
          method: e.method,
          path: e.path,
          file: e.file,
          line: e.line,
          protected: e.protected,
          public: e.public,
          middleware: e.middleware.map((m) => ({ text: m.text, kind: m.kind })),
          controller: { text: e.controller.text, fn: e.controller.fn },
          models: e.models.map((m) => m.name),
          routeNodeId: idOf(e.file),
          nodeIds: [...new Set([...(e.mountFiles || []), e.file, ...e.middleware.map((m) => m.file), e.controller.file, ...e.models.map((m) => m.file)]
            .filter(Boolean).map(idOf).filter(Boolean))],
        })),
      };
    } catch (err) {
      console.warn('Endpoint mapping skipped:', err.message);
    }
    nodes.forEach((n) => { n.data.severity = topSeverity(n.data.findings); });
    const scan = { ...summarize(scanEntries.flatMap((e) => e.findings)), filesScanned: nodes.length };

    const seen = new Set();
    rawEdges.forEach(({ sourceId, targetImport }) => {
      const targetId = filePathToIdMap[targetImport];
      const edgeId = `e_${sourceId}_${targetId}`;

      if (targetId && sourceId !== targetId && !seen.has(edgeId)) {
        seen.add(edgeId);
        edges.push({
          id: edgeId,
          source: sourceId,
          target: targetId,
          animated: true,
          style: { stroke: '#818cf8', strokeWidth: 2 },
        });
      }
    });

    let arch = null;
    try { arch = analyzeArchitecture(nodes, edges); } catch (err) { console.warn('Architecture analysis skipped:', err.message); }

    let manifests = [];
    try { manifests = collectManifests(extractDir); } catch (err) { console.warn('Manifest scan skipped:', err.message); }

    return { nodes, edges, truncated, scan, flow, manifests, arch };
  } finally {
    await fs.remove(extractDir);
  }
};

/* ---------- 1. ZIP upload ---------- */
export const parseZipFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'Please upload a valid ZIP file.' });
  }

  try {
    const { nodes, edges, truncated, scan, flow, manifests, arch } = await buildGraphFromZip(req.file.path);
    res.status(200).json({ success: true, data: { nodes, edges }, meta: { truncated, scan, flow, manifests, arch } });
  } catch (error) {
    sendError(res, error, 'Failed to parse the uploaded ZIP file.');
  } finally {
    await fs.remove(req.file.path);
  }
};

/* ---------- 2. GitHub repo URL ---------- */
const GH_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([^/?#]+))?\/?(?:[?#].*)?$/;

const parseGithubUrl = (url) => {
  const m = GH_RE.exec((url || '').trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3] || null };
};

const fetchGithubZip = async (url, token) => {
  const headers = {
    'User-Agent': 'ArchitectAI',
    Accept: 'application/vnd.github+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetch(url, { headers, signal: AbortSignal.timeout(60000) });
};

const downloadRepoZip = async ({ owner, repo, branch, githubToken }, dest) => {
  const ref = branch ? `/${branch.split('/').map(encodeURIComponent).join('/')}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/zipball${ref}`;

  const userToken = (githubToken || '').trim();
  const activeToken = userToken || process.env.GITHUB_TOKEN || '';
  let tokenExpired = false;

  let response;
  try {
    response = await fetchGithubZip(url, activeToken);

    // If the user's OAuth token expired (401), retry anonymously so public repos still work seamlessly
    if (response.status === 401 && activeToken) {
      tokenExpired = true;
      response = await fetchGithubZip(url, process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== activeToken ? process.env.GITHUB_TOKEN : '');
    }
  } catch {
    throw new HttpError(504, 'Unable to connect to GitHub. Please try again later.');
  }

  if (response.status === 401) {
    throw new HttpError(
      401,
      'Your GitHub session has expired. Please reconnect GitHub to access private repositories.',
      'GITHUB_TOKEN_EXPIRED'
    );
  }
  if (response.status === 404) {
    if (tokenExpired) {
      throw new HttpError(
        401,
        'Your GitHub session expired and this repository is private or unavailable. Reconnect GitHub to continue.',
        'GITHUB_TOKEN_EXPIRED'
      );
    }
    throw new HttpError(
      404,
      userToken
        ? 'Repository not found. Check the URL, branch name, and whether your GitHub account has access.'
        : 'Repository not found or private. If this is a private repository, connect your GitHub account to access it.',
      userToken ? 'REPO_NOT_FOUND' : 'PRIVATE_OR_NOT_FOUND'
    );
  }
  if (response.status === 403 || response.status === 429) {
    throw new HttpError(429, 'GitHub API rate limit or permission error. Please try again shortly.');
  }
  if (!response.ok || !response.body) {
    throw new HttpError(502, `Failed to download repository from GitHub (HTTP ${response.status}).`);
  }

  const declared = Number(response.headers.get('content-length'));
  if (declared && declared > MAX_DOWNLOAD_BYTES) {
    throw new HttpError(413, 'Repository archive is too large (exceeds 50MB limit).');
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) {
        cb(new HttpError(413, 'Repository archive is too large (exceeds 50MB limit).'));
      } else {
        cb(null, chunk);
      }
    },
  });

  await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(dest));
  return { tokenExpired };
};

export const parseGithubRepo = async (req, res) => {
  const { repoUrl, branch, githubToken } = req.body || {};
  const target = parseGithubUrl(repoUrl);

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'Please enter a valid GitHub repository URL (e.g., https://github.com/user/repo).',
    });
  }

  if (branch) {
    if (!/^[\w.\-/]+$/.test(branch)) {
      return res.status(400).json({ success: false, error: 'Invalid branch name.' });
    }
    target.branch = branch;
  }

  if (githubToken && typeof githubToken === 'string') {
    target.githubToken = githubToken;
  }

  await fs.ensureDir('uploads');
  const zipPath = path.join('uploads', `gh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.zip`);

  try {
    const { tokenExpired } = await downloadRepoZip(target, zipPath);
    const { nodes, edges, truncated, scan, flow, manifests, arch } = await buildGraphFromZip(zipPath);

    if (nodes.length === 0) {
      throw new HttpError(422, 'No JavaScript or TypeScript files (.js, .jsx, .ts, .tsx) were found in this repository.');
    }

    res.status(200).json({
      success: true,
      data: { nodes, edges },
      meta: {
        source: 'github',
        repo: `${target.owner}/${target.repo}`,
        tokenExpired,
        truncated,
        scan,
        flow,
        manifests,
        arch,
      },
    });
  } catch (error) {
    sendError(res, error, 'Failed to analyze the GitHub repository.');
  } finally {
    await fs.remove(zipPath);
  }
};