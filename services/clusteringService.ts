

import { ClusterResult, ClusteringConfig, GalleryItem, DistanceMetric, LinkageStep } from '../types';
import { cosineDistance, euclideanDistance, normalizeVector, findElbowIndex } from '../utils/math';

// --- Caching ---
// In a real app, manage this carefully to avoid memory leaks.
// We cache the Distance Matrix and the Linkage Matrix.
let cachedDistMatrix: { dataSignature: string, matrix: Float32Array, size: number, metric: DistanceMetric } | null = null;
let cachedLinkage: { dataSignature: string, steps: LinkageStep[], linkageType: string, metric: DistanceMetric } | null = null;

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function mixHash(hash: number, value: number): number {
    const mixed = Math.imul((hash ^ (value >>> 0)) >>> 0, FNV_PRIME);
    return mixed >>> 0;
}

function hashString(hash: number, value: string): number {
    let h = hash;
    for (let i = 0; i < value.length; i++) {
        h = mixHash(h, value.charCodeAt(i));
    }
    return h;
}

function hashEmbedding(hash: number, embedding: number[]): number {
    let h = mixHash(hash, embedding.length);
    for (let i = 0; i < embedding.length; i++) {
        const v = embedding[i];
        const quantized = Number.isFinite(v) ? Math.round(v * 1e6) : 0;
        h = mixHash(h, quantized);
    }
    return h;
}

function generateDataSignature(items: GalleryItem[], normalize: boolean): string {
    let hash = mixHash(FNV_OFFSET_BASIS, items.length);
    hash = mixHash(hash, normalize ? 1 : 0);
    for (const item of items) {
        hash = hashString(hash, item.id);
        const embedding = item.result?.embedding || [];
        hash = hashEmbedding(hash, embedding);
    }
    return `${items.length}:${hash.toString(16)}`;
}

export async function runClustering(
  items: GalleryItem[],
  config: ClusteringConfig
): Promise<ClusterResult> {
  // 1. Prepare Data
  const validItems = items.filter(i => i.result && i.result.embedding && i.enabled !== false);
  if (validItems.length === 0) {
    return { labels: new Map(), clusterCount: 0, noiseCount: 0 };
  }

  let vectors = validItems.map(i => i.result!.embedding);
  if (config.normalize) {
    vectors = vectors.map(v => normalizeVector(v));
  }
  
  const distFn = config.metric === 'COSINE' ? cosineDistance : euclideanDistance;
  const dataSignature = generateDataSignature(validItems, config.normalize);

  // 2. Execute Algorithm
  let labels: number[] = [];
  let linkageOut: LinkageStep[] | undefined = undefined;

  // Tiny delay to unblock UI
  await new Promise(r => setTimeout(r, 10));

  switch (config.algorithm) {
    case 'KMEANS':
      labels = kMeans(vectors, config.k, config.maxIter, distFn);
      break;
    
    case 'AGGLOMERATIVE': {
      // Check Cache or Compute Linkage
      let linkage: LinkageStep[];
      
      // We assume if dataset hash + metric + linkage type match, we can reuse linkage
      if (
        cachedLinkage &&
        cachedLinkage.dataSignature === dataSignature &&
        cachedLinkage.metric === config.metric &&
        cachedLinkage.linkageType === config.linkage
      ) {
        linkage = cachedLinkage.steps;
      } else {
        // We might need the distance matrix first
        let distMatrix: Float32Array;
        
        if (
          cachedDistMatrix &&
          cachedDistMatrix.dataSignature === dataSignature &&
          cachedDistMatrix.metric === config.metric
        ) {
           distMatrix = cachedDistMatrix.matrix;
        } else {
           distMatrix = computeDistanceMatrix(vectors, distFn);
           cachedDistMatrix = { dataSignature, matrix: distMatrix, size: vectors.length, metric: config.metric };
        }

        linkage = computeLinkageMatrix(distMatrix, vectors.length, config.linkage);
        cachedLinkage = { dataSignature, steps: linkage, linkageType: config.linkage, metric: config.metric };
      }

      linkageOut = linkage;
      // Cut the tree
      labels = getLabelsFromLinkage(linkage, vectors.length, config.nClusters, config.distanceThreshold);
      break;
    }

    case 'HDBSCAN':
      labels = dbscan(vectors, config.minSamples, config.epsilon, distFn, config.minClusterSize); 
      break;
      
    case 'BIRCH':
      labels = birchClustering(vectors, config.birchThreshold, config.birchBranching, config.nClusters, distFn);
      break;
  }

  // --- Post-Process: Enforce Min Cluster Size (Global) ---
  // Any cluster with fewer items than minClusterSize (default 2) is marked as noise (-1).
  const effectiveMinSize = config.minClusterSize !== undefined ? config.minClusterSize : 2;
  labels = applyMinClusterSize(labels, effectiveMinSize);

  // 3. Map back to IDs
  const labelMap = new Map<string, number>();
  let maxLabel = -1;
  let noiseCount = 0;

  validItems.forEach((item, idx) => {
    const label = labels[idx];
    labelMap.set(item.id, label);
    if (label > maxLabel) maxLabel = label;
    if (label === -1) noiseCount++;
  });

  return {
    labels: labelMap,
    clusterCount: maxLabel + 1,
    noiseCount,
    linkage: linkageOut
  };
}

