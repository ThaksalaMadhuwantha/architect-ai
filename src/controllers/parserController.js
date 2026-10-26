import fs from 'fs-extra';
import path from 'path';
import AdmZip from 'adm-zip';
import { parseFileToAST } from '../utils/astParser.js';

export const parseZipFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'කරුණාකර ZIP file එකක් upload කරන්න.' });
    }

    const zipPath = req.file.path;
    const extractDir = path.join('extracted', Date.now().toString());

    const zip = new AdmZip(zipPath);
    zip.extractAllTo(extractDir, true);

    const nodes = [];
    const edges = [];
    const filePathToIdMap = {};
    const rawEdges = [];
    let idCounter = 1;

    // Helper: Normalize relative path strings
    const normalizePath = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '');

    const collectFiles = (dir) => {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (file !== 'node_modules' && !file.startsWith('.')) {
            collectFiles(fullPath);
          }
        } else if (/\.(js|jsx|ts|tsx)$/.test(file)) {
          const relativePath = normalizePath(path.relative(extractDir, fullPath));
          const nodeId = `node_${idCounter++}`;

          // Save ID maps for different potential import syntax styles
          filePathToIdMap[relativePath] = nodeId;
          filePathToIdMap[relativePath.replace(/\.[^/.]+$/, "")] = nodeId;
          filePathToIdMap[`${relativePath.replace(/\.[^/.]+$/, "")}/index`] = nodeId;

          nodes.push({
            id: nodeId,
            type: 'default',
            data: { label: file },
            position: { x: 0, y: 0 },
          });

          const { imports } = parseFileToAST(fullPath);
          imports.forEach((imp) => {
            if (imp.startsWith('.')) {
              const currentDir = path.dirname(relativePath);
              const resolvedImport = normalizePath(path.join(currentDir, imp));
              rawEdges.push({ sourceId: nodeId, targetImport: resolvedImport });
            }
          });
        }
      });
    };

    collectFiles(extractDir);

    // Link source and target nodes via edges
    rawEdges.forEach(({ sourceId, targetImport }) => {
      const targetId = filePathToIdMap[targetImport];

      if (targetId && sourceId !== targetId) {
        edges.push({
          id: `e_${sourceId}_${targetId}`,
          source: sourceId,
          target: targetId,
          animated: true,
          style: { stroke: '#818cf8', strokeWidth: 2 },
        });
      }
    });

    await fs.remove(zipPath);
    await fs.remove(extractDir);

    res.status(200).json({
      success: true,
      data: { nodes, edges },
    });
  } catch (error) {
    console.error('Parsing error:', error);
    res.status(500).json({ error: 'ZIP file එක parse කිරීමේදී දෝෂයක් සිදු විය.' });
  }
};