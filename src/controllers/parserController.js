import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseFileToAST } from '../utils/astParser.js';
import { scanSource, scanRepoLevel, summarize, topSeverity } from '../utils/securityScanner.js';

const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // GitHub ZIP එකේ උපරිම size (50MB)
const MAX_UNZIPPED_BYTES = 300 * 1024 * 1024; // extract කළාම උපරිම size
const MAX_FILES = 600; // graph එකට ගන්න උපරිම files ගාණ
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sendError = (res, error, fallback) => {
  console.error('Parsing error:', error);
  const status = error.status || 500;
  res.status(status).json({ success: false, error: error.status ? error.message : fallback });
};

const normalizePath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

/* ---------- ZIP එකකින් graph එක හදන core logic (upload සහ GitHub දෙකටම) ---------- */
const buildGraphFromZip = async (zipPath) => {
  const extractDir = path.join('extracted', `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  try {
    let zip;
    try {
      zip = new AdmZip(zipPath);
    } catch {
      throw new HttpError(400, 'ZIP file එක කියවන්න බැහැ. Valid ZIP එකක්ද බලන්න.');
    }

    // Zip-slip සහ zip-bomb වලින් ආරක්ෂාව
    let totalSize = 0;
    for (const entry of zip.getEntries()) {
      const name = entry.entryName.replace(/\\/g, '/');
      if (name.startsWith('/') || name.split('/').includes('..')) {
        throw new HttpError(400, 'ZIP file එකේ අනාරක්ෂිත paths තියෙනවා.');
      }
      totalSize += entry.header.size;
    }
    if (totalSize > MAX_UNZIPPED_BYTES) {
      throw new HttpError(413, 'Project එක ඉතා විශාලයි (extract කළාම 300MB ට වැඩියි).');
    }

    zip.extractAllTo(extractDir, true);

    const nodes = [];
    const edges = [];
    const filePathToIdMap = {};
    const rawEdges = [];
    let idCounter = 1;
    let truncated = false;
    let codeBudget = 5 * 1024 * 1024; // response එකට යන full code වල මුළු සීමාව
    const scanEntries = []; // security scan ප්‍රතිඵල

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

          // Parse කරන්න බැරි file එකක් නිසා මුළු repo එකම fail වෙන්න දෙන්නේ නෑ
          let imports = [];
          let exports = [];
          try {
            const parsed = parseFileToAST(fullPath);
            imports = parsed.imports || [];
            exports = parsed.exports || [];
          } catch (err) {
            console.warn(`AST parse skipped: ${relativePath} (${err.message})`);
          }

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

    // Repo මට්ටමේ rules, ඊට පස්සේ node එකක් ගානේ බරපතලම severity එක සහ සාරාංශය
    scanRepoLevel(scanEntries);
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

    return { nodes, edges, truncated, scan };
  } finally {
    await fs.remove(extractDir);
  }
};

/* ---------- 1. ZIP upload ---------- */
export const parseZipFile = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'කරුණාකර ZIP file එකක් upload කරන්න.' });
  }

  try {
    const { nodes, edges, truncated, scan } = await buildGraphFromZip(req.file.path);
    res.status(200).json({ success: true, data: { nodes, edges }, meta: { truncated, scan } });
  } catch (error) {
    sendError(res, error, 'ZIP file එක parse කිරීමේදී දෝෂයක් සිදු විය.');
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

const downloadRepoZip = async ({ owner, repo, branch }, dest) => {
  const ref = branch ? `/${branch.split('/').map(encodeURIComponent).join('/')}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/zipball${ref}`;

  const headers = {
    'User-Agent': 'ArchitectAI',
    Accept: 'application/vnd.github+json',
  };
  // Optional: rate limit වැඩි කරගන්න. PUBLIC repos විතරක් කියවන්න පුළුවන් token එකක් පාවිච්චි කරන්න.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  } catch {
    throw new HttpError(504, 'GitHub එකට සම්බන්ධ වෙන්න බැරි වුණා. පසුව නැවත උත්සාහ කරන්න.');
  }

  if (response.status === 404) {
    throw new HttpError(404, 'Repo එක හොයාගන්න බැහැ. URL එක හරිද, repo එක public ද කියලා බලන්න.');
  }
  if (response.status === 403 || response.status === 429) {
    throw new HttpError(429, 'GitHub rate limit එකට ලැබුණා. ටික වෙලාවකින් නැවත උත්සාහ කරන්න.');
  }
  if (!response.ok || !response.body) {
    throw new HttpError(502, `GitHub එකෙන් repo එක download කරන්න බැරි වුණා (${response.status}).`);
  }

  const declared = Number(response.headers.get('content-length'));
  if (declared && declared > MAX_DOWNLOAD_BYTES) {
    throw new HttpError(413, 'Repo එක ඉතා විශාලයි (50MB ට වැඩියි).');
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) {
        cb(new HttpError(413, 'Repo එක ඉතා විශාලයි (50MB ට වැඩියි).'));
      } else {
        cb(null, chunk);
      }
    },
  });

  await pipeline(Readable.fromWeb(response.body), limiter, fs.createWriteStream(dest));
};

export const parseGithubRepo = async (req, res) => {
  const { repoUrl, branch } = req.body || {};
  const target = parseGithubUrl(repoUrl);

  if (!target) {
    return res.status(400).json({
      success: false,
      error: 'වලංගු GitHub URL එකක් දෙන්න. උදා: https://github.com/user/repo',
    });
  }

  if (branch) {
    if (!/^[\w.\-/]+$/.test(branch)) {
      return res.status(400).json({ success: false, error: 'Branch නම වලංගු නැහැ.' });
    }
    target.branch = branch;
  }

  await fs.ensureDir('uploads');
  const zipPath = path.join('uploads', `gh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.zip`);

  try {
    await downloadRepoZip(target, zipPath);
    const { nodes, edges, truncated, scan } = await buildGraphFromZip(zipPath);

    if (nodes.length === 0) {
      throw new HttpError(422, 'මේ repo එකේ JS/TS files (.js, .jsx, .ts, .tsx) හොයාගන්න බැරි වුණා.');
    }

    res.status(200).json({
      success: true,
      data: { nodes, edges },
      meta: { source: 'github', repo: `${target.owner}/${target.repo}`, truncated, scan },
    });
  } catch (error) {
    sendError(res, error, 'GitHub repo එක analyze කිරීමේදී දෝෂයක් සිදු විය.');
  } finally {
    await fs.remove(zipPath);
  }
};
