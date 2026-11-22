const GH_API = 'https://api.github.com';

const ghFetch = async (url, token, options = {}) => {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ArchitectAI',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.message || `GitHub API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
};

// Strip the root folder prefix added by GitHub zipballs (e.g. "repo-main/src/app.js" -> "src/app.js")
const cleanRepoPath = (filePath) => {
  const parts = filePath.replace(/^\/+/, '').split('/');
  return parts.length > 1 ? parts.slice(1).join('/') : filePath;
};

export const createFixPullRequest = async (req, res) => {
  const { repo, baseBranch, files, githubToken } = req.body || {};

  if (!githubToken) {
    return res.status(400).json({
      success: false,
      error: 'GitHub access token is missing. Please sign in with GitHub to create Pull Requests.',
    });
  }

  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return res.status(400).json({ success: false, error: 'Valid repository (owner/repo) is required.' });
  }

  if (!Array.isArray(files) || files.length === 0 || files.length > 30) {
    return res.status(400).json({ success: false, error: 'Provide between 1 and 30 modified files.' });
  }

  try {
    // 1. Fetch repository metadata to resolve the default branch
    const repoInfo = await ghFetch(`${GH_API}/repos/${repo}`, githubToken);
    const targetBase = baseBranch || repoInfo.default_branch || 'main';

    // 2. Get the latest commit SHA on the base branch
    const baseRef = await ghFetch(`${GH_API}/repos/${repo}/git/ref/heads/${encodeURIComponent(targetBase)}`, githubToken);
    const baseSha = baseRef.object.sha;

    // 3. Create a new fix branch
    const branchName = `architect-ai/fixes-${Date.now().toString(36)}`;
    await ghFetch(`${GH_API}/repos/${repo}/git/refs`, githubToken, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      }),
    });

    // 4. Commit each modified file onto the new branch
    const committedFiles = [];
    for (const f of files) {
      const repoPath = cleanRepoPath(f.path);
      let existingSha;
      try {
        const existing = await ghFetch(
          `${GH_API}/repos/${repo}/contents/${repoPath}?ref=${encodeURIComponent(branchName)}`,
          githubToken
        );
        existingSha = existing.sha;
      } catch {
        // File might be new or path differs; proceed without sha if not found
      }

      await ghFetch(`${GH_API}/repos/${repo}/contents/${repoPath}`, githubToken, {
        method: 'PUT',
        body: JSON.stringify({
          message: `fix(${repoPath}): apply ArchitectAI refactor & security fixes`,
          content: Buffer.from(String(f.code), 'utf-8').toString('base64'),
          branch: branchName,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });
      committedFiles.push(repoPath);
    }

    // 5. Open a Pull Request targeting the base branch
    const prBody = [
      '## ArchitectAI Automated Fixes & Refactoring',
      '',
      'This Pull Request was generated from your **ArchitectAI** sandbox session.',
      '',
      '### Modified Files:',
      ...committedFiles.map((p) => `- \`${p}\``),
      '',
      '> Review the diff carefully before merging into your main branch.',
    ].join('\n');

    const pr = await ghFetch(`${GH_API}/repos/${repo}/pulls`, githubToken, {
      method: 'POST',
      body: JSON.stringify({
        title: `fix: ArchitectAI security & code quality improvements (${committedFiles.length} file${committedFiles.length > 1 ? 's' : ''})`,
        head: branchName,
        base: targetBase,
        body: prBody,
      }),
    });

    res.status(200).json({
      success: true,
      prUrl: pr.html_url,
      prNumber: pr.number,
      branch: branchName,
      filesCount: committedFiles.length,
    });
  } catch (error) {
    console.error('GitHub PR error:', error.message);
    const status = error.status === 401 || error.status === 403 ? error.status : 502;
    res.status(status).json({
      success: false,
      error:
        error.status === 404 || error.status === 403
          ? 'Permission denied or repository not found. Ensure you own or have write access to this repository.'
          : error.message || 'Failed to create Pull Request on GitHub.',
    });
  }
};