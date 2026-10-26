import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { parseFileToAST } from '../utils/astParser.js';

export const handleZipUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a ZIP file.' });
    }

    const zipPath = req.file.path;
    const outputFolder = path.join('extracted', req.file.filename);

    // Extract ZIP
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(outputFolder, true);

    // Node & Edge List Generation (Simple Graph Data)
    const nodes = [];
    const edges = [];

    const readFilesRecursively = (dir) => {
      const files = fs.readdirSync(dir);

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        // Ignore node_modules & hidden folders
        if (file === 'node_modules' || file.startsWith('.')) return;

        if (stat.isDirectory()) {
          readFilesRecursively(fullPath);
        } else if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts')) {
          const relativePath = path.relative(outputFolder, fullPath);
          nodes.push({
            id: relativePath,
            label: file,
            status: 'safe', // default status
          });

          // AST Parsing for dependencies
          const { imports } = parseFileToAST(fullPath);
          imports.forEach((imp) => {
            edges.push({
              source: relativePath,
              target: imp,
            });
          });
        }
      });
    };

    readFilesRecursively(outputFolder);

    return res.status(200).json({
      message: 'ZIP parsed successfully',
      graphData: { nodes, edges },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};