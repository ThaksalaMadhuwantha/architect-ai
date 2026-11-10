import { scanPackages } from '../utils/osvScanner.js';

const NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

export const scanDependencies = async (req, res) => {
  const { packages } = req.body || {};

  if (!Array.isArray(packages) || packages.length === 0 || packages.length > 1500) {
    return res.status(400).json({ success: false, error: 'packages ලැයිස්තුව (1-1500) අවශ්‍යයි.' });
  }
  const clean = [];
  for (const p of packages) {
    if (!p || typeof p.name !== 'string' || typeof p.version !== 'string' || !NAME_RE.test(p.name) || p.version.length > 64) {
      return res.status(400).json({ success: false, error: 'Packages ලැයිස්තුවේ වලංගු නැති අයිතමයක් තියෙනවා.' });
    }
    clean.push({ name: p.name, version: p.version, direct: !!p.direct, dev: !!p.dev, approx: !!p.approx });
  }

  try {
    const data = await scanPackages(clean);
    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('OSV scan error:', error.message);
    res.status(502).json({ success: false, error: 'OSV (api.osv.dev) එකට සම්බන්ධ වෙන්න බැරි වුණා. පසුව නැවත උත්සාහ කරන්න.' });
  }
};