/**
 * Robust Auto-Tuning
 */
export async function suggestConfig(
  items: GalleryItem[],
  currentConfig: ClusteringConfig,
  onProgress?: (progress: number, msg: string) => void
): Promise<Partial<ClusteringConfig>> {
   const validItems = items.filter(i => i.result && i.result.embedding && i.enabled !== false);
   if (validItems.length < 5) return {};

   let vectors = validItems.map(i => i.result!.embedding);
   if (currentConfig.normalize) vectors = vectors.map(v => normalizeVector(v));
   
   const distFn = currentConfig.metric === 'COSINE' ? cosineDistance : euclideanDistance;
   const effectiveMinSize = currentConfig.minClusterSize !== undefined ? currentConfig.minClusterSize : 2;
   
   // --- AGGLOMERATIVE TUNING (Silhouette Based) ---
   if (currentConfig.algorithm === 'AGGLOMERATIVE') {
      const dataSignature = generateDataSignature(validItems, currentConfig.normalize);
      onProgress?.(10, 'Computing Distance Matrix...');
      
      // 1. Get/Compute Distance Matrix
      let distMatrix: Float32Array;
      if (
        cachedDistMatrix &&
        cachedDistMatrix.dataSignature === dataSignature &&
        cachedDistMatrix.metric === currentConfig.metric
      ) {
         distMatrix = cachedDistMatrix.matrix;
      } else {
         distMatrix = computeDistanceMatrix(vectors, distFn);
         cachedDistMatrix = { dataSignature, matrix: distMatrix, size: vectors.length, metric: currentConfig.metric };
      }

      onProgress?.(30, 'Building Hierarchy...');
      await new Promise(r => setTimeout(r, 0)); // Yield

      // 2. Get/Compute Linkage
      let linkage: LinkageStep[];
      if (
        cachedLinkage &&
        cachedLinkage.dataSignature === dataSignature &&
        cachedLinkage.metric === currentConfig.metric &&
        cachedLinkage.linkageType === currentConfig.linkage
      ) {
        linkage = cachedLinkage.steps;
      } else {
        linkage = computeLinkageMatrix(distMatrix, vectors.length, currentConfig.linkage);
        cachedLinkage = { dataSignature, steps: linkage, linkageType: currentConfig.linkage, metric: currentConfig.metric };
      }

      onProgress?.(50, 'Finding Optimal Cut Point...');
      
      // 3. Adaptive split search:
      //    - coarse pass scans a wide K range
      //    - refine pass scans around the best coarse K
      // This avoids hard-capping at K<=9 while keeping runtime practical.
      const n = vectors.length;
      const maxK = Math.max(2, n - 1);

      const targetSamples = Math.max(12, Math.min(maxK - 1, Math.round(Math.sqrt(n) * 6)));
      const coarseStride = Math.max(1, Math.floor((maxK - 1) / targetSamples));
      const coarseSet = new Set<number>();
      for (let k = 2; k <= maxK; k += coarseStride) coarseSet.add(k);
      coarseSet.add(maxK);
      for (let k = 2; k <= Math.min(maxK, 12); k++) coarseSet.add(k); // dense low-K exploration
      const coarseKs = Array.from(coarseSet).sort((a, b) => a - b);

      let bestScore = -Infinity;
      let bestK = 2;
      let bestDist = getThresholdForClusterCount(linkage, 2);

      const scoreCache = new Map<number, { score: number, effectiveK: number }>();
      const evaluateK = (k: number): { score: number, effectiveK: number } => {
          const cached = scoreCache.get(k);
          if (cached) return cached;

          const rawLabels = getLabelsFromLinkage(linkage, n, k, undefined);
          const adjustedLabels = applyMinClusterSize(rawLabels, effectiveMinSize);
          const effectiveK = getMaxLabel(adjustedLabels) + 1;
          const score = computeSilhouetteFromMatrix(distMatrix, n, adjustedLabels, effectiveK);
          const result = { score, effectiveK };
          scoreCache.set(k, result);
          return result;
      };

      for (let i = 0; i < coarseKs.length; i++) {
         const k = coarseKs[i];
         const { score, effectiveK } = evaluateK(k);

         // >= prefers deeper cuts on ties, matching interactive exploration.
         if (score > bestScore || (score === bestScore && k >= bestK)) {
             bestScore = score;
             bestK = k;
             const splitStepIndex = n - k;
             const splitDistance = linkage[splitStepIndex]?.distance ?? Infinity;
             bestDist = getThresholdFromSplitDistance(linkage, splitDistance, k);
         }

         if (onProgress) {
             const percent = 50 + Math.floor(((i + 1) / coarseKs.length) * 35);
             onProgress(percent, `Coarse K=${k} (effective=${effectiveK}, score=${score.toFixed(3)})`);
             await new Promise(r => setTimeout(r, 0)); // Yield UI
         }
      }

      const refineRadius = Math.max(4, coarseStride * 2);
      const refineStart = Math.max(2, bestK - refineRadius);
      const refineEnd = Math.min(maxK, bestK + refineRadius);
      const refineKs: number[] = [];
      for (let k = refineStart; k <= refineEnd; k++) {
          if (!coarseSet.has(k)) refineKs.push(k);
      }

      for (let i = 0; i < refineKs.length; i++) {
         const k = refineKs[i];
         const { score, effectiveK } = evaluateK(k);

         if (score > bestScore || (score === bestScore && k >= bestK)) {
             bestScore = score;
             bestK = k;
             const splitStepIndex = n - k;
             const splitDistance = linkage[splitStepIndex]?.distance ?? Infinity;
             bestDist = getThresholdFromSplitDistance(linkage, splitDistance, k);
         }

         if (onProgress) {
             const percent = 85 + Math.floor(((i + 1) / Math.max(1, refineKs.length)) * 15);
             onProgress(percent, `Refine K=${k} (effective=${effectiveK}, score=${score.toFixed(3)})`);
             await new Promise(r => setTimeout(r, 0)); // Yield UI
         }
      }
      
      onProgress?.(100, `Optimal cut ≈ K=${bestK}`);
      return { distanceThreshold: bestDist, nClusters: undefined };
   }

   // --- KMEANS TUNING (Simplified) ---
   if (currentConfig.algorithm === 'KMEANS') {
      const maxK = Math.min(Math.floor(Math.sqrt(vectors.length)) + 2, 10);
      let bestK = 2;
      let bestScore = -1;
      for(let k=2; k<=maxK; k++) {
         if (onProgress) onProgress(Math.floor((k/maxK)*100), `Testing K=${k}`);
         const labels = kMeans(vectors, k, 5, distFn);
         const score = computeSimplifiedSilhouette(vectors, labels, k, distFn);
         if (score > bestScore) {
            bestScore = score;
            bestK = k;
         }
         await new Promise(r => setTimeout(r, 0));
      }
      return { k: bestK };
   }

   // --- HDBSCAN TUNING ---
   if (currentConfig.algorithm === 'HDBSCAN') {
       if (onProgress) onProgress(50, 'Analyzing Density...');
        const minPts = Math.max(2, Math.floor(Math.log(vectors.length)));
        const kDistances = [];
        const limit = 500;
        const step = Math.max(1, Math.floor(vectors.length / limit));
        for(let i=0; i<vectors.length; i+=step) {
            const dists = [];
            for(let j=0; j<vectors.length; j+=step) {
                if(i===j) continue;
                dists.push(distFn(vectors[i], vectors[j]));
            }
            dists.sort((a,b) => a-b);
            if(dists.length >= minPts) {
                kDistances.push(dists[minPts-1]);
            }
        }
        kDistances.sort((a,b) => a-b);
        const elbowIdx = findElbowIndex(kDistances);
        const suggestedEps = kDistances[elbowIdx] || 0.5;
        const finalEps = Math.round(suggestedEps * 100) / 100;

        return { 
            minSamples: minPts, 
            minClusterSize: minPts,
            epsilon: finalEps > 0 ? finalEps : 0.1 
        };
   }

   return {};
}

