import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd(), 'src');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      transformFile(fullPath);
    }
  }
}

function transformFile(filePath) {
  const relFilePath = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const transformed = content.replace(/(from\s+['"])(\.\/?[^'"]+)(['"])/g, (match, prefix, importPath, suffix) => {
    // Only transform relative imports
    if (!importPath.startsWith('.') ) return match;

    const absoluteImport = path.posix.normalize(
      path.posix.join('/', path.posix.dirname(relFilePath), importPath)
    );

    // Remove leading slash
    const normalized = absoluteImport.replace(/^\//, '');
    const aliased = `@/${normalized}`;
    return `${prefix}${aliased}${suffix}`;
  });

  if (transformed !== content) {
    fs.writeFileSync(filePath, transformed, 'utf8');
  }
}

walk(root);
console.log('Finished converting relative imports to @/ alias in src/');
