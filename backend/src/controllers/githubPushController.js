// Sanitize developer-provided branch name to conform to Git ref rules
const sanitizeBranchName = (raw) =>
  String(raw || '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9/_.-]/g, '')
    .replace(/\/+/g, '/')
    .replace(/^[/.]+|[/.]+$/g, '');

export const createFixPullRequest = async (req, res) => {
  try {
    const { repo, baseBranch, newBranch, files, githubToken } = req.body || {};

    if (!repo || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Repository and patched files are required.' });
    }
    if (!githubToken) {
      return res.status(401).json({ success: false, error: 'GitHub OAuth token is required to create a Pull Request.' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return res.status(400).json({ success: false, error: 'Invalid repository format. Expected owner/repo.' });
    }

    const ghHeaders = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ArchitectAI',
      'Content-Type': 'application/json',
    };

    // 1. Resolve default branch if baseBranch was not specified
    let targetBase = baseBranch?.trim();
    if (!targetBase) {
      const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, { headers: ghHeaders });
      const repoData = await repoRes.json();
      if (!repoRes.ok) {
        return res.status(repoRes.status).json({
          success: false,
          error: repoData.message || 'Unable to access repository on GitHub.',
        });
      }
      targetBase = repoData.default_branch || 'main';
    }

    // 2. Get latest commit SHA of targetBase
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${encodeURIComponent(targetBase)}`,
      { headers: ghHeaders }
    );
    const refData = await refRes.json();
    if (!refRes.ok) {
      return res.status(refRes.status).json({
        success: false,
        error: refData.message || `Base branch "${targetBase}" not found.`,
      });
    }
    const baseSha = refData.object.sha;

    // 3. Create new branch (use developer's custom branch name if provided, else fallback)
    const sanitizedCustom = sanitizeBranchName(newBranch);
    let branchName = sanitizedCustom || `architect-ai/fixes-${Date.now().toString(36)}`;

    let createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });

    // If the custom branch name already exists on GitHub, append a short unique suffix
    if (createRefRes.status === 422 && sanitizedCustom) {
      branchName = `${sanitizedCustom}-${Date.now().toString(36).slice(-4)}`;
      createRefRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
      });
    }

    const createRefData = await createRefRes.json();
    if (!createRefRes.ok) {
      return res.status(createRefRes.status).json({
        success: false,
        error: createRefData.message || 'Failed to create branch on GitHub. Ensure you have write access to this repository.',
      });
    }

    // 4. Commit each patched file onto the new branch
    const stripRoot = files.every((f) => f.path.includes('/'))
      ? `${files[0].path.split('/')[0]}/`
      : '';

    const committedPaths = [];

    for (const file of files) {
      const repoFilePath = stripRoot && file.path.startsWith(stripRoot)
        ? file.path.slice(stripRoot.length)
        : file.path;

      const encodedPath = repoFilePath.split('/').map(encodeURIComponent).join('/');
      const fileGetRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(branchName)}`,
        { headers: ghHeaders }
      );
      const fileGetData = await fileGetRes.json();
      if (!fileGetRes.ok) {
        return res.status(fileGetRes.status).json({
          success: false,
          error: `Could not locate "${repoFilePath}" in repository.`,
        });
      }

      const updateRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${encodedPath}`,
        {
          method: 'PUT',
          headers: ghHeaders,
          body: JSON.stringify({
            message: `fix(security): apply ArchitectAI refactor to ${repoFilePath}`,
            content: Buffer.from(file.code, 'utf8').toString('base64'),
            sha: fileGetData.sha,
            branch: branchName,
          }),
        }
      );

      if (!updateRes.ok) {
        const updateErr = await updateRes.json();
        return res.status(updateRes.status).json({
          success: false,
          error: updateErr.message || `Failed to commit ${repoFilePath}.`,
        });
      }

      committedPaths.push(repoFilePath);
    }

    // 5. Open Pull Request
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        title: `ArchitectAI: Automated Code & Security Fixes (${committedPaths.length} file${committedPaths.length > 1 ? 's' : ''})`,
        head: branchName,
        base: targetBase,
        body: [
          '### Automated Fixes by ArchitectAI',
          '',
          `Patched **${committedPaths.length}** file(s) verified in the ArchitectAI sandbox:`,
          ...committedPaths.map((p) => `- \`${p}\``),
        ].join('\n'),
      }),
    });
    const prData = await prRes.json();
    if (!prRes.ok) {
      return res.status(prRes.status).json({
        success: false,
        error: prData.message || 'Branch created, but failed to open Pull Request.',
      });
    }

    return res.json({
      success: true,
      branch: branchName,
      prNumber: prData.number,
      prUrl: prData.html_url,
    });
  } catch (err) {
    console.error('Push PR Error:', err);
    return res.status(500).json({ success: false, error: 'Server error while pushing Pull Request.' });
  }
};