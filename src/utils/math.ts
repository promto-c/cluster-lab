// A simple Principal Component Analysis (PCA) implementation
import { ColormapType } from '@/types';

export interface PCAModel {
  mean: number[];
  components: number[][];
}

export interface ChannelRange {
  min: number;
  max: number;
}

export function computePCA(data: number[][], components: number = 3): number[][] {
  const model = fitPCA(data, components);
  return projectPCA(data, model, components);
}

export function fitPCA(data: number[][], components: number = 3): PCAModel {
  if (data.length === 0 || data[0].length === 0) return { mean: [], components: [] };

  const m = data[0].length;
  const cleanData = data.filter((row) => row.length === m);
  if (cleanData.length === 0) return { mean: [], components: [] };

  const n = cleanData.length;
  const componentCount = Math.min(Math.max(1, components), m);

  // 1. Center the data
  const mean = new Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      mean[j] += cleanData[i][j];
    }
  }
  for (let j = 0; j < m; j++) mean[j] /= n;

  const centered = cleanData.map((row) => row.map((val, j) => val - mean[j]));

  // 2. Compute Principal Components using Power Iteration
  const principalComponents: number[][] = [];
  let currentData = centered.map((row) => [...row]);

  for (let k = 0; k < componentCount; k++) {
    // Deterministic Initialization
    // Use a fixed seed pattern instead of random to ensure consistent results across renders
    let eigenvector = new Array(m).fill(0).map((_, i) => Math.sin(i + k * 33));
    let len = Math.sqrt(eigenvector.reduce((a, b) => a + b * b, 0));
    if (len === 0) len = 1;
    eigenvector = eigenvector.map((x) => x / len);

    // Power iteration
    // Increased iterations slightly for better convergence on embedding data
    for (let iter = 0; iter < 20; iter++) {
      const nextVector = new Array(m).fill(0);

      const temp = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < m; j++) {
          temp[i] += currentData[i][j] * eigenvector[j];
        }
      }

      for (let j = 0; j < m; j++) {
        for (let i = 0; i < n; i++) {
          nextVector[j] += currentData[i][j] * temp[i];
        }
      }

      const mag = Math.sqrt(nextVector.reduce((a, b) => a + b * b, 0));
      if (mag < 1e-6) break;
      eigenvector = nextVector.map((x) => x / mag);
    }

    // Sign Canonicalization
    // Ensure the component with the largest magnitude is positive.
    // This prevents the PCA axis from flipping (180 degrees) arbitrarily between similar images.
    let maxAbs = -1;
    let maxIdx = -1;
    for (let i = 0; i < m; i++) {
      if (Math.abs(eigenvector[i]) > maxAbs) {
        maxAbs = Math.abs(eigenvector[i]);
        maxIdx = i;
      }
    }
    if (maxIdx !== -1 && eigenvector[maxIdx] < 0) {
      eigenvector = eigenvector.map((x) => -x);
    }

    principalComponents.push(eigenvector);

    // Deflate
    for (let i = 0; i < n; i++) {
      let projection = 0;
      for (let j = 0; j < m; j++) projection += currentData[i][j] * eigenvector[j];

      for (let j = 0; j < m; j++) {
        currentData[i][j] -= projection * eigenvector[j];
      }
    }
  }

  return { mean, components: principalComponents };
}

export function projectPCA(
  data: number[][],
  model: PCAModel,
  components: number = model.components.length,
): number[][] {
  if (data.length === 0 || model.components.length === 0 || model.mean.length === 0) return [];

  const componentCount = Math.min(components, model.components.length);
  if (componentCount <= 0) return [];

  const dim = model.mean.length;
  const compatibleRows = data.filter((row) => row.length === dim);

  return compatibleRows.map((row) => {
    const centered = row.map((val, i) => val - model.mean[i]);
    return model.components.slice(0, componentCount).map((pc) => {
      let sum = 0;
      for (let i = 0; i < dim; i++) sum += centered[i] * pc[i];
      return sum;
    });
  });
}

export function computeChannelRanges(
  data: number[][],
  lowerQuantile: number = 0.01,
  upperQuantile: number = 0.99,
): ChannelRange[] {
  if (data.length === 0 || data[0].length === 0) return [];

  const channels = data[0].length;
  const n = data.length;
  const ranges: ChannelRange[] = [];

  for (let c = 0; c < channels; c++) {
    const colValues = new Array(n);
    for (let i = 0; i < n; i++) colValues[i] = data[i][c];
    colValues.sort((a, b) => a - b);

    let min = colValues[Math.floor(n * lowerQuantile)] ?? colValues[0];
    let max = colValues[Math.floor(n * upperQuantile)] ?? colValues[n - 1];

    if (min === max) {
      min = colValues[0];
      max = colValues[n - 1];
    }

    ranges.push({ min, max });
  }

  return ranges;
}

export function extractChannel(data: number[][], index: number): number[][] {
  if (data.length === 0) return [];
  // bound check
  const actualIndex = Math.min(Math.max(0, index), data[0].length - 1);
  return data.map((row) => [row[actualIndex]]);
}

// --- Vector Math for Clustering ---

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

export function cosineDistance(a: number[], b: number[]): number {
  const d = dot(a, b);
  const nA = norm(a);
  const nB = norm(b);
  if (nA === 0 || nB === 0) return 1.0;
  return 1.0 - d / (nA * nB);
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function normalizeVector(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v;
  return v.map((x) => x / n);
}

// --- Stats Helpers ---

export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
}

// --- Dimensionality Reduction ---

/**
 * Reduce high-dimensional embeddings to `dims` dimensions via PCA.
 * Returns an array of [x,y,z] (or [x,y] etc.) per input point.
 */
export function reducePCA(data: number[][], dims: number = 3): number[][] {
  if (data.length === 0) return [];
  return computePCA(data, dims);
}

/**
 * Simple UMAP-like layout via stochastic neighbor embedding in low-D.
 * This is a lightweight Barnes-Hut-free implementation suitable for
 * a few thousand points in-browser.
 */
