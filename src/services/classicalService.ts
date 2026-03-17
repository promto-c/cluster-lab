import { ClassicalFeaturesConfig, InferenceResult } from '@/types';

function createAbortError() {
  return new DOMException('Embedding run was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

// Helper: Load Image to ImageData
async function getImageData(file: File, targetSize: number = 224, signal?: AbortSignal): Promise<ImageData> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      img.onload = null;
      img.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Resize to fixed size for consistency in features like HOG
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        return reject(new Error('Canvas context failed'));
      }
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      cleanup();
      resolve(ctx.getImageData(0, 0, targetSize, targetSize));
    };
    img.onerror = (e) => {
      cleanup();
      reject(e);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    img.src = url;
  });
}

function toGrayscale(imageData: ImageData): Uint8ClampedArray {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < data.length; i += 4) {
    // Standard luminance: 0.299R + 0.587G + 0.114B
    gray[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
}

// 1. Color Histogram (RGB)
function computeColorHistogram(imageData: ImageData, binsPerChannel: number = 8): number[] {
  const { data } = imageData;
  const binSize = 256 / binsPerChannel;
  const totalBins = binsPerChannel * 3; // RGB
  const hist = new Array(totalBins).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const rBin = Math.floor(data[i] / binSize);
    const gBin = Math.floor(data[i + 1] / binSize);
    const bBin = Math.floor(data[i + 2] / binSize);

    // Safety clamp
    const safeR = Math.min(rBin, binsPerChannel - 1);
    const safeG = Math.min(gBin, binsPerChannel - 1);
    const safeB = Math.min(bBin, binsPerChannel - 1);

    hist[safeR]++;
    hist[binsPerChannel + safeG]++;
    hist[2 * binsPerChannel + safeB]++;
  }

  // Normalize
  const pixelCount = data.length / 4;
  return hist.map((v) => v / pixelCount);
}

// 2. LBP (Local Binary Patterns) - Uniform LBP simplified to standard LBP for demo
function computeLBP(gray: Uint8ClampedArray, width: number, height: number): number[] {
  const hist = new Array(256).fill(0);

  // Iterate inner pixels
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const center = gray[y * width + x];
      let code = 0;

      // Compare 8 neighbors
      // Top-Left, Top, Top-Right, Right, Bottom-Right, Bottom, Bottom-Left, Left
      if (gray[(y - 1) * width + (x - 1)] >= center) code |= 128;
      if (gray[(y - 1) * width + x] >= center) code |= 64;
      if (gray[(y - 1) * width + (x + 1)] >= center) code |= 32;
      if (gray[y * width + (x + 1)] >= center) code |= 16;
      if (gray[(y + 1) * width + (x + 1)] >= center) code |= 8;
      if (gray[(y + 1) * width + x] >= center) code |= 4;
      if (gray[(y + 1) * width + (x - 1)] >= center) code |= 2;
      if (gray[y * width + (x - 1)] >= center) code |= 1;

      hist[code]++;
    }
  }

  // Normalize
  const count = (width - 2) * (height - 2);
  return hist.map((v) => v / count);
}

// 3. GLCM (Gray-Level Co-occurrence Matrix)
function computeGLCMStats(gray: Uint8ClampedArray, width: number, height: number): number[] {
  // Simplified: 16 levels of gray for matrix size 16x16 to keep it fast
  const levels = 16;
  const matrix = Array.from({ length: levels }, () => new Array(levels).fill(0));
  const scale = levels / 256;

  let pairs = 0;

  // Only computing horizontal offset (1,0) for simplicity in demo
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = Math.floor(gray[y * width + x] * scale);
      const j = Math.floor(gray[y * width + (x + 1)] * scale);
      matrix[i][j]++;
      pairs++;
    }
  }

  // Normalize Matrix
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      matrix[i][j] /= pairs;
    }
  }

  // Extract Stats: Contrast, Correlation, Energy, Homogeneity
  let contrast = 0;
  let energy = 0;
  let homogeneity = 0;
  let mu_x = 0;
  let mu_y = 0;
  let sig_x = 0;
  let sig_y = 0;

  // Basic Moments
  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      const p = matrix[i][j];
      contrast += (i - j) * (i - j) * p;
      energy += p * p;
      homogeneity += p / (1 + Math.abs(i - j));

      mu_x += i * p;
      mu_y += j * p;
    }
  }

  for (let i = 0; i < levels; i++) {
    for (let j = 0; j < levels; j++) {
      const p = matrix[i][j];
      sig_x += (i - mu_x) ** 2 * p;
      sig_y += (j - mu_y) ** 2 * p;
    }
  }
  sig_x = Math.sqrt(sig_x);
  sig_y = Math.sqrt(sig_y);

  let correlation = 0;
  if (sig_x * sig_y !== 0) {
    for (let i = 0; i < levels; i++) {
      for (let j = 0; j < levels; j++) {
        correlation += ((i - mu_x) * (j - mu_y) * matrix[i][j]) / (sig_x * sig_y);
      }
    }
  }

  return [contrast, correlation, energy, homogeneity];
}

