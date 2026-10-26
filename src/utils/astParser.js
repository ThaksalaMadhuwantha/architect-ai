import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import fs from 'fs';

const traverse = traverseModule.default || traverseModule;

export const parseFileToAST = (filePath) => {
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });

    const imports = [];
    traverse(ast, {
      ImportDeclaration({ node }) {
        imports.push(node.source.value);
      },
    });

    return { imports };
  } catch (error) {
    return { imports: [], error: error.message };
  }
};