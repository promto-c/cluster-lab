
// A simple Principal Component Analysis (PCA) implementation
import { ColormapType } from '../types';

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
  const cleanData = data.filter(row => row.length === m);
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

  const centered = cleanData.map(row => row.map((val, j) => val - mean[j]));

  // 2. Compute Principal Components using Power Iteration
  const principalComponents: number[][] = [];
  let currentData = centered.map(row => [...row]);

  for (let k = 0; k < componentCount; k++) {
    // Deterministic Initialization
    // Use a fixed seed pattern instead of random to ensure consistent results across renders
    let eigenvector = new Array(m).fill(0).map((_, i) => Math.sin(i + k * 33));
    let len = Math.sqrt(eigenvector.reduce((a, b) => a + b * b, 0));
    if (len === 0) len = 1;
    eigenvector = eigenvector.map(x => x / len);

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
      eigenvector = nextVector.map(x => x / mag);
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
      eigenvector = eigenvector.map(x => -x);
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

export function projectPCA(data: number[][], model: PCAModel, components: number = model.components.length): number[][] {
  if (data.length === 0 || model.components.length === 0 || model.mean.length === 0) return [];

  const componentCount = Math.min(components, model.components.length);
  if (componentCount <= 0) return [];

  const dim = model.mean.length;
  const compatibleRows = data.filter(row => row.length === dim);

  return compatibleRows.map(row => {
    const centered = row.map((val, i) => val - model.mean[i]);
    return model.components.slice(0, componentCount).map(pc => {
      let sum = 0;
      for (let i = 0; i < dim; i++) sum += centered[i] * pc[i];
      return sum;
    });
  });
}

export function computeChannelRanges(
  data: number[][],
  lowerQuantile: number = 0.01,
  upperQuantile: number = 0.99
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
  return data.map(row => [row[actualIndex]]);
}

// --- Vector Math for Clustering ---

export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for(let i=0; i<a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function norm(a: number[]): number {
  let sum = 0;
  for(let i=0; i<a.length; i++) sum += a[i] * a[i];
  return Math.sqrt(sum);
}

export function cosineDistance(a: number[], b: number[]): number {
  const d = dot(a, b);
  const nA = norm(a);
  const nB = norm(b);
  if (nA === 0 || nB === 0) return 1.0;
  return 1.0 - (d / (nA * nB));
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for(let i=0; i<a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export function normalizeVector(v: number[]): number[] {
  const n = norm(v);
  if (n === 0) return v;
  return v.map(x => x / n);
}

// --- Stats Helpers ---

export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
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
  const den = Math.sqrt(A*A + B*B);
  
  for(let i=0; i<n; i++) {
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
const COLOR_STOPS: Record<string, { t: number, color: RGB }[]> = {
  viridis: [
    { t: 0.0, color: [68, 1, 84] },
    { t: 0.25, color: [59, 82, 139] },
    { t: 0.5, color: [33, 145, 140] },
    { t: 0.75, color: [94, 201, 98] },
    { t: 1.0, color: [253, 231, 37] }
  ],
  inferno: [
    { t: 0.0, color: [0, 0, 4] },
    { t: 0.25, color: [87, 16, 109] },
    { t: 0.5, color: [187, 55, 84] },
    { t: 0.75, color: [249, 142, 9] },
    { t: 1.0, color: [252, 255, 164] }
  ],
  plasma: [
    { t: 0.0, color: [13, 8, 135] },
    { t: 0.25, color: [126, 3, 168] },
    { t: 0.5, color: [204, 71, 120] },
    { t: 0.75, color: [248, 149, 64] },
    { t: 1.0, color: [240, 249, 33] }
  ],
  magma: [
    { t: 0.0, color: [0, 0, 4] },
    { t: 0.25, color: [81, 28, 116] },
    { t: 0.5, color: [183, 55, 121] },
    { t: 0.75, color: [252, 137, 97] },
    { t: 1.0, color: [252, 253, 191] }
  ],
};

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function interpolateColor(value: number, stops: { t: number, color: RGB }[]): RGB {
  // Clamp
  if (value <= 0) return stops[0].color;
  if (value >= 1) return stops[stops.length - 1].color;

  // Find segment
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].t && value <= stops[i+1].t) {
      const t = (value - stops[i].t) / (stops[i+1].t - stops[i].t);
      const c1 = stops[i].color;
      const c2 = stops[i+1].color;
      return [
        Math.floor(lerp(c1[0], c2[0], t)),
        Math.floor(lerp(c1[1], c2[1], t)),
        Math.floor(lerp(c1[2], c2[2], t))
      ];
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
      for(let i=0; i<n; i++) colValues[i] = data[i][c];
      
      // Sort to find percentiles for robust min/max
      colValues.sort((a, b) => a - b);
      
      // Clip 1% outliers from both ends to improve contrast and consistency
      min = colValues[Math.floor(n * 0.01)] ?? colValues[0];
      max = colValues[Math.floor(n * 0.99)] ?? colValues[n - 1];

      if (min === max) {
         min = colValues[0];
         max = colValues[n-1];
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
  return normalized.map(row => {
    if (colormap === 'rgb' && channels >= 3) {
      // Direct RGB mapping (taking first 3 channels)
      return [
        Math.floor(row[0] * 255),
        Math.floor(row[1] * 255),
        Math.floor(row[2] * 255)
      ];
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