// 4. HOG (Histogram of Oriented Gradients) - Simplified
function computeHOG(gray: Uint8ClampedArray, width: number, height: number): number[] {
  // Cell size 32x32 for global descriptor (224/32 = 7 cells)
  const cellSize = 32;
  const bins = 9; // 0-180 degrees
  const cellsX = Math.floor(width / cellSize);
  const cellsY = Math.floor(height / cellSize);
  const histograms = new Array(cellsX * cellsY * bins).fill(0);

  const getPixel = (x: number, y: number) => {
    // Clamp coords
    const cx = Math.max(0, Math.min(width - 1, x));
    const cy = Math.max(0, Math.min(height - 1, y));
    return gray[cy * width + cx];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Simple gradient
      const gx = getPixel(x + 1, y) - getPixel(x - 1, y);
      const gy = getPixel(x, y + 1) - getPixel(x, y - 1);

      const mag = Math.sqrt(gx * gx + gy * gy);
      let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
      if (angle < 0) angle += 180; // Unsigned orientation
      if (angle >= 180) angle -= 180;

      const bin = Math.floor(angle / (180 / bins));
      const safeBin = Math.min(bin, bins - 1);

      const cellX = Math.floor(x / cellSize);
      const cellY = Math.floor(y / cellSize);

      if (cellX < cellsX && cellY < cellsY) {
        const histIdx = (cellY * cellsX + cellX) * bins + safeBin;
        histograms[histIdx] += mag;
      }
    }
  }

  // L2 Normalize entire HOG vector
  let sumSq = 0;
  for (let v of histograms) sumSq += v * v;
  const norm = Math.sqrt(sumSq) || 1;
  return histograms.map((v) => v / norm);
}

export async function runClassicalInference(
  file: File,
  config: ClassicalFeaturesConfig,
  signal?: AbortSignal,
): Promise<InferenceResult> {
  throwIfAborted(signal);
  const imageData = await getImageData(file, 224, signal);
  throwIfAborted(signal);
  const gray = toGrayscale(imageData);

  let embedding: number[] = [];

  if (config.colorHistogram) {
    throwIfAborted(signal);
    const hist = computeColorHistogram(imageData, 16); // 16 bins -> 48 dims
    embedding = embedding.concat(hist);
  }

  if (config.lbp) {
    throwIfAborted(signal);
    const lbp = computeLBP(gray, 224, 224); // 256 dims
    embedding = embedding.concat(lbp);
  }

  if (config.glcm) {
    throwIfAborted(signal);
    const stats = computeGLCMStats(gray, 224, 224); // 4 dims
    embedding = embedding.concat(stats);
  }

  if (config.hog) {
    throwIfAborted(signal);
    const hog = computeHOG(gray, 224, 224); // (7x7 cells * 9 bins) = 441 dims
    embedding = embedding.concat(hog);
  }

  // If nothing selected, just return mean color
  if (embedding.length === 0) {
    throwIfAborted(signal);
    const hist = computeColorHistogram(imageData, 4);
    embedding = hist;
  }

  return {
    embedding: embedding,
    patches: [], // No patches for classical features
    dimensions: {
      width: 0,
      height: 0,
      patchSize: 0,
    },
  };
}