export function reduceUMAP(
  data: number[][],
  dims: number = 3,
  nNeighbors: number = 15,
  minDist: number = 0.1,
  nEpochs: number = 200,
): number[][] {
  const n = data.length;
  if (n === 0) return [];
  if (n === 1) return [new Array(dims).fill(0)];

  const k = Math.min(nNeighbors, n - 1);

  // 1. Build kNN graph (brute force, euclidean)
  const dists: { idx: number; d: number }[][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: { idx: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      row.push({ idx: j, d: euclideanDistance(data[i], data[j]) });
    }
    row.sort((a, b) => a.d - b.d);
    dists[i] = row.slice(0, k);
  }

  // 2. Compute smooth knn-distances (sigma)
  const sigmas: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const rho = dists[i][0].d; // Distance to nearest neighbor
    // Binary search for sigma such that sum of exp(-(d-rho)/sigma) ≈ log2(k)
    const target = Math.log2(k);
    let lo = 1e-10,
      hi = 1000,
      mid = 1;
    for (let iter = 0; iter < 64; iter++) {
      mid = (lo + hi) / 2;
      let sum = 0;
      for (const nb of dists[i]) {
        const dScaled = Math.max(nb.d - rho, 0) / mid;
        sum += Math.exp(-dScaled);
      }
      if (sum > target) lo = mid;
      else hi = mid;
      if (Math.abs(sum - target) < 1e-5) break;
    }
    sigmas[i] = mid;
  }

  // 3. Build symmetrized graph weights
  type Edge = { i: number; j: number; w: number };
  const edgeMap = new Map<string, Edge>();
  for (let i = 0; i < n; i++) {
    const rho = dists[i][0].d;
    for (const nb of dists[i]) {
      const w = Math.exp(-Math.max(nb.d - rho, 0) / sigmas[i]);
      const key = i < nb.idx ? `${i}-${nb.idx}` : `${nb.idx}-${i}`;
      const existing = edgeMap.get(key);
      if (existing) {
        // Symmetrize: w_sym = w_ij + w_ji - w_ij * w_ji
        existing.w = existing.w + w - existing.w * w;
      } else {
        edgeMap.set(key, { i: Math.min(i, nb.idx), j: Math.max(i, nb.idx), w });
      }
    }
  }
  const edges = Array.from(edgeMap.values());

  // 4. Initialize low-dim with spectral-like init (PCA fallback)
  let Y: number[][];
  if (n > dims) {
    Y = computePCA(data, dims);
    // Scale to small range
    for (let d = 0; d < dims; d++) {
      const col = Y.map((r) => r[d]);
      const mn = Math.min(...col);
      const mx = Math.max(...col);
      const rng = mx - mn || 1;
      for (let i = 0; i < n; i++) Y[i][d] = ((Y[i][d] - mn) / rng - 0.5) * 10;
    }
  } else {
    Y = data.map(() => Array.from({ length: dims }, () => (Math.random() - 0.5) * 10));
  }

  // 5. Optimization (simplified SGD with edge sampling)
  const a = 1.0;
  const b = 1.0 / Math.max(minDist, 0.001);

  for (let epoch = 0; epoch < nEpochs; epoch++) {
    const alpha = 1.0 - epoch / nEpochs; // Learning rate decay
    const lr = Math.max(alpha, 0.01);

    // Attractive forces (along graph edges)
    for (const edge of edges) {
      const { i: ei, j: ej, w } = edge;
      let distSq = 0;
      for (let d = 0; d < dims; d++) {
        distSq += (Y[ei][d] - Y[ej][d]) ** 2;
      }
      const dist = Math.sqrt(distSq) + 1e-4;
      const gradCoeff = ((-2 * a * b * Math.pow(distSq, b / 2 - 1)) / (1 + a * Math.pow(distSq, b))) * w;

      for (let d = 0; d < dims; d++) {
        const grad = gradCoeff * (Y[ei][d] - Y[ej][d]) * lr;
        const clampedGrad = Math.max(-4, Math.min(4, grad));
        Y[ei][d] += clampedGrad;
        Y[ej][d] -= clampedGrad;
      }
    }

    // Repulsive forces (sample negative edges)
    const nNeg = Math.min(5, n - 1);
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < nNeg; s++) {
        const j = Math.floor(Math.random() * n);
        if (j === i) continue;
        let distSq = 0;
        for (let d = 0; d < dims; d++) {
          distSq += (Y[i][d] - Y[j][d]) ** 2;
        }
        const repGrad = (2 * b) / ((0.001 + distSq) * (1 + a * Math.pow(distSq, b)));
        for (let d = 0; d < dims; d++) {
          const grad = repGrad * (Y[i][d] - Y[j][d]) * lr;
          const clampedGrad = Math.max(-4, Math.min(4, grad));
          Y[i][d] += clampedGrad;
        }
      }
    }
  }

  return Y;
}

/**
 * t-SNE dimensionality reduction (simplified Barnes-Hut-free).
 * Suitable for up to a few thousand points in-browser.
 */