// --- Helpers for UI Interaction ---

export function getClusterCountFromThreshold(linkage: LinkageStep[], threshold: number): number {
    const n = linkage.length + 1;
    let merges = 0;
    for(const step of linkage) {
        if (step.distance <= threshold) merges++;
    }
    return Math.max(1, n - merges);
}

export function getThresholdForClusterCount(linkage: LinkageStep[], targetK: number): number {
    const n = linkage.length + 1;
    if (targetK >= n) return 0;
    if (targetK <= 1) {
        if (linkage.length === 0) return 1.0;
        return linkage[linkage.length - 1].distance + 0.01; 
    }
    const lastMergeIndex = (n - targetK) - 1;
    if (lastMergeIndex < 0) return 0;
    if (lastMergeIndex >= linkage.length) return linkage[linkage.length-1].distance + 0.01;

    return linkage[lastMergeIndex].distance;
}

function getThresholdFromSplitDistance(linkage: LinkageStep[], splitDistance: number, targetK: number): number {
    if (!Number.isFinite(splitDistance)) {
        return getThresholdForClusterCount(linkage, targetK);
    }

    // The cut UI merges while distance <= threshold.
    // A split at height H therefore maps to a threshold just below H.
    const epsilon = Math.max(1e-6, Math.abs(splitDistance) * 1e-6);
    const nudged = Math.max(0, splitDistance - epsilon);

    // If tied merge heights make this unstable, fall back to the exact K mapping.
    const projectedK = getClusterCountFromThreshold(linkage, nudged);
    if (projectedK !== targetK) {
        return getThresholdForClusterCount(linkage, targetK);
    }
    return nudged;
}

