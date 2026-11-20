import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import fs from 'fs';

export const traverse = traverseModule.default || traverseModule;

// Parse errors වුණත් හැකි තරම් AST එකක් ගන්නවා (errorRecovery)
export const parseCode = (code) =>
  parse(code, {
    sourceType: 'unambiguous',
    errorRecovery: true,
    plugins: ['jsx', 'typescript'],
  });

export const parseFileToAST = (filePath) => {
  try {
    const ast = parseCode(fs.readFileSync(filePath, 'utf-8'));
    const imports = [];
    const exports = [];
    const strArg = (n) => (n && n.type === 'StringLiteral' ? n.value : null);

    traverse(ast, {
      ImportDeclaration({ node }) {
        imports.push(node.source.value);
      },
      // import('./x') (dynamic import)
      ImportExpression({ node }) {
        const v = strArg(node.source);
        if (v) imports.push(v);
      },
      ExportAllDeclaration({ node }) {
        if (node.source) imports.push(node.source.value);
      },
      ExportNamedDeclaration({ node }) {
        if (node.source) imports.push(node.source.value);
        const d = node.declaration;
        if (d) {
          if (d.id && d.id.name) exports.push(d.id.name);
          else if (d.declarations) d.declarations.forEach((v) => v.id && v.id.name && exports.push(v.id.name));
        }
        (node.specifiers || []).forEach((s) => s.exported && s.exported.name && exports.push(s.exported.name));
      },
      ExportDefaultDeclaration() {
        exports.push('default');
      },
      // CommonJS: require('./x')
      CallExpression({ node }) {
        const c = node.callee;
        if ((c.type === 'Identifier' && c.name === 'require') || c.type === 'Import') {
          const v = strArg(node.arguments[0]);
          if (v) imports.push(v);
        }
      },
      // CommonJS: module.exports = ... / exports.x = ...
      AssignmentExpression({ node }) {
        const l = node.left;
        if (l.type === 'MemberExpression' && l.object.type === 'Identifier' && l.property) {
          if (l.object.name === 'module' && l.property.name === 'exports') exports.push('default');
          else if (l.object.name === 'exports' && l.property.name) exports.push(l.property.name);
        }
      },
    });

    return { imports, exports };
  } catch (error) {
    return { imports: [], exports: [], error: error.message };
  }
};