export function reduceTSNE(
  data: number[][],
  dims: number = 3,
  perplexity: number = 30,
  nIter: number = 300,
  learningRate: number = 200,
): number[][] {
  const n = data.length;
  if (n === 0) return [];
  if (n === 1) return [new Array(dims).fill(0)];

  const perp = Math.min(perplexity, Math.floor((n - 1) / 3));

  // 1. Compute pairwise squared distances
  const D: number[] = new Array(n * n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let s = 0;
      for (let k = 0; k < data[i].length; k++) {
        s += (data[i][k] - data[j][k]) ** 2;
      }
      D[i * n + j] = s;
      D[j * n + i] = s;
    }
  }

  // 2. Compute pairwise affinities P with binary search for sigma
  const P: number[] = new Array(n * n).fill(0);
  const targetEntropy = Math.log(perp);

  for (let i = 0; i < n; i++) {
    let lo = 1e-10,
      hi = 1e4,
      beta = 1;
    for (let iter = 0; iter < 50; iter++) {
      beta = (lo + hi) / 2;
      let sum = 0;
      let entropy = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const val = Math.exp(-D[i * n + j] * beta);
        sum += val;
      }
      if (sum === 0) sum = 1e-10;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const pj = Math.exp(-D[i * n + j] * beta) / sum;
        if (pj > 1e-7) entropy -= pj * Math.log(pj);
      }
      if (entropy > targetEntropy) lo = beta;
      else hi = beta;
      if (Math.abs(entropy - targetEntropy) < 1e-5) break;
    }
    // Set row
    let sum = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) {
        P[i * n + j] = 0;
        continue;
      }
      const val = Math.exp(-D[i * n + j] * beta);
      P[i * n + j] = val;
      sum += val;
    }
    if (sum === 0) sum = 1e-10;
    for (let j = 0; j < n; j++) P[i * n + j] /= sum;
  }

  // Symmetrize
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sym = (P[i * n + j] + P[j * n + i]) / (2 * n);
      P[i * n + j] = Math.max(sym, 1e-12);
      P[j * n + i] = Math.max(sym, 1e-12);
    }
  }

  // 3. Initialize Y with PCA or random
  let Y: number[][];
  if (n > dims) {
    Y = computePCA(data, dims);
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < dims; d++) Y[i][d] *= 0.0001;
    }
  } else {
    Y = data.map(() => Array.from({ length: dims }, () => (Math.random() - 0.5) * 0.0001));
  }

  // Gradient descent
  const gains: number[][] = Y.map(() => new Array(dims).fill(1));
  const yVel: number[][] = Y.map(() => new Array(dims).fill(0));
  const momentum = 0.5;
  const finalMomentum = 0.8;

  for (let iter = 0; iter < nIter; iter++) {
    const mom = iter < 100 ? momentum : finalMomentum;

    // Compute Q (student-t)
    const Q: number[] = new Array(n * n).fill(0);
    let qSum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dSq = 0;
        for (let d = 0; d < dims; d++) dSq += (Y[i][d] - Y[j][d]) ** 2;
        const val = 1 / (1 + dSq);
        Q[i * n + j] = val;
        Q[j * n + i] = val;
        qSum += 2 * val;
      }
    }
    if (qSum === 0) qSum = 1e-10;

    // Gradient
    for (let i = 0; i < n; i++) {
      for (let d = 0; d < dims; d++) {
        let grad = 0;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const pq = P[i * n + j] - Q[i * n + j] / qSum;
          grad += 4 * pq * Q[i * n + j] * (Y[i][d] - Y[j][d]);
        }
        // Adaptive gains
        if (Math.sign(grad) !== Math.sign(yVel[i][d])) {
          gains[i][d] = Math.min(gains[i][d] + 0.2, 5);
        } else {
          gains[i][d] = Math.max(gains[i][d] * 0.8, 0.01);
        }
        yVel[i][d] = mom * yVel[i][d] - learningRate * gains[i][d] * grad;
        Y[i][d] += yVel[i][d];
      }
    }

    // Center
    for (let d = 0; d < dims; d++) {
      let avg = 0;
      for (let i = 0; i < n; i++) avg += Y[i][d];
      avg /= n;
      for (let i = 0; i < n; i++) Y[i][d] -= avg;
    }
  }

  return Y;
}

export function findElbowIndex(data: number[]): number {
  if (data.length < 3) return 0;

  const n = data.length;
  // Define line between first and last point
  const x1 = 0;
  const y1 = data[0];
  const x2 = n - 1;
  const y2 = data[n - 1];

  let maxDist = -1;
  let idx = 0;

  // y = mx + c => mx - y + c = 0
  // m = (y2-y1)/(x2-x1)
  // Distance from point (x0, y0) to Ax + By + C = 0 is |Ax0 + By0 + C| / sqrt(A^2 + B^2)
  // Eq: (y2-y1)x - (x2-x1)y + x2y1 - y2x1 = 0

  const A = y2 - y1;
  const B = -(x2 - x1);
  const C = x2 * y1 - y2 * x1;
  const den = Math.sqrt(A * A + B * B);

  for (let i = 0; i < n; i++) {
    const d = Math.abs(A * i + B * data[i] + C) / den;
    if (d > maxDist) {
      maxDist = d;
      idx = i;
    }
  }
  return idx;
}

// --- Color Map Logic ---