function getMaxLabel(labels: number[]): number {
    let maxLabel = -1;
    for (const label of labels) {
        if (label > maxLabel) maxLabel = label;
    }
    return maxLabel;
}

function applyMinClusterSize(labels: number[], minClusterSize: number): number[] {
    const adjusted = labels.slice();

    if (minClusterSize > 1) {
        const counts = new Map<number, number>();
        for (const label of adjusted) {
            if (label === -1) continue;
            counts.set(label, (counts.get(label) || 0) + 1);
        }

        const smallClusters = new Set<number>();
        for (const [label, count] of counts.entries()) {
            if (count < minClusterSize) smallClusters.add(label);
        }

        if (smallClusters.size > 0) {
            for (let i = 0; i < adjusted.length; i++) {
                if (smallClusters.has(adjusted[i])) adjusted[i] = -1;
            }
        }
    }

    // Re-normalize IDs to be consecutive 0..N while preserving -1 as noise.
    const normalized = adjusted.slice();
    const oldToNew = new Map<number, number>();
    let nextId = 0;
    const validLabels = Array.from(new Set(normalized.filter(l => l !== -1))).sort((a, b) => a - b);
    for (const label of validLabels) oldToNew.set(label, nextId++);
    for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] !== -1) normalized[i] = oldToNew.get(normalized[i])!;
    }
    return normalized;
}

// --- Helper: Matrix & Linkage Calculations ---

function computeDistanceMatrix(vectors: number[][], distFn: (a: number[], b: number[]) => number): Float32Array {
    const n = vectors.length;
    const size = (n * (n - 1)) / 2;
    const matrix = new Float32Array(size);
    let k = 0;
    for(let i=0; i<n; i++) {
        for(let j=i+1; j<n; j++) {
            matrix[k++] = distFn(vectors[i], vectors[j]);
        }
    }
    return matrix;
}

function getDist(matrix: Float32Array, n: number, i: number, j: number): number {
    if (i === j) return 0;
    if (i > j) { let temp = i; i = j; j = temp; }
    const k = (i * n - (i * (i + 1)) / 2) + (j - i - 1);
    return matrix[k];
}

