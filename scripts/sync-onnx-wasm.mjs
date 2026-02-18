import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourceDir = path.join(repoRoot, 'node_modules', 'onnxruntime-web', 'dist');
const targetDir = path.join(repoRoot, 'public', 'onnxruntime');

const wasmFiles = [
  'ort-wasm.wasm',
  'ort-wasm-threaded.wasm',
  'ort-wasm-simd.wasm',
  'ort-wasm-simd-threaded.wasm',
];

if (!existsSync(sourceDir)) {
  console.error(`[sync-onnx-wasm] Source directory not found: ${sourceDir}`);
  console.error('[sync-onnx-wasm] Run npm install first.');
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

for (const fileName of wasmFiles) {
  const sourcePath = path.join(sourceDir, fileName);
  const targetPath = path.join(targetDir, fileName);

  if (!existsSync(sourcePath)) {
    console.error(`[sync-onnx-wasm] Missing file in onnxruntime-web: ${fileName}`);
    process.exit(1);
  }

  copyFileSync(sourcePath, targetPath);
}

console.log(`[sync-onnx-wasm] Synced ${wasmFiles.length} files to public/onnxruntime`);
