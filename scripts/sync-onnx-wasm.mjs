import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourceCandidates = [
  path.join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(repoRoot, 'node_modules', '@huggingface', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
  path.join(repoRoot, 'node_modules', '@xenova', 'transformers', 'node_modules', 'onnxruntime-web', 'dist'),
];
const sourceDir = sourceCandidates.find((candidate) => existsSync(candidate));
const targetDir = path.join(repoRoot, 'public', 'onnxruntime');

if (!sourceDir) {
  console.error('[sync-onnx-wasm] Source directory not found.');
  console.error(`[sync-onnx-wasm] Checked: ${sourceCandidates.join(', ')}`);
  console.error('[sync-onnx-wasm] Run npm install first.');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const runtimeAssetFiles = readdirSync(sourceDir)
  .filter((fileName) => /^ort-wasm.*\.(wasm|mjs)$/.test(fileName))
  .sort();

if (runtimeAssetFiles.length === 0) {
  console.error(`[sync-onnx-wasm] No ORT WASM assets found in ${sourceDir}`);
  process.exit(1);
}

for (const fileName of runtimeAssetFiles) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);

  copyFileSync(sourcePath, targetPath);
}

console.log(`[sync-onnx-wasm] Synced ${runtimeAssetFiles.length} files to public/onnxruntime`);