function computeLinkageMatrix(distMatrix: Float32Array, n: number, method: string): LinkageStep[] {
    const clusters = new Array(n).fill(0).map((_, i) => ({ id: i, size: 1, active: true }));
    const steps: LinkageStep[] = [];
    const D = new Float32Array(n * n);
    for(let i=0; i<n; i++) {
        for(let j=i+1; j<n; j++) {
            const d = getDist(distMatrix, n, i, j);
            D[i*n + j] = d;
            D[j*n + i] = d;
        }
        D[i*n + i] = Infinity; 
    }
    
    const activeIndices = new Set<number>();
    for(let i=0; i<n; i++) activeIndices.add(i);

    let nextClusterId = n;

    for (let step = 0; step < n - 1; step++) {
        let minD = Infinity;
        let c1 = -1;
        let c2 = -1;

        const activeArr = Array.from(activeIndices);
        
        for (let i = 0; i < activeArr.length; i++) {
            const u = activeArr[i];
            for (let j = i + 1; j < activeArr.length; j++) {
                const v = activeArr[j];
                const d = D[u * n + v];
                if (d < minD) {
                    minD = d;
                    c1 = u;
                    c2 = v;
                }
            }
        }

        if (c1 === -1) break; 

        const logicalId1 = clusters[c1].id;
        const logicalId2 = clusters[c2].id;
        const size1 = clusters[c1].size;
        const size2 = clusters[c2].size;
        
        steps.push({
            clusterA: logicalId1,
            clusterB: logicalId2,
            distance: minD,
            size: size1 + size2,
            newClusterId: nextClusterId
        });
        
        for (const k of activeIndices) {
            if (k === c1 || k === c2) continue;
            const d1 = D[c1 * n + k];
            const d2 = D[c2 * n + k];
            let newDist = 0;
            if (method === 'COMPLETE') newDist = Math.max(d1, d2);
            else if (method === 'AVERAGE') newDist = (size1 * d1 + size2 * d2) / (size1 + size2);
            else newDist = Math.min(d1, d2);
            
            D[c1 * n + k] = newDist;
            D[k * n + c1] = newDist;
        }

        clusters[c1] = { id: nextClusterId, size: size1 + size2, active: true };
        clusters[c2].active = false;
        activeIndices.delete(c2);
        nextClusterId++;
    }
    return steps;
}

function getLabelsFromLinkage(
    linkage: LinkageStep[], 
    n: number, 
    forcedK: number | undefined, 
    threshold: number | undefined
): number[] {
    const parent = new Array(n + linkage.length).fill(0).map((_, i) => i);
    function find(i: number): number {
        if (parent[i] === i) return i;
        parent[i] = find(parent[i]);
        return parent[i];
    }
    
    for(let i=0; i<linkage.length; i++) {
        const step = linkage[i];
        let shouldMerge = true;
        if (forcedK !== undefined) {
             if (i >= n - forcedK) shouldMerge = false;
        } else if (threshold !== undefined) {
             if (step.distance > threshold) shouldMerge = false;
        }
        if (!shouldMerge) break; 
        parent[step.clusterA] = step.newClusterId;
        parent[step.clusterB] = step.newClusterId;
    }
    
    const labels = new Array(n);
    const idMap = new Map<number, number>();
    let nextLabel = 0;
    for(let i=0; i<n; i++) {
        const root = find(i);
        if (!idMap.has(root)) idMap.set(root, nextLabel++);
        labels[i] = idMap.get(root);
    }
    return labels;
}

// --- Silhouette Score Optimized ---

function computeSilhouetteFromMatrix(distMatrix: Float32Array, n: number, labels: number[], k: number): number {
    if (n === 0 || k < 2) return 0;
    const clusterIndices: number[][] = Array.from({length: k}, () => []);
    for(let i=0; i<n; i++) {
        const label = labels[i];
        if (label >= 0 && label < k) clusterIndices[label].push(i);
    }
    let totalScore = 0;
    for(let i=0; i<n; i++) {
        const label = labels[i];
        if (label < 0 || label >= k) continue; // Noise or invalid labels contribute 0.
        const ownCluster = clusterIndices[label];
        if (ownCluster.length < 2) continue; // Singleton clusters contribute 0.
        
        let sumA = 0;
        for(const peer of ownCluster) {
            if (peer === i) continue;
            sumA += getDist(distMatrix, n, i, peer);
        }
        const a = sumA / (ownCluster.length - 1);
        
        let minB = Infinity;
        for(let c=0; c<k; c++) {
            if (c === label) continue;
            const otherCluster = clusterIndices[c];
            if (otherCluster.length === 0) continue;
            let sumB = 0;
            for(const peer of otherCluster) {
                sumB += getDist(distMatrix, n, i, peer);
            }
            const b = sumB / otherCluster.length;
            if (b < minB) minB = b;
        }
        let s = 0;
        if (minB === Infinity) s = 0; 
        else s = (minB - a) / Math.max(a, minB);
        totalScore += s;
    }
    return totalScore / n;
}

