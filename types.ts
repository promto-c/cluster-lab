

export enum ModelSource {
  HUGGINGFACE = 'HUGGINGFACE',
  LOCAL = 'LOCAL',
  CLASSICAL = 'CLASSICAL'
}

export enum AppStep {
  INITIALIZE = 0,
  DATASET = 1,
  EMBED = 2,
  CLUSTER = 3,
  VISUALIZE = 4
}

export type DimReductionMethod = 'raw' | 'pca' | 'umap' | 'tsne';

export enum ResizeMethod {
  STRETCH = 'STRETCH',
  CROP = 'CROP', // Center Crop
  PAD = 'PAD' // Letterbox
}

export enum PadStyle {
  SOLID = 'SOLID',
  BLUR = 'BLUR',
  REFLECT = 'REFLECT'
}

export interface ClassicalFeaturesConfig {
  colorHistogram: boolean;
  lbp: boolean; // Local Binary Patterns
  glcm: boolean; // Texture Statistics
  hog: boolean; // Histogram of Oriented Gradients
}

export interface PreprocessingConfig {
  resizeMethod: ResizeMethod;
  padStyle: PadStyle;
  padColor: string; // Hex code
}

export interface ModelConfig {
  source: ModelSource;
  repoId: string;
  variant: string; // e.g., 'small', 'base', 'large'
  remoteOnnxFile: string; // Selected ONNX filename inside remote onnx/ subfolder
  fileName?: string;
  fileUrl?: string;
  localFiles?: File[]; // Store actual File objects for local loading
  classical?: ClassicalFeaturesConfig; // Config for classical features
  preprocessing: PreprocessingConfig; // Explicit preprocessor settings
}

export interface InferenceResult {
  embedding: number[]; // Global cls token or concatenated feature vector
  patches: number[][]; // Patch embeddings (empty for classical)
  attention?: number[][]; // Optional attention map
  dimensions: {
    width: number;
    height: number;
    patchSize: number;
  };
}

export type ProcessingStatus = 'idle' | 'loading_model' | 'processing' | 'ready' | 'error' | 'batch_processing' | 'clustering';

export interface LogEntry {
  timestamp: number;
  message: string;
  type: 'info' | 'error' | 'success';
}

export interface GalleryItem {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string; // Optimized display image
  file: File;
  status: 'idle' | 'processing' | 'cached' | 'error';
  result?: InferenceResult;
  clusterLabel?: number; // -1 for noise (Current Level)
  clusterPath?: number[]; // Hierarchical path (e.g. [0, 2] means Cluster 0 -> Subcluster 2)
  enabled?: boolean; // Toggle for batch processing inclusion
}

export type ColormapType = 'rgb' | 'viridis' | 'inferno' | 'plasma' | 'magma' | 'grayscale';

export type VisMode = 'pca' | 'channel';

export interface VisSettings {
  mode: VisMode;
  components: 1 | 3;
  channelIndex: number; // 0 to embed_dim-1
  colormap: ColormapType;
  opacity: number; // 0-1
}

// --- Clustering Types ---

export type ClusteringAlgorithm = 'HDBSCAN' | 'KMEANS' | 'AGGLOMERATIVE' | 'BIRCH';
export type DistanceMetric = 'COSINE' | 'EUCLIDEAN';
export type LinkageMethod = 'WARD' | 'AVERAGE' | 'COMPLETE'; // Simplified for this demo

export interface ClusteringConfig {
  algorithm: ClusteringAlgorithm;
  metric: DistanceMetric;
  normalize: boolean;
  
  // HDBSCAN / DBSCAN params
  minClusterSize: number;
  minSamples: number;
  epsilon: number; // For DBSCAN radius
  allowSingleCluster: boolean;
  
  // KMeans params
  k: number;
  init: 'random' | 'k-means++'; // simplified
  maxIter: number;
  
  // Agglomerative params
  linkage: LinkageMethod;
  distanceThreshold: number; // For cutting the tree
  nClusters?: number; // Optional force count
  
  // BIRCH params
  birchThreshold: number;
  birchBranching: number;
}

export interface LinkageStep {
  clusterA: number;
  clusterB: number;
  distance: number;
  size: number;
  newClusterId: number;
}

export interface ClusterResult {
  labels: Map<string, number>; // ImageID -> ClusterID
  clusterCount: number;
  noiseCount: number;
  linkage?: LinkageStep[]; // Return linkage history for visualization
}
