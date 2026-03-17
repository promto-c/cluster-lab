import { env, AutoProcessor, AutoModel, RawImage } from '@huggingface/transformers';
import { InferenceResult, PreprocessingConfig } from '@/types';
import { processImageForDisplay } from '@/utils/imageProcessing';

// Configure transformers.js to use CDN and cache
env.allowLocalModels = false;
env.useBrowserCache = true;
// Vite dev server blocks importing ESM modules directly from `public/`.
// Use CDN runtime assets in dev, and self-hosted assets in production builds.
if (!import.meta.env.DEV) {
  env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}onnxruntime/`;
}

// Singleton to hold model instance
let processor: any = null;
let model: any = null;
let currentModelId: string | null = null;
const TRANSFORMERS_BROWSER_CACHE = 'transformers-cache';
const ONNX_SUBFOLDER = 'onnx';
export const DEFAULT_REMOTE_ONNX_FILE = 'model_q4f16.onnx';
const FALLBACK_REMOTE_ONNX_FILES = [DEFAULT_REMOTE_ONNX_FILE, 'model_quantized.onnx', 'model.onnx'];
const REMOTE_ONNX_FILE_LABELS: Record<string, string> = {
  'model.onnx': 'Full precision (fp32)',
  'model_quantized.onnx': '8-bit quantized (q8)',
  'model_fp16.onnx': 'Half precision (fp16)',
  'model_q4.onnx': '4-bit quantized (q4)',
  'model_q4f16.onnx': '4-bit quantized with fp16 activations (q4f16)',
  'model_uint8.onnx': 'Unsigned 8-bit (uint8)',
  'model_int8.onnx': 'Signed 8-bit (int8)',
  'model_bnb4.onnx': 'BitsAndBytes 4-bit (bnb4)',
};
const preferredOnnxFileOrder = [
  DEFAULT_REMOTE_ONNX_FILE,
  'model_bnb4.onnx',
  'model_q4.onnx',
  'model_quantized.onnx',
  'model_int8.onnx',
  'model_uint8.onnx',
  'model_fp16.onnx',
  'model.onnx',
];
const fileNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

// Local File Map for interception
const localFileMap = new Map<string, string>();
let isFetchIntercepted = false;

export interface ModelBrowserCacheStatus {
  cacheAvailable: boolean;
  isFullyCached: boolean;
  presentFiles: number;
  requiredFiles: number;
  totalEntries: number;
}

export interface ModelBrowserCacheClearResult {
  cacheAvailable: boolean;
  removedEntries: number;
}

export interface ModelDownloadProgressEntry {
  id: string;
  stage: 'processor' | 'model';
  label: string;
  file: string;
  progress: number;
  loaded?: number;
  total?: number;
  done: boolean;
}

interface HuggingFaceModelFileEntry {
  rfilename?: string;
}

interface HuggingFaceModelInfoResponse {
  siblings?: HuggingFaceModelFileEntry[];
}

export interface RemoteOnnxVariantOption {
  fileName: string;
  path: string;
  label: string;
}

function normalizeRemoteHost(): string {
  return env.remoteHost.endsWith('/') ? env.remoteHost : `${env.remoteHost}/`;
}

function getRemoteModelBaseUrl(modelId: string, revision: string = 'main'): string {
  return new URL(`${modelId}/resolve/${encodeURIComponent(revision)}/`, normalizeRemoteHost()).toString();
}

function getRemoteModelResolvePrefix(modelId: string): string {
  return new URL(`${modelId}/resolve/`, normalizeRemoteHost()).toString();
}

function normalizeRemoteOnnxFileName(fileName?: string): string {
  const fallback = DEFAULT_REMOTE_ONNX_FILE;
  if (!fileName?.trim()) return fallback;
  const normalized = fileName.trim().replace(/^onnx\//i, '');
  return normalized.length > 0 ? normalized : fallback;
}

function sortRemoteOnnxFileNames(fileNames: string[]): string[] {
  const deduped = Array.from(new Set(fileNames.map((name) => normalizeRemoteOnnxFileName(name))));
  return deduped.sort((a, b) => {
    const aIdx = preferredOnnxFileOrder.indexOf(a.toLowerCase());
    const bIdx = preferredOnnxFileOrder.indexOf(b.toLowerCase());
    const aRank = aIdx === -1 ? Number.MAX_SAFE_INTEGER : aIdx;
    const bRank = bIdx === -1 ? Number.MAX_SAFE_INTEGER : bIdx;
    if (aRank !== bRank) return aRank - bRank;
    return fileNameCollator.compare(a, b);
  });
}

function toRemoteOnnxPath(fileName?: string): string {
  return `${ONNX_SUBFOLDER}/${normalizeRemoteOnnxFileName(fileName)}`;
}

function toModelFileName(fileName?: string): string {
  return normalizeRemoteOnnxFileName(fileName).replace(/\.onnx$/i, '');
}

export function getRemoteOnnxVariantLabel(fileName: string): string {
  const normalized = normalizeRemoteOnnxFileName(fileName);
  const label = REMOTE_ONNX_FILE_LABELS[normalized.toLowerCase()];
  return label ? `${normalized} - ${label}` : normalized;
}

export function getFallbackRemoteOnnxVariants(): RemoteOnnxVariantOption[] {
  return FALLBACK_REMOTE_ONNX_FILES.map((fileName) => ({
    fileName,
    path: toRemoteOnnxPath(fileName),
    label: getRemoteOnnxVariantLabel(fileName),
  }));
}

export function getDefaultRemoteOnnxFileName(fileNames: string[]): string {
  const normalizedFiles = sortRemoteOnnxFileNames(fileNames);
  const normalizedFileMap = new Map(normalizedFiles.map((fileName) => [fileName.toLowerCase(), fileName]));

  for (const preferredFile of preferredOnnxFileOrder) {
    const match = normalizedFileMap.get(preferredFile.toLowerCase());
    if (match) return match;
  }

  return normalizedFiles[0] ?? DEFAULT_REMOTE_ONNX_FILE;
}

export async function listRemoteOnnxVariants(
  modelId: string,
  revision: string = 'main',
): Promise<RemoteOnnxVariantOption[]> {
  const repoId = modelId.trim();
  if (!repoId) return [];

  const apiUrl = new URL(`api/models/${repoId}`, normalizeRemoteHost());
  if (revision && revision !== 'main') {
    apiUrl.searchParams.set('revision', revision);
  }

  const response = await fetch(apiUrl.toString());
  if (!response.ok) {
    throw new Error(`Failed to read model files (${response.status}).`);
  }

  const payload = (await response.json()) as HuggingFaceModelInfoResponse;
  const remoteOnnxFiles = sortRemoteOnnxFileNames(
    (payload.siblings ?? [])
      .map((entry) => entry.rfilename?.trim() ?? '')
      .filter((path) => path.toLowerCase().startsWith(`${ONNX_SUBFOLDER}/`) && path.toLowerCase().endsWith('.onnx'))
      .map((path) => path.slice(ONNX_SUBFOLDER.length + 1))
      .filter((path) => path.length > 0 && !path.includes('/')),
  );

  return remoteOnnxFiles.map((fileName) => ({
    fileName,
    path: toRemoteOnnxPath(fileName),
    label: getRemoteOnnxVariantLabel(fileName),
  }));
}

function getRequiredModelFiles(remoteOnnxFileName: string): string[] {
  return ['config.json', 'preprocessor_config.json', toRemoteOnnxPath(remoteOnnxFileName)];
}

async function openBrowserModelCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(TRANSFORMERS_BROWSER_CACHE);
  } catch (error) {
    console.warn('Browser cache is not available in this context.', error);
    return null;
  }
}

export async function getModelBrowserCacheStatuses(
  modelIds: string[],
  remoteOnnxFileName: string = DEFAULT_REMOTE_ONNX_FILE,
): Promise<Record<string, ModelBrowserCacheStatus>> {
  const uniqueModelIds = Array.from(new Set(modelIds.map((id) => id.trim()).filter(Boolean)));
  const requiredFiles = getRequiredModelFiles(remoteOnnxFileName);
  const result: Record<string, ModelBrowserCacheStatus> = {};

  const cache = await openBrowserModelCache();
  if (!cache) {
    for (const modelId of uniqueModelIds) {
      result[modelId] = {
        cacheAvailable: false,
        isFullyCached: false,
        presentFiles: 0,
        requiredFiles: requiredFiles.length,
        totalEntries: 0,
      };
    }
    return result;
  }

  const cacheKeys = await cache.keys();
  const urls = new Set(cacheKeys.map((request) => request.url));

  for (const modelId of uniqueModelIds) {
    const resolvePrefix = getRemoteModelResolvePrefix(modelId);
    const totalEntries = cacheKeys.reduce((count, request) => {
      return count + (request.url.startsWith(resolvePrefix) ? 1 : 0);
    }, 0);

    const baseUrl = getRemoteModelBaseUrl(modelId);
    const presentFiles = requiredFiles.reduce((count, fileName) => {
      const fileUrl = new URL(fileName, baseUrl).toString();
      return count + (urls.has(fileUrl) ? 1 : 0);
    }, 0);

    result[modelId] = {
      cacheAvailable: true,
      isFullyCached: presentFiles === requiredFiles.length,
      presentFiles,
      requiredFiles: requiredFiles.length,
      totalEntries,
    };
  }

  return result;
}

export async function clearModelBrowserCache(modelId?: string): Promise<ModelBrowserCacheClearResult> {
  const cache = await openBrowserModelCache();
  if (!cache) {
    return { cacheAvailable: false, removedEntries: 0 };
  }

  const cacheKeys = await cache.keys();
  const hasModelId = !!modelId?.trim();
  const prefix = hasModelId ? getRemoteModelResolvePrefix(modelId!.trim()) : '';

  let removedEntries = 0;
  for (const request of cacheKeys) {
    if (hasModelId && !request.url.startsWith(prefix)) continue;
    const deleted = await cache.delete(request);
    if (deleted) removedEntries += 1;
  }

  return { cacheAvailable: true, removedEntries };
}

// Helper: Setup Fetch Interceptor for Local Files
function setupLocalFetchInterceptor() {
  if (isFetchIntercepted) return;

  const originalFetch = window.fetch;

  // Define the custom fetch function
  const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = input.toString();

    // Check if we are trying to fetch from our "virtual" local model path
    if (urlStr.includes('local-model/')) {
      // Extract filename from the URL, handling potential query parameters if any (though unlikely here)
      const parts = urlStr.split('local-model/');
      if (parts.length > 1) {
        // We only care about the immediate file name, transformers might append paths
        // For local interception, we flatten the structure mostly or match keys in the map
        const potentialKey = parts[1];

        // Match exact keys first
        if (localFileMap.has(potentialKey)) {
          console.log(`[DinoService] Intercepting fetch for ${potentialKey}`);
          return originalFetch(localFileMap.get(potentialKey) as string);
        }

        // Attempt to match keys if transformers requested a subpath
        // e.g. local-model/subfolder/config.json -> map has config.json
        const fileName = potentialKey.split('/').pop();
        if (fileName && localFileMap.has(fileName)) {
          console.log(`[DinoService] Intercepting fetch for ${fileName} (path resolution)`);
          return originalFetch(localFileMap.get(fileName) as string);
        }
      }
    }

    return originalFetch(input, init);
  };

  try {
    // Attempt to override fetch.
    // Using Object.defineProperty to handle cases where window.fetch is a getter-only or non-writable value property
    Object.defineProperty(window, 'fetch', {
      value: customFetch,
      writable: true,
      configurable: true,
    });
    isFetchIntercepted = true;
  } catch (e) {
    console.warn('Failed to intercept window.fetch. Local model loading may fail.', e);
    // Fallback: try direct assignment if defineProperty failed (unlikely but possible in some proxies)
    try {
      window.fetch = customFetch as any;
      isFetchIntercepted = true;
    } catch (e2) {
      console.error('Direct assignment of fetch also failed', e2);
    }
  }
}

// Helper: Manual Preprocessing Logic
async function preprocessImage(
  file: File,
  config: PreprocessingConfig,
  targetSize: { width: number; height: number },
): Promise<RawImage> {
  const dataUrl = await processImageForDisplay(file, config, targetSize.width, targetSize.height);
  return RawImage.fromURL(dataUrl);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException('Embedding run was cancelled.', 'AbortError');
  }
}

interface HFProgressEvent {
  status?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

function createFileDownloadProgressReporter(
  stage: 'processor' | 'model',
  label: string,
  onDownloadProgress?: (entry: ModelDownloadProgressEntry) => void,
): (event: HFProgressEvent) => void {
  const lastBucketByFile = new Map<string, number>();
  const STEP_PERCENT = 2;

  return (event: HFProgressEvent) => {
    if (!event || !event.file) return;
    if (!onDownloadProgress) return;

    const file = event.file;
    const id = `${stage}:${file}`;

    if (event.status === 'download') {
      onDownloadProgress({
        id,
        stage,
        label,
        file,
        progress: 0,
        done: false,
      });
      return;
    }

    if (event.status === 'progress' && typeof event.progress === 'number') {
      const rounded = Math.max(0, Math.min(100, Math.round(event.progress)));
      const bucket = rounded >= 100 ? 100 : Math.floor(rounded / STEP_PERCENT) * STEP_PERCENT;
      const previousBucket = lastBucketByFile.get(file) ?? -STEP_PERCENT;
      if (bucket <= previousBucket) return;
      lastBucketByFile.set(file, bucket);

      onDownloadProgress({
        id,
        stage,
        label,
        file,
        progress: bucket,
        loaded: event.loaded,
        total: event.total,
        done: bucket >= 100,
      });
      return;
    }

    if (event.status === 'done') {
      onDownloadProgress({
        id,
        stage,
        label,
        file,
        progress: 100,
        loaded: event.loaded,
        total: event.total,
        done: true,
      });
    }
  };
}

export async function loadModel(
  modelId: string,
  onProgress: (msg: string) => void,
  localFiles?: File[],
  remoteOnnxFileName: string = DEFAULT_REMOTE_ONNX_FILE,
  localModelFileName?: string,
  onDownloadProgress?: (entry: ModelDownloadProgressEntry) => void,
) {
  const selectedRemoteOnnxFile = normalizeRemoteOnnxFileName(remoteOnnxFileName);
  const modelLoadKey = localFiles ? 'local-model' : `${modelId}::${selectedRemoteOnnxFile}`;

  // If loading locally, we use a virtual ID
  const effectiveModelId = localFiles ? 'local-model' : modelLoadKey;

  // Force reload if local files are provided (user might have changed folder)
  // Or if switching between remote models
  if (model && currentModelId === effectiveModelId && !localFiles) {
    return; // Already loaded same remote model
  }

  // Reset for new load
  model = null;
  processor = null;

  const disableBrowserCacheForLocal = !!(localFiles && localFiles.length > 0);
  const previousUseBrowserCache = env.useBrowserCache;
  if (disableBrowserCacheForLocal) {
    env.useBrowserCache = false;
  }

  try {
    const revision = localFiles ? 'none' : 'main';

    // 1. Handle Local Files Setup
    if (localFiles && localFiles.length > 0) {
      setupLocalFetchInterceptor();
      localFileMap.clear();

      onProgress(`Processing ${localFiles.length} local files...`);

      // Create Blob URLs for key files
      // We look for model.onnx (or model.quant.onnx), config.json, preprocessor_config.json, tokenizer.json
      for (const file of localFiles) {
        // We match loosely on filename to handle folder nesting if browser flattens or keeps paths
        const name = file.name.split('/').pop() || file.name; // get basename
        const blobUrl = URL.createObjectURL(file);

        localFileMap.set(name, blobUrl);

        // Logic to map the primary ONNX file to 'model.onnx' which transformers.js expects
        if (localModelFileName && name === localModelFileName) {
          localFileMap.set('model.onnx', blobUrl);
        } else if (!localModelFileName && name.endsWith('.onnx')) {
          // Default behavior (first found or last overwrites)
          localFileMap.set('model.onnx', blobUrl);
        }
      }

      // Ensure we have minimal config
      if (!localFileMap.has('config.json') || !localFileMap.has('model.onnx')) {
        onProgress('Warning: Missing config.json or model.onnx in selected folder.');
      }

      if (localFileMap.has('preprocessor_config.json')) {
        onProgress('Found preprocessor configuration.');
      } else {
        onProgress('Warning: preprocessor_config.json not found. Transformers.js may use default parameters or fail.');
      }

      // For local loading, we trick transformers.js by using the virtual path
      // env.allowLocalModels must be false so it tries to 'fetch' our virtual URL,
      // which we then intercept.
      modelId = 'local-model';
    }

    // 2. Load Processor
    onProgress(`Loading processor for ${modelId}...`);
    processor = await AutoProcessor.from_pretrained(modelId, {
      revision,
      progress_callback: createFileDownloadProgressReporter('processor', 'Processor file', onDownloadProgress),
    });

    const modelLoadOptions: any = {
      revision,
      progress_callback: createFileDownloadProgressReporter('model', 'Model file', onDownloadProgress),
      dtype: 'fp32',
    };
    if (!localFiles) {
      modelLoadOptions.model_file_name = toModelFileName(selectedRemoteOnnxFile);
      modelLoadOptions.subfolder = ONNX_SUBFOLDER;
    }

    // 3. Load Model
    const remoteVariantLabel = localFiles ? '' : ` (${selectedRemoteOnnxFile})`;
    onProgress(`Loading model architecture for ${modelId}${remoteVariantLabel}...`);
    model = await AutoModel.from_pretrained(modelId, modelLoadOptions);

    currentModelId = effectiveModelId;

    // Log Model Config for Debugging
    console.log('Loaded Model Config:', model.config);
    if (model.config.num_register_tokens) {
      onProgress(`Model loaded with ${model.config.num_register_tokens} register tokens (DINOv2+Registers/v3).`);
    } else {
      const loadedModelLabel = localFiles ? effectiveModelId : `${modelId} (${selectedRemoteOnnxFile})`;
      onProgress(`Model ${loadedModelLabel} loaded successfully.`);
    }
  } catch (error: any) {
    console.error('Model load error', error);
    throw new Error(`Failed to load model: ${error.message}`);
  } finally {
    if (disableBrowserCacheForLocal) {
      env.useBrowserCache = previousUseBrowserCache;
    }
  }
}

export async function runInference(
  file: File,
  preprocessingConfig?: PreprocessingConfig,
  signal?: AbortSignal,
): Promise<InferenceResult> {
  if (!model || !processor) {
    throw new Error('Model not loaded');
  }
  throwIfAborted(signal);

  // 1. Determine Target Size
  // processor.feature_extractor.size can be { height: 224, width: 224 } or { shortest_edge: 224 } or just 224
  let targetW = 224;
  let targetH = 224;

  if (processor.feature_extractor) {
    const size = processor.feature_extractor.size;
    const crop_size = processor.feature_extractor.crop_size;

    if (crop_size) {
      // If crop_size is defined, that is the final tensor size usually
      if (typeof crop_size === 'number') {
        targetW = crop_size;
        targetH = crop_size;
      } else if (crop_size.width) {
        targetW = crop_size.width;
        targetH = crop_size.height;
      }
    } else if (size) {
      if (typeof size === 'number') {
        targetW = size;
        targetH = size;
      } else if (size.width) {
        targetW = size.width;
        targetH = size.height;
      } else if (size.shortest_edge) {
        targetW = size.shortest_edge;
        targetH = size.shortest_edge;
      }
    }
  }

  let image: RawImage;

  // 2. Preprocess
  // If config is provided, we perform manual resize/pad/crop on a canvas to ensure exact control
  if (preprocessingConfig) {
    image = await preprocessImage(file, preprocessingConfig, {
      width: targetW,
      height: targetH,
    });
  } else {
    // Default transformers.js behavior
    const objectUrl = URL.createObjectURL(file);
    try {
      image = await RawImage.fromURL(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  throwIfAborted(signal);

  // 3. Run Processor
  // IMPORTANT: Since we manually resized, we disable the processor's geometric transforms to prevent double-resizing or wrong cropping
  // We still want it to normalize (mean/std) and convert to tensor.
  const inputs = await processor(image, {
    do_resize: !preprocessingConfig, // If we manually preprocessed, don't resize again
    do_center_crop: !preprocessingConfig, // If we manually preprocessed, don't crop again
  });
  throwIfAborted(signal);

  // 4. Inference
  throwIfAborted(signal);
  const outputs = await model(inputs);
  throwIfAborted(signal);

  // Extract last hidden state: [batch_size, seq_len, hidden_size]
  const lastHiddenState = outputs.last_hidden_state;
  const [batchSize, seqLen, hiddenSize] = lastHiddenState.dims;
  const data = lastHiddenState.data;

  // --- Handling DINOv2 vs DINOv3 (Registers) ---
  // Check config for register tokens, default to 0 to be safe
  const numRegisterTokens = typeof model.config.num_register_tokens === 'number' ? model.config.num_register_tokens : 0;

  // Index 0 is CLS
  // Index 1..N might be Registers
  // Index 1+N .. End are Patches
  const patchStartIndex = 1 + numRegisterTokens;

  // CLS Token
  const clsToken = [];
  for (let i = 0; i < hiddenSize; i++) {
    clsToken.push(data[i]);
  }

  const patches = [];

  // Iterate strictly over the patch tokens
  // Safety check: ensure we don't go out of bounds if seqLen is weird
  const safeEnd = Math.max(patchStartIndex, seqLen);

  for (let i = patchStartIndex; i < safeEnd; i++) {
    const patchVector = [];
    for (let j = 0; j < hiddenSize; j++) {
      patchVector.push(data[i * hiddenSize + j]);
    }
    patches.push(patchVector);
  }

  // Recalculate grid
  // patches length should be square usually (e.g. 256, 1024)
  const numPatches = patches.length;
  let gridSize = Math.sqrt(numPatches);

  // If we have some slight rounding error or extra token, we fallback to dimensions from model config if available
  // But usually, square root is the best guess for Vision Transformers
  if (!Number.isInteger(gridSize)) {
    // Try to correct based on image size and patch size if available in config
    // But typically sqrt is robust enough for standard ViTs
    gridSize = Math.floor(gridSize);
  }

  return {
    embedding: clsToken,
    patches: patches,
    dimensions: {
      width: gridSize,
      height: gridSize,
      patchSize: model.config.patch_size || 14,
    },
  };
}