function computeSimplifiedSilhouette(vectors: number[][], labels: number[], k: number, distFn: any): number {
   const centroids: number[][] = [];
   const counts = new Array(k).fill(0);
   for(let i=0; i<k; i++) centroids.push(new Array(vectors[0].length).fill(0));
   for(let i=0; i<vectors.length; i++) {
      const l = labels[i];
      if(l === -1) continue;
      counts[l]++;
      for(let d=0; d<vectors[0].length; d++) centroids[l][d] += vectors[i][d];
   }
   for(let i=0; i<k; i++) if(counts[i] > 0) for(let d=0; d<vectors[0].length; d++) centroids[i][d] /= counts[i];
   
   let totalScore = 0;
   let validPoints = 0;
   for(let i=0; i<vectors.length; i++) {
      const l = labels[i];
      if (l === -1) continue;
      const a = distFn(vectors[i], centroids[l]);
      let b = Infinity;
      for(let c=0; c<k; c++) {
         if (c === l) continue;
         const d = distFn(vectors[i], centroids[c]);
         if (d < b) b = d;
      }
      if (b === 0 && a === 0) totalScore += 0;
      else totalScore += (b - a) / Math.max(a, b);
      validPoints++;
   }
   return validPoints > 0 ? totalScore / validPoints : -1;
}

function kMeans(data: number[][], k: number, maxIter: number, distFn: (a: number[], b: number[]) => number): number[] {
  const n = data.length;
  if (n === 0) return [];
  if (k >= n) return data.map((_, i) => i);
  let centroids: number[][] = [];
  const indices = new Set<number>();
  while(indices.size < k) indices.add(Math.floor(Math.random() * n));
  centroids = Array.from(indices).map(i => [...data[i]]);
  let assignments = new Array(n).fill(-1);
  let changed = true;
  let iter = 0;
  while (changed && iter < maxIter) {
    changed = false;
    iter++;
    for (let i = 0; i < n; i++) {
      let minDist = Infinity;
      let bestCluster = 0;
      for (let c = 0; c < k; c++) {
        const d = distFn(data[i], centroids[c]);
        if (d < minDist) { minDist = d; bestCluster = c; }
      }
      if (assignments[i] !== bestCluster) { assignments[i] = bestCluster; changed = true; }
    }
    const newCentroids = Array(k).fill(0).map(() => new Array(data[0].length).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      for (let d = 0; d < data[0].length; d++) { newCentroids[c][d] += data[i][d]; }
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < data[0].length; d++) { centroids[c][d] = newCentroids[c][d] / counts[c]; }
      } else {
        const randomIdx = Math.floor(Math.random() * n);
        centroids[c] = [...data[randomIdx]];
      }
    }
  }
  return assignments;
}

function dbscan(data: number[][], minPts: number, eps: number, distFn: (a: number[], b: number[]) => number, minClusterSize: number): number[] {
  const n = data.length;
  const labels = new Array(n).fill(undefined);
  let clusterIdx = -1; 
  const getNeighbors = (idx: number): number[] => {
    const neighbors = [];
    for(let i=0; i<n; i++) {
      if(i === idx) continue;
      if (distFn(data[idx], data[i]) <= eps) neighbors.push(i);
    }
    return neighbors;
  };
  for (let i = 0; i < n; i++) {
    if (labels[i] !== undefined) continue;
    const neighbors = getNeighbors(i);
    if (neighbors.length < minPts) { labels[i] = -1; continue; }
    clusterIdx++;
    labels[i] = clusterIdx;
    let seedSet = [...neighbors];
    for (let j = 0; j < seedSet.length; j++) {
      const currentPt = seedSet[j];
      if (labels[currentPt] === -1) labels[currentPt] = clusterIdx; 
      if (labels[currentPt] !== undefined) continue; 
      labels[currentPt] = clusterIdx;
      const currentNeighbors = getNeighbors(currentPt);
      if (currentNeighbors.length >= minPts) {
         for(const nP of currentNeighbors) if(!seedSet.includes(nP)) seedSet.push(nP);
      }
    }
  }
  
  // Re-map to remove empty IDs if any gaps were created, though standard DBSCAN grows sequentially.
  // Note: minClusterSize is enforced by the global logic in runClustering now, 
  // but keeping it here for algorithmic completeness is fine.
  
  return labels;
}

function birchClustering(data: number[][], threshold: number, branchingFactor: number, nClusters: number | undefined, distFn: (a: number[], b: number[]) => number): number[] {
  // Simple Placeholder Wrapper
  return kMeans(data, nClusters || 5, 10, distFn);
}