type RGB = [number, number, number];

// Simplified gradient stops for common colormaps
const COLOR_STOPS: Record<string, { t: number; color: RGB }[]> = {
  viridis: [
    { t: 0.0, color: [68, 1, 84] },
    { t: 0.25, color: [59, 82, 139] },
    { t: 0.5, color: [33, 145, 140] },
    { t: 0.75, color: [94, 201, 98] },
    { t: 1.0, color: [253, 231, 37] },
  ],
  inferno: [
    { t: 0.0, color: [0, 0, 4] },
    { t: 0.25, color: [87, 16, 109] },
    { t: 0.5, color: [187, 55, 84] },
    { t: 0.75, color: [249, 142, 9] },
    { t: 1.0, color: [252, 255, 164] },
  ],
  plasma: [
    { t: 0.0, color: [13, 8, 135] },
    { t: 0.25, color: [126, 3, 168] },
    { t: 0.5, color: [204, 71, 120] },
    { t: 0.75, color: [248, 149, 64] },
    { t: 1.0, color: [240, 249, 33] },
  ],
  magma: [
    { t: 0.0, color: [0, 0, 4] },
    { t: 0.25, color: [81, 28, 116] },
    { t: 0.5, color: [183, 55, 121] },
    { t: 0.75, color: [252, 137, 97] },
    { t: 1.0, color: [252, 253, 191] },
  ],
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function interpolateColor(value: number, stops: { t: number; color: RGB }[]): RGB {
  // Clamp
  if (value <= 0) return stops[0].color;
  if (value >= 1) return stops[stops.length - 1].color;

  // Find segment
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].t && value <= stops[i + 1].t) {
      const t = (value - stops[i].t) / (stops[i + 1].t - stops[i].t);
      const c1 = stops[i].color;
      const c2 = stops[i + 1].color;
      return [Math.floor(lerp(c1[0], c2[0], t)), Math.floor(lerp(c1[1], c2[1], t)), Math.floor(lerp(c1[2], c2[2], t))];
    }
  }
  return stops[stops.length - 1].color;
}

export function mapDataToColors(data: number[][], colormap: ColormapType, channelRanges?: ChannelRange[]): RGB[] {
  if (data.length === 0) return [];
  const channels = data[0].length;
  const n = data.length;

  // Normalize each channel 0-1
  const normalized = data.map(() => new Array(channels).fill(0));

  for (let c = 0; c < channels; c++) {
    let min: number;
    let max: number;

    if (channelRanges && channelRanges[c]) {
      min = channelRanges[c].min;
      max = channelRanges[c].max;
    } else {
      // Collect all values for this channel
      const colValues = new Array(n);
      for (let i = 0; i < n; i++) colValues[i] = data[i][c];

      // Sort to find percentiles for robust min/max
      colValues.sort((a, b) => a - b);

      // Clip 1% outliers from both ends to improve contrast and consistency
      min = colValues[Math.floor(n * 0.01)] ?? colValues[0];
      max = colValues[Math.floor(n * 0.99)] ?? colValues[n - 1];

      if (min === max) {
        min = colValues[0];
        max = colValues[n - 1];
      }
    }

    let range = max - min;
    if (range < 1e-6) range = 0;

    for (let i = 0; i < n; i++) {
      let val = data[i][c];
      // Clamp
      if (val < min) val = min;
      if (val > max) val = max;

      normalized[i][c] = range === 0 ? 0.5 : (val - min) / range;
    }
  }

  // Map to RGB
  return normalized.map((row) => {
    if (colormap === 'rgb' && channels >= 3) {
      // Direct RGB mapping (taking first 3 channels)
      return [Math.floor(row[0] * 255), Math.floor(row[1] * 255), Math.floor(row[2] * 255)];
    } else {
      // 1-channel mapping (use first component)
      const val = row[0]; // 0-1

      if (colormap === 'grayscale') {
        const gray = Math.floor(val * 255);
        return [gray, gray, gray];
      }

      const stops = COLOR_STOPS[colormap] || COLOR_STOPS['viridis'];
      return interpolateColor(val, stops);
    }
  });
}
