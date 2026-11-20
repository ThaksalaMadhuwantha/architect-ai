// OSV.dev (Google ගේ open vulnerability database) වලින් npm packages වල දන්නා CVE හොයනවා. නොමිලේ, key එකක් ඕනෙ නැහැ, AI නැහැ.
const OSV = 'https://api.osv.dev/v1';
const SEV_ORDER = { high: 0, medium: 1, low: 2 };

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`OSV responded ${res.status}`);
  return res.json();
};

const severityOf = (v) => {
  const s = String((v.database_specific && v.database_specific.severity) || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'high';
  if (s === 'LOW') return 'low';
  return 'medium';
};

const fixedVersions = (v, name) => {
  const fixed = new Set();
  (v.affected || []).forEach((a) => {
    if (!a.package || a.package.name !== name) return;
    (a.ranges || []).forEach((r) => (r.events || []).forEach((e) => e.fixed && fixed.add(e.fixed)));
  });
  return [...fixed];
};

export const scanPackages = async (packages) => {
  const unique = [...new Map(packages.map((p) => [`${p.name}@${p.version}`, p])).values()].slice(0, 1500);

  // 1) සියලුම packages එකවර (batch) විමසනවා
  const hits = [];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const res = await postJson(`${OSV}/querybatch`, {
      queries: chunk.map((p) => ({ package: { name: p.name, ecosystem: 'npm' }, version: p.version })),
    });
    (res.results || []).forEach((r, idx) => {
      const ids = (r.vulns || []).map((v) => v.id);
      if (ids.length) hits.push({ pkg: chunk[idx], ids });
    });
  }

  // 2) හමුවුණ vulnerabilities වල විස්තර (severity, fix version) ගන්නවා
  const allIds = [...new Set(hits.flatMap((h) => h.ids))].slice(0, 120);
  const details = new Map();
  let cursor = 0;
  const worker = async () => {
    while (cursor < allIds.length) {
      const id = allIds[cursor++];
      try {
        const res = await fetch(`${OSV}/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) details.set(id, await res.json());
      } catch { /* ඒ vulnerability එකේ විස්තර නැතිව ඉදිරියට */ }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // 3) package එකකට කණ්ඩායම් කරනවා
  const vulnerable = hits.map(({ pkg, ids }) => {
    const seen = new Set();
    const vulns = [];
    ids.forEach((id) => {
      const d = details.get(id);
      if (!d) { vulns.push({ id, aliases: [], summary: '', severity: 'medium', fixed: [] }); return; }
      if (d.withdrawn) return;
      const aliases = [d.id, ...(d.aliases || [])];
      if (aliases.some((a) => seen.has(a))) return; // එකම advisory එක (GHSA/CVE) දෙපාරක් එන්න දෙන්නේ නැහැ
      aliases.forEach((a) => seen.add(a));
      vulns.push({
        id: d.id,
        aliases: d.aliases || [],
        summary: d.summary || String(d.details || '').slice(0, 160),
        severity: severityOf(d),
        fixed: fixedVersions(d, pkg.name),
      });
    });
    vulns.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
    return { ...pkg, vulns, severity: vulns.length ? vulns[0].severity : 'medium' };
  }).filter((p) => p.vulns.length);

  vulnerable.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || Number(b.direct) - Number(a.direct));

  const counts = { high: 0, medium: 0, low: 0 };
  vulnerable.forEach((p) => p.vulns.forEach((v) => { counts[v.severity] += 1; }));
  return {
    packages: vulnerable,
    stats: {
      scanned: unique.length,
      vulnerablePackages: vulnerable.length,
      directVulnerable: vulnerable.filter((p) => p.direct).length,
      approx: unique.filter((p) => p.approx).length,
      counts,
    },
  };
};
