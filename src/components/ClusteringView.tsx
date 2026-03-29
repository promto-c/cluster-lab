import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  GalleryItem,
  ClusteringConfig,
  ClusteringAlgorithm,
  DistanceMetric,
  LinkageMethod,
  LinkageStep,
} from '@/types';
import {
  runClustering,
  suggestConfig,
  getClusterCountFromThreshold,
  getThresholdForClusterCount,
  cutAgglomerativeHierarchy,
} from '@/services/clusteringService';
import Dendrogram from '@/components/Dendrogram';
import Gallery from '@/components/Gallery';
import HeaderBar from '@/components/HeaderBar';
import ClusteringMethodGuide, {
  AlgorithmHelpButton,
  CLUSTERING_ALGORITHM_EYEBROWS,
  CLUSTERING_ALGORITHM_LABELS,
} from '@/components/ClusteringMethodGuide';
import DraggableNumberInput, { DraggableNumberInputProps } from '@/components/DraggableNumberInput';
import {
  RefreshCw,
  Layers,
  AlertCircle,
  HelpCircle,
  Scale,
  ChevronUp,
  ChevronDown,
  SlidersHorizontal,
  Activity,
  Network,
  ChevronRight,
  Home,
  RotateCcw,
} from 'lucide-react';
import useMediaQuery from '@/utils/useMediaQuery';

interface ClusteringViewProps {
  items: GalleryItem[];
  onUpdateItems: (items: GalleryItem[]) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  onLog?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onProgressUpdate?: (
    progress: {
      mode: 'cluster' | 'tune';
      value: number;
      message: string;
    } | null,
  ) => void;
}

interface AgglomerativeHierarchyMeta {
  pathKey: string;
  readyItemsKey: string;
  metric: DistanceMetric;
  normalize: boolean;
  linkage: LinkageMethod;
  itemIds: string[];
}

const getAgglomerativeItemIds = (items: GalleryItem[]): string[] =>
  items.filter((item) => item.result?.embedding && item.enabled !== false).map((item) => item.id);

const applyLabelsAtDepth = (sourceItems: GalleryItem[], labels: Map<string, number>, depth: number): GalleryItem[] =>
  sourceItems.map((item) => {
    if (!labels.has(item.id)) return item;

    const newLabel = labels.get(item.id)!;
    const existingPath = item.clusterPath || [];
    const base = existingPath.slice(0, depth);
    const previousLabelAtDepth = existingPath[depth];
    const suffix = existingPath.slice(depth + 1);
    const preserveSuffix = suffix.length > 0 && previousLabelAtDepth === newLabel;

    return {
      ...item,
      clusterPath: preserveSuffix ? [...base, newLabel, ...suffix] : [...base, newLabel],
      clusterLabel: newLabel,
    };
  });

const DEFAULT_AGGLOMERATIVE_CUT = 0.4;

const ALGORITHM_SEGMENTS: Array<{
  algorithm: ClusteringAlgorithm;
  description: string;
}> = [
  {
    algorithm: 'AGGLOMERATIVE',
    description: 'Best for hierarchy-aware drill-down and dendrogram tuning.',
  },
  {
    algorithm: 'HDBSCAN',
    description: 'Groups dense neighborhoods and naturally leaves sparse noise.',
  },
  {
    algorithm: 'KMEANS',
    description: 'Fast fixed-k partitioning around iterated cluster centers.',
  },
  {
    algorithm: 'BIRCH',
    description: 'Quick prototype mode for lightweight, incremental-style runs.',
  },
];

const SIMPLE_SEGMENTED_CONTROL_FRAME_CLASS = 'bg-gray-950/30 p-1 rounded-lg border border-gray-800';

const getSimpleSegmentButtonClassName = (isActive: boolean, layoutClassName = 'flex-1') =>
  `${layoutClassName} text-[10px] font-bold py-2 rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 ${
    isActive ? 'bg-gray-800 text-white shadow-sm border border-gray-700' : 'text-gray-500 hover:text-gray-300'
  }`;

// Breadcrumb Separator with Dropdown
const BreadcrumbSeparator: React.FC<{
  depth: number;
  parentPath: number[];
  items: GalleryItem[];
  onSelect: (clusterId: number) => void;
  isMobile?: boolean;
}> = ({ depth, parentPath, items, onSelect, isMobile = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Find siblings available at this level given the parent path
  const siblings = useMemo(() => {
    const available = new Set<number>();
    items.forEach((item) => {
      // Must match parent path prefix
      if (!item.clusterPath || item.clusterPath.length <= depth) return;
      let match = true;
      for (let i = 0; i < parentPath.length; i++) {
        if (item.clusterPath[i] !== parentPath[i]) {
          match = false;
          break;
        }
      }
      if (match) {
        available.add(item.clusterPath[depth]);
      }
    });
    return Array.from(available).sort((a, b) => a - b);
  }, [items, parentPath, depth]);

  if (siblings.length === 0) return <ChevronRight className="w-3 h-3 opacity-30" />;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={!isMobile ? () => setIsOpen(true) : undefined}
      onMouseLeave={!isMobile ? () => setIsOpen(false) : undefined}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`p-0.5 rounded cursor-pointer transition-colors ${isOpen ? 'bg-accent-500/20 text-accent-400' : 'text-gray-600 hover:text-gray-400'}`}
        aria-label="Open sibling cluster menu"
      >
        <ChevronRight className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
          <div className="px-2 py-1 text-[9px] font-bold text-gray-500 uppercase border-b border-gray-800 mb-1">
            Select Sibling
          </div>
          <div className="max-h-40 overflow-y-auto scrollbar-thin">
            {siblings.map((id) => (
              <button
                key={id}
                onClick={() => {
                  onSelect(id);
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[10px] text-gray-300 hover:bg-gray-800 hover:text-white flex items-center gap-2"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${id === -1 ? 'bg-red-500' : 'bg-accent-500'}`}></span>
                {id === -1 ? 'Noise' : `Cluster ${id}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface LabeledNumberControlProps {
  label: string;
  inputProps: DraggableNumberInputProps;
  labelElement?: 'label' | 'span';
  containerClassName?: string;
  labelClassName?: string;
  controlWrapperClassName?: string;
  overlay?: React.ReactNode;
}

type NumberControlDescriptor = {
  key: string;
  label: string;
  inputProps: DraggableNumberInputProps;
  controlWrapperClassName?: string;
  overlay?: React.ReactNode;
};

interface AlgorithmQuickControlsProps {
  config: ClusteringConfig;
  projectedK: number | null;
  linkageData: LinkageStep[] | null;
  onConfigChange: (nextConfig: ClusteringConfig) => void;
  onClusterCountChange: (newK: number) => void;
}

interface AlgorithmParameterGridProps {
  config: ClusteringConfig;
  projectedK: number | null;
  linkageData: LinkageStep[] | null;
  onConfigChange: (nextConfig: ClusteringConfig) => void;
  onClusterCountChange: (newK: number) => void;
}

const LabeledNumberControl: React.FC<LabeledNumberControlProps> = ({
  label,
  inputProps,
  labelElement = 'label',
  containerClassName = 'space-y-1',
  labelClassName = 'text-[10px] font-bold text-gray-500 uppercase',
  controlWrapperClassName,
  overlay,
}) => {
  const LabelTag = labelElement;
  const control = <DraggableNumberInput {...inputProps} />;

  return (
    <div className={containerClassName}>
      <LabelTag className={labelClassName}>{label}</LabelTag>
      {controlWrapperClassName || overlay ? (
        <div className={controlWrapperClassName}>
          {control}
          {overlay}
        </div>
      ) : (
        control
      )}
    </div>
  );
};

const AlgorithmQuickControls: React.FC<AlgorithmQuickControlsProps> = ({
  config,
  projectedK,
  linkageData,
  onConfigChange,
  onClusterCountChange,
}) => {
  const controls: NumberControlDescriptor[] = [];

  if (config.algorithm === 'KMEANS') {
    controls.push({
      key: 'quick-kmeans-k',
      label: 'K',
      inputProps: {
        value: config.k,
        onChange: (next) => onConfigChange({ ...config, k: next }),
        min: 2,
        step: 1,
        integer: true,
        className: 'w-[4.5rem]',
        inputClassName: 'px-1.5 py-0.5 text-xs text-center',
        handleClassName: 'w-5',
        ariaLabel: 'Number of clusters',
        title: 'Number of clusters',
      },
    });
  }

  if (config.algorithm === 'HDBSCAN') {
    controls.push({
      key: 'quick-hdbscan-min-cluster-size',
      label: 'Min Size',
      inputProps: {
        value: config.minClusterSize,
        onChange: (next) => onConfigChange({ ...config, minClusterSize: next }),
        min: 2,
        step: 1,
        integer: true,
        className: 'w-[4.5rem]',
        inputClassName: 'px-1.5 py-0.5 text-xs text-center',
        handleClassName: 'w-5',
        ariaLabel: 'Minimum cluster size',
        title: 'Minimum cluster size',
      },
    });
  }

  if (config.algorithm === 'AGGLOMERATIVE') {
    controls.push(
      {
        key: 'quick-agglomerative-distance-threshold',
        label: 'Cut Dist',
        inputProps: {
          value: config.distanceThreshold,
          onChange: (next) =>
            onConfigChange({
              ...config,
              distanceThreshold: next,
              nClusters: undefined,
            }),
          min: 0,
          step: 0.05,
          className: 'w-[5.5rem]',
          inputClassName: 'px-1.5 py-0.5 text-xs text-center',
          handleClassName: 'w-5',
          ariaLabel: 'Distance threshold',
          title: 'Distance Threshold',
        },
      },
      {
        key: 'quick-agglomerative-projected-k',
        label: 'Est. K',
        controlWrapperClassName: 'relative',
        overlay: !linkageData ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-600 font-bold text-[10px]">
            ?
          </div>
        ) : undefined,
        inputProps: {
          value: projectedK ?? 1,
          disabled: !linkageData,
          onChange: (next) => onClusterCountChange(next),
          min: 1,
          step: 1,
          integer: true,
          className: `w-[4.5rem] ${!linkageData ? 'opacity-50' : ''}`,
          inputClassName: 'px-1.5 py-0.5 text-xs text-center',
          handleClassName: 'w-5',
          ariaLabel: 'Estimated cluster count',
          title: 'Estimated Cluster Count',
        },
      },
    );
  }

  return (
    <>
      {controls.map((control) => (
        <LabeledNumberControl
          key={control.key}
          label={control.label}
          inputProps={control.inputProps}
          labelElement="span"
          containerClassName="flex items-center gap-2 shrink-0"
          labelClassName="text-[10px] font-bold text-gray-500 uppercase"
          controlWrapperClassName={control.controlWrapperClassName}
          overlay={control.overlay}
        />
      ))}
    </>
  );
};

const AlgorithmParameterGrid: React.FC<AlgorithmParameterGridProps> = ({
  config,
  projectedK,
  linkageData,
  onConfigChange,
  onClusterCountChange,
}) => {
  if (config.algorithm === 'AGGLOMERATIVE') {
    const controls: NumberControlDescriptor[] = [
      {
        key: 'grid-agglomerative-distance-threshold',
        label: 'Cut Distance',
        inputProps: {
          value: config.distanceThreshold,
          onChange: (next) =>
            onConfigChange({
              ...config,
              distanceThreshold: next,
              nClusters: undefined,
            }),
          min: 0,
          step: 0.01,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'Agglomerative cut distance',
        },
      },
      {
        key: 'grid-agglomerative-projected-k',
        label: 'Est. Clusters',
        controlWrapperClassName: 'relative',
        overlay: !linkageData ? (
          <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-600 pointer-events-none">
            Run to calc
          </div>
        ) : undefined,
        inputProps: {
          value: projectedK ?? 1,
          disabled: !linkageData,
          onChange: (next) => onClusterCountChange(next),
          min: 1,
          step: 1,
          integer: true,
          className: `w-full ${!linkageData ? 'opacity-50' : ''}`,
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'Estimated clusters',
        },
      },
    ];

    return (
      <>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Linkage Method</label>
          <select
            value={config.linkage}
            onChange={(e) =>
              onConfigChange({
                ...config,
                linkage: e.target.value as LinkageMethod,
              })
            }
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 focus:border-accent-500 outline-none transition-colors"
          >
            <option value="AVERAGE">Average</option>
            <option value="COMPLETE">Complete</option>
          </select>
        </div>
        <div className="col-span-1 sm:col-span-2 grid grid-cols-2 gap-4">
          {controls.map((control) => (
            <LabeledNumberControl
              key={control.key}
              label={control.label}
              inputProps={control.inputProps}
              containerClassName="space-y-1"
              labelClassName="text-[10px] font-bold text-gray-500 uppercase"
              controlWrapperClassName={control.controlWrapperClassName}
              overlay={control.overlay}
            />
          ))}
        </div>
      </>
    );
  }

  let controls: NumberControlDescriptor[] = [];

  if (config.algorithm === 'HDBSCAN') {
    controls = [
      {
        key: 'grid-hdbscan-epsilon',
        label: 'Epsilon (Radius)',
        inputProps: {
          value: config.epsilon,
          onChange: (next) => onConfigChange({ ...config, epsilon: next }),
          min: 0,
          step: 0.05,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'HDBSCAN epsilon radius',
        },
      },
      {
        key: 'grid-hdbscan-min-cluster-size',
        label: 'Min Cluster Size',
        inputProps: {
          value: config.minClusterSize,
          onChange: (next) => onConfigChange({ ...config, minClusterSize: next }),
          min: 2,
          step: 1,
          integer: true,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'HDBSCAN minimum cluster size',
        },
      },
    ];
  }

  if (config.algorithm === 'KMEANS') {
    controls = [
      {
        key: 'grid-kmeans-k',
        label: 'K (Clusters)',
        inputProps: {
          value: config.k,
          onChange: (next) => onConfigChange({ ...config, k: next }),
          min: 2,
          step: 1,
          integer: true,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'K-means clusters',
        },
      },
      {
        key: 'grid-kmeans-max-iter',
        label: 'Max Iterations',
        inputProps: {
          value: config.maxIter,
          onChange: (next) => onConfigChange({ ...config, maxIter: next }),
          min: 1,
          step: 1,
          integer: true,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'K-means max iterations',
        },
      },
    ];
  }

  if (config.algorithm === 'BIRCH') {
    controls = [
      {
        key: 'grid-birch-threshold',
        label: 'Radius Threshold',
        inputProps: {
          value: config.birchThreshold,
          onChange: (next) => onConfigChange({ ...config, birchThreshold: next }),
          min: 0,
          step: 0.05,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'BIRCH radius threshold',
        },
      },
      {
        key: 'grid-birch-branching',
        label: 'Branching Factor',
        inputProps: {
          value: config.birchBranching,
          onChange: (next) => onConfigChange({ ...config, birchBranching: next }),
          min: 1,
          step: 1,
          integer: true,
          className: 'w-full',
          inputClassName: 'p-2 text-sm',
          ariaLabel: 'BIRCH branching factor',
        },
      },
    ];
  }

  return (
    <>
      {controls.map((control) => (
        <LabeledNumberControl
          key={control.key}
          label={control.label}
          inputProps={control.inputProps}
          containerClassName="space-y-1"
          labelClassName="text-[10px] font-bold text-gray-500 uppercase"
          controlWrapperClassName={control.controlWrapperClassName}
          overlay={control.overlay}
        />
      ))}
    </>
  );
};

const ClusteringView: React.FC<ClusteringViewProps> = ({
  items,
  onUpdateItems,
  isProcessing,
  setIsProcessing,
  onLog,
  onProgressUpdate,
}) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [showConfig, setShowConfig] = useState(false);
  const [showMobileQuickControls, setShowMobileQuickControls] = useState(false);
  const [showAlgorithmHelp, setShowAlgorithmHelp] = useState(false);

  // Default Config
  const defaultConfig: ClusteringConfig = {
    algorithm: 'AGGLOMERATIVE',
    metric: 'COSINE',
    normalize: true,
    minClusterSize: 2,
    minSamples: 2,
    epsilon: 0.25,
    allowSingleCluster: false,
    k: 5,
    init: 'random',
    maxIter: 300,
    linkage: 'AVERAGE',
    distanceThreshold: DEFAULT_AGGLOMERATIVE_CUT,
    birchThreshold: 0.5,
    birchBranching: 50,
  };

  const [config, setConfig] = useState<ClusteringConfig>(defaultConfig);
  // Cache for config at each path level: Key = path.join(',')
  const [configCache, setConfigCache] = useState<Record<string, ClusteringConfig>>({
    '': defaultConfig,
  });
  const currentAlgorithmLabel = CLUSTERING_ALGORITHM_LABELS[config.algorithm];
  const currentAlgorithmEyebrow = CLUSTERING_ALGORITHM_EYEBROWS[config.algorithm];

  const [stats, setStats] = useState<{
    clusters: number;
    noise: number;
  } | null>(null);
  const [linkageData, setLinkageData] = useState<LinkageStep[] | null>(null);
  const [projectedK, setProjectedK] = useState<number | null>(null);
  // Per-path signature of the last successful clustering run.
  const lastRunSignatureByPath = useRef<Record<string, string>>({});
  const agglomerativeHierarchyMeta = useRef<AgglomerativeHierarchyMeta | null>(null);
  const clusteredContexts = useRef<Set<string>>(new Set());

  // Keep track of which paths have been auto-tuned in this session
  const visitedPaths = useRef<Set<string>>(new Set());

  // Update projectedK when config or linkage changes
  useEffect(() => {
    if (linkageData) {
      const k = getClusterCountFromThreshold(linkageData, config.distanceThreshold);
      setProjectedK(k);
    } else {
      setProjectedK(null);
    }
  }, [linkageData, config.distanceThreshold]);

  const handleClusterCountChange = (newK: number) => {
    if (!linkageData) return;
    const n = linkageData.length + 1;
    // Clamp
    const k = Math.max(1, Math.min(n, newK));
    const newThreshold = getThresholdForClusterCount(linkageData, k);

    setConfig({
      ...config,
      distanceThreshold: newThreshold,
      nClusters: undefined,
    });
  };

  // Drill Down State
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [recentPath, setRecentPath] = useState<number[]>([]);

  // Dummy selection state for Gallery
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);

  const [tuningState, setTuningState] = useState<{
    active: boolean;
    progress: number;
    message: string;
  }>({
    active: false,
    progress: 0,
    message: '',
  });

  const handleAlgorithmSelect = (algorithm: ClusteringAlgorithm) => {
    setConfig((prev) => ({ ...prev, algorithm }));
  };

  useEffect(() => {
    if (isMobile) return;
    setShowMobileQuickControls(false);
  }, [isMobile]);

  useEffect(() => {
    if (!showConfig) return;
    setShowMobileQuickControls(false);
  }, [showConfig]);

  const updateProgress = (mode: 'cluster' | 'tune', value: number, message: string) => {
    onProgressUpdate?.({
      mode,
      value: Math.max(0, Math.min(100, Math.round(value))),
      message,
    });
  };

  const summarizeSuggestion = (suggestion: Partial<ClusteringConfig>): string => {
    const parts: string[] = [];
    if (suggestion.distanceThreshold !== undefined)
      parts.push(`distanceThreshold=${suggestion.distanceThreshold.toFixed(4)}`);
    if (suggestion.nClusters !== undefined) parts.push(`nClusters=${suggestion.nClusters}`);
    if (suggestion.k !== undefined) parts.push(`k=${suggestion.k}`);
    if (suggestion.epsilon !== undefined) parts.push(`epsilon=${suggestion.epsilon.toFixed(3)}`);
    if (suggestion.minSamples !== undefined) parts.push(`minSamples=${suggestion.minSamples}`);
    if (suggestion.minClusterSize !== undefined) parts.push(`minClusterSize=${suggestion.minClusterSize}`);
    return parts.length > 0 ? parts.join(', ') : 'no parameter changes';
  };

  const supportsOptimization = (algorithm: ClusteringAlgorithm) =>
    algorithm === 'AGGLOMERATIVE' || algorithm === 'KMEANS' || algorithm === 'HDBSCAN';

  // Filter items based on current path
  const activeItems = useMemo(() => {
    if (currentPath.length === 0) return items;
    return items.filter((item) => {
      // Check if item's path starts with currentPath
      if (!item.clusterPath || item.clusterPath.length < currentPath.length) return false;
      for (let i = 0; i < currentPath.length; i++) {
        if (item.clusterPath[i] !== currentPath[i]) return false;
      }
      return true;
    });
  }, [items, currentPath]);

  const readyItems = activeItems.filter((i) => i.status === 'cached' && i.enabled !== false);
  const readyCount = readyItems.length;
  const readyItemsKey = useMemo(() => {
    // Include embedding content so auto-run reacts to vector updates, not only item IDs.
    let hash = 0x811c9dc5;
    const mix = (value: number) => {
      hash = Math.imul((hash ^ (value >>> 0)) >>> 0, 0x01000193) >>> 0;
    };
    const mixString = (value: string) => {
      for (let i = 0; i < value.length; i++) mix(value.charCodeAt(i));
    };

    mix(readyItems.length);
    for (const item of readyItems) {
      mixString(item.id);
      const embedding = item.result?.embedding || [];
      mix(embedding.length);
      for (let i = 0; i < embedding.length; i++) {
        const q = Number.isFinite(embedding[i]) ? Math.round(embedding[i] * 1e6) : 0;
        mix(q);
      }
    }

    return `${readyItems.length}:${hash.toString(16)}`;
  }, [readyItems]);
  const clusteringSignature = useMemo(() => JSON.stringify({ config, readyItemsKey }), [config, readyItemsKey]);

  // Reset linkage/stats when path changes
  useEffect(() => {
    setStats(null);
    setLinkageData(null);
    agglomerativeHierarchyMeta.current = null;
  }, [currentPath]);

  // Save/Load Config on Path Change
  const switchPath = (newPath: number[]) => {
    // Save current config for current path
    const currentPathKey = currentPath.join(',');
    setConfigCache((prev) => ({ ...prev, [currentPathKey]: config }));

    // Update Recent Path Logic:
    const isSubPath = newPath.length <= recentPath.length && newPath.every((val, i) => val === recentPath[i]);

    if (!isSubPath) {
      setRecentPath(newPath);
    }

    const newPathKey = newPath.join(',');
    setCurrentPath(newPath);

    const cachedPathConfig = configCache[newPathKey];
    if (cachedPathConfig) {
      setConfig(cachedPathConfig);
      return;
    }

    // New sub-cluster contexts should start agglomerative cuts from a stable visual default.
    if (newPath.length > 0) {
      setConfig((prev) =>
        prev.algorithm === 'AGGLOMERATIVE'
          ? {
              ...prev,
              distanceThreshold: DEFAULT_AGGLOMERATIVE_CUT,
              nClusters: undefined,
            }
          : prev,
      );
    }
  };

  const handleRunClustering = async () => {
    if (readyCount < 2) return;
    setIsProcessing(true);
    const runPathKey = currentPath.join(',');
    const runSignature = clusteringSignature;
    const runReadyItemsKey = readyItemsKey;
    const runAlgorithm = config.algorithm;
    const pathLabel = currentPath.length > 0 ? currentPath.join(' > ') : 'root';
    onLog?.(`Clustering started (${readyCount} items, path: ${pathLabel}).`, 'info');
    updateProgress('cluster', 0, 'Initializing...');

    try {
      await new Promise((r) => setTimeout(r, 10));

      // Run clustering ONLY on the active subset
      const result = await runClustering(activeItems, config, (p, msg) => {
        updateProgress('cluster', p, msg);
      });

      // Update items: We need to update ONLY the items involved, appending the new label to their path
      const updatedItems = applyLabelsAtDepth(items, result.labels, currentPath.length);

      onUpdateItems(updatedItems);
      setStats({ clusters: result.clusterCount, noise: result.noiseCount });

      if (result.linkage) {
        setLinkageData(result.linkage);
        const itemIds = getAgglomerativeItemIds(activeItems);
        agglomerativeHierarchyMeta.current = {
          pathKey: runPathKey,
          readyItemsKey: runReadyItemsKey,
          metric: config.metric,
          normalize: config.normalize,
          linkage: config.linkage,
          itemIds,
        };
      } else {
        agglomerativeHierarchyMeta.current = null;
      }
      lastRunSignatureByPath.current[runPathKey] = runSignature;
      clusteredContexts.current.add(`${runPathKey}|${runAlgorithm}`);
      onLog?.(`Clustering complete: ${result.clusterCount} clusters, ${result.noiseCount} noise.`, 'success');
      updateProgress('cluster', 100, 'Clustering complete');
    } catch (e) {
      console.error(e);
      onLog?.(`Clustering failed: ${(e as Error)?.message || 'Unknown error'}`, 'error');
    } finally {
      onProgressUpdate?.(null);
      setIsProcessing(false);
    }
  };

  const handleAutoTune = async () => {
    if (!supportsOptimization(config.algorithm)) return;
    if (readyCount < 5) return;
    const tuningBaseConfig: ClusteringConfig =
      config.algorithm === 'AGGLOMERATIVE'
        ? {
            ...config,
            distanceThreshold: DEFAULT_AGGLOMERATIVE_CUT,
            nClusters: undefined,
          }
        : config;

    setTuningState({ active: true, progress: 0, message: 'Initializing...' });
    const pathLabel = currentPath.length > 0 ? currentPath.join(' > ') : 'root';
    onLog?.(`Smart tune started (${readyCount} items, path: ${pathLabel}).`, 'info');
    updateProgress('tune', 0, 'Initializing...');

    if (config.algorithm === 'AGGLOMERATIVE' && config.distanceThreshold !== DEFAULT_AGGLOMERATIVE_CUT) {
      setConfig((prev) =>
        prev.algorithm === 'AGGLOMERATIVE'
          ? {
              ...prev,
              distanceThreshold: DEFAULT_AGGLOMERATIVE_CUT,
              nClusters: undefined,
            }
          : prev,
      );
    }

    try {
      const suggestion = await suggestConfig(activeItems, tuningBaseConfig, (p, msg) => {
        setTuningState({ active: true, progress: p, message: msg });
        updateProgress('tune', p, msg);
      });
      setConfig((prev) => {
        const baseline =
          prev.algorithm === 'AGGLOMERATIVE'
            ? {
                ...prev,
                distanceThreshold: DEFAULT_AGGLOMERATIVE_CUT,
                nClusters: undefined,
              }
            : prev;
        return { ...baseline, ...suggestion };
      });
      onLog?.(`Smart tune complete: ${summarizeSuggestion(suggestion)}.`, 'success');
      updateProgress('tune', 100, 'Optimization complete');
    } catch (e) {
      console.error('Auto tuning failed', e);
      onLog?.(`Smart tune failed: ${(e as Error)?.message || 'Unknown error'}`, 'error');
    } finally {
      onProgressUpdate?.(null);
      setTuningState((prev) => ({ ...prev, active: false }));
    }
  };

  const handleResetDefaults = async () => {
    const baseConfig: ClusteringConfig = {
      ...defaultConfig,
      algorithm: config.algorithm,
    };
    const pathLabel = currentPath.length > 0 ? currentPath.join(' > ') : 'root';

    if (!supportsOptimization(baseConfig.algorithm)) {
      setConfig(baseConfig);
      onLog?.(`Defaults restored (${baseConfig.algorithm}). Optimization is not supported for this algorithm.`, 'info');
      return;
    }

    if (readyCount < 5) {
      setConfig(baseConfig);
      onLog?.(`Defaults restored (${baseConfig.algorithm}). Need at least 5 items to optimize.`, 'info');
      return;
    }

    setTuningState({
      active: true,
      progress: 0,
      message: 'Resetting defaults...',
    });
    onLog?.(
      `Reset + optimize started (${readyCount} items, path: ${pathLabel}, algo: ${baseConfig.algorithm}).`,
      'info',
    );
    updateProgress('tune', 0, 'Resetting defaults...');

    try {
      const suggestion = await suggestConfig(activeItems, baseConfig, (p, msg) => {
        setTuningState({ active: true, progress: p, message: msg });
        updateProgress('tune', p, msg);
      });

      setConfig({ ...baseConfig, ...suggestion });
      onLog?.(`Reset + optimize complete: ${summarizeSuggestion(suggestion)}.`, 'success');
      updateProgress('tune', 100, 'Reset and optimization complete');
    } catch (e) {
      console.error('Reset defaults optimization failed', e);
      setConfig(baseConfig);
      onLog?.(`Optimization failed; restored defaults (${baseConfig.algorithm}).`, 'error');
    } finally {
      onProgressUpdate?.(null);
      setTuningState((prev) => ({ ...prev, active: false }));
    }
  };

  // Trigger Smart Tune when path/algorithm context changes.
  // Only run once per path+algorithm in this session to preserve manual overrides.
  useEffect(() => {
    const pathKey = currentPath.join(',');
    const tuneKey = `${pathKey}|${config.algorithm}`;
    // Run tuning only after we already have an initial clustering result for this context.
    if (!clusteredContexts.current.has(tuneKey)) return;
    if (isProcessing || tuningState.active) return;

    if (readyCount >= 5 && !visitedPaths.current.has(tuneKey)) {
      // Debounce slightly to let UI settle
      const timer = setTimeout(() => {
        handleAutoTune();
        visitedPaths.current.add(tuneKey);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentPath, config.algorithm, readyCount, isProcessing, tuningState.active]);

  // Handles clicking "Drill Down" on a composite group key like "1::2"
  const handleSubCluster = (groupKey: string) => {
    if (groupKey === 'Noise' || groupKey === 'Unassigned') return;
    const relativeParts = groupKey.split('::').map(Number);
    const newPath = [...currentPath, ...relativeParts];
    switchPath(newPath);
  };

  const handleNavigate = (index: number) => {
    if (index === -1) switchPath([]);
    else switchPath(recentPath.slice(0, index + 1));
  };

  useEffect(() => {
    if (config.algorithm !== 'AGGLOMERATIVE') return;
    if (!linkageData || tuningState.active) return;
    if (readyCount < 2) return;

    const pathKey = currentPath.join(',');
    const hierarchyMeta = agglomerativeHierarchyMeta.current;
    if (!hierarchyMeta) return;
    if (hierarchyMeta.pathKey !== pathKey) return;
    if (hierarchyMeta.readyItemsKey !== readyItemsKey) return;
    if (
      hierarchyMeta.metric !== config.metric ||
      hierarchyMeta.normalize !== config.normalize ||
      hierarchyMeta.linkage !== config.linkage
    )
      return;

    if (lastRunSignatureByPath.current[pathKey] === clusteringSignature) return;

    try {
      const cutResult = cutAgglomerativeHierarchy(linkageData, hierarchyMeta.itemIds, {
        nClusters: config.nClusters,
        distanceThreshold: config.distanceThreshold,
        minClusterSize: config.minClusterSize,
      });
      const updatedItems = applyLabelsAtDepth(items, cutResult.labels, currentPath.length);
      onUpdateItems(updatedItems);
      setStats({
        clusters: cutResult.clusterCount,
        noise: cutResult.noiseCount,
      });
      lastRunSignatureByPath.current[pathKey] = clusteringSignature;
    } catch (error) {
      console.warn('Fast agglomerative cut failed; falling back to full clustering run.', error);
    }
  }, [
    config.algorithm,
    config.distanceThreshold,
    config.linkage,
    config.metric,
    config.minClusterSize,
    config.nClusters,
    config.normalize,
    currentPath,
    items,
    linkageData,
    onUpdateItems,
    readyCount,
    readyItemsKey,
    clusteringSignature,
    tuningState.active,
  ]);

  useEffect(() => {
    if (readyCount < 2) return;
    // Don't auto-run if tuning is in progress; wait for it to finish and update config
    if (tuningState.active) return;
    const pathKey = currentPath.join(',');
    if (lastRunSignatureByPath.current[pathKey] === clusteringSignature) return;

    const handler = setTimeout(() => {
      handleRunClustering();
    }, 300); // Shorter debounce for slider responsiveness

    return () => clearTimeout(handler);
  }, [readyCount, tuningState.active, currentPath, clusteringSignature]);

  // --- Render Logic for Group Titles ---
  const renderGroupTitle = (val: string, count: number) => {
    if (val === 'Noise') {
      return (
        <div className="flex items-center gap-2 text-sm font-bold text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span>Noise / Outliers</span>
        </div>
      );
    }
    if (val === 'Unassigned') {
      return (
        <div className="flex items-center gap-2 text-sm font-bold text-gray-500">
          <HelpCircle className="w-4 h-4" />
          <span>Unassigned</span>
        </div>
      );
    }

    // Handle standard numeric or composite "1::2" keys
    const parts = val.split('::').map(Number);

    return (
      <div className="flex items-center flex-wrap gap-1">
        {parts.map((pId, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-600" />}

            {pId === -1 ? (
              <div className="flex items-center gap-1 text-red-400 font-bold text-xs bg-red-900/20 px-1.5 py-0.5 rounded border border-red-500/20">
                <AlertCircle className="w-3 h-3" /> Noise
              </div>
            ) : (
              <div className="flex items-center gap-1 text-accent-400 font-bold text-xs bg-accent-500/10 px-1.5 py-0.5 rounded border border-accent-500/20">
                <Layers className="w-3 h-3" /> Cluster {pId}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // --- Deep Grouping Function ---
  const groupByFn = (item: GalleryItem) => {
    if (!item.clusterPath) return 'Unassigned';

    // Scope Check
    for (let i = 0; i < currentPath.length; i++) {
      if (item.clusterPath[i] !== currentPath[i]) return undefined;
    }

    const suffix = item.clusterPath.slice(currentPath.length);
    if (suffix.length === 0) return 'Unassigned';
    return suffix.join('::');
  };

  return (
    <div className="flex flex-col h-full gap-2">
      {/* 1. Header & Toolbar */}
      <HeaderBar
        icon={Network}
        title="Cluster Analysis"
        subtitle="Unsupervised Learning"
        leftContent={
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-thin pb-1 md:pb-0">
            <button
              onClick={() => handleNavigate(-1)}
              className={`px-2 py-1 md:px-1.5 md:py-0.5 rounded-md transition-colors flex items-center gap-1 shrink-0 ${currentPath.length === 0 ? 'bg-accent-500/10 text-accent-400 font-bold' : 'hover:bg-gray-800 hover:text-white'}`}
            >
              <Home className="w-3 h-3" />
              Root
            </button>

            <BreadcrumbSeparator
              depth={0}
              parentPath={[]}
              items={items}
              onSelect={(id) => switchPath([id])}
              isMobile={isMobile}
            />

            {recentPath.map((clusterId, idx) => {
              const isActive = idx < currentPath.length;
              const isGhost = !isActive;

              return (
                <React.Fragment key={idx}>
                  <button
                    onClick={() => handleNavigate(idx)}
                    className={`px-2 py-1 md:px-1.5 md:py-0.5 rounded-md transition-colors flex items-center gap-1 shrink-0
                      ${
                        isActive
                          ? idx === currentPath.length - 1
                            ? 'bg-accent-500/10 text-accent-400 font-bold border border-accent-500/20'
                            : 'hover:bg-gray-800 hover:text-white'
                          : 'text-gray-600 hover:text-gray-400 border border-transparent hover:border-gray-800/50 italic'
                      }`}
                    title={isGhost ? 'Go back to recent path' : ''}
                  >
                    Cluster {clusterId}
                  </button>
                  <BreadcrumbSeparator
                    depth={idx + 1}
                    parentPath={recentPath.slice(0, idx + 1)}
                    items={items}
                    onSelect={(id) => switchPath([...recentPath.slice(0, idx + 1), id])}
                    isMobile={isMobile}
                  />
                </React.Fragment>
              );
            })}
          </div>
        }
        actions={
          <>
            {tuningState.active && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 shrink-0">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-wide hidden sm:inline">Background Tune</span>
                <span className="text-[10px] font-bold text-amber-200">{tuningState.progress}%</span>
              </div>
            )}

            {isMobile && !showConfig && (
              <button
                type="button"
                onClick={() => setShowMobileQuickControls((prev) => !prev)}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all border shadow-sm shrink-0 bg-gray-900 text-gray-300 border-gray-800 hover:text-white hover:border-gray-700"
              >
                <SlidersHorizontal className="w-3 h-3" />
                {showMobileQuickControls ? 'Hide Quick' : 'Quick Controls'}
                <ChevronDown
                  className={`w-3 h-3 opacity-60 transition-transform ${showMobileQuickControls ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {/* Compact Actions when Config is Hidden */}
            {!showConfig && (!isMobile || showMobileQuickControls) && (
              <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 animate-fadeIn overflow-x-auto scrollbar-thin w-full md:w-auto">
                <AlgorithmQuickControls
                  config={config}
                  projectedK={projectedK}
                  linkageData={linkageData}
                  onConfigChange={setConfig}
                  onClusterCountChange={handleClusterCountChange}
                />
              </div>
            )}

            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm shrink-0
                ${
                  showConfig
                    ? 'bg-gray-800 text-white border-gray-700'
                    : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
                }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              {showConfig ? 'Minimize' : 'Configure'}
              {showConfig ? (
                <ChevronUp className="w-3 h-3 opacity-50" />
              ) : (
                <ChevronDown className="w-3 h-3 opacity-50" />
              )}
            </button>
          </>
        }
      />

      {/* 2. Collapsible Configuration Panel */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${showConfig ? 'max-h-[72dvh] md:max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-xl max-h-[72dvh] md:max-h-none overflow-y-auto">
          {/* Algorithm Selection Tabs */}
          <div className="flex flex-wrap pb-2 gap-2 items-center">
            <div
              className={`${SIMPLE_SEGMENTED_CONTROL_FRAME_CLASS} inline-flex min-w-max gap-1`}
              role="group"
              aria-label="Clustering method selector"
            >
              {ALGORITHM_SEGMENTS.map(({ algorithm, description }) => {
                const isActive = config.algorithm === algorithm;

                return (
                  <button
                    key={algorithm}
                    type="button"
                    onClick={() => handleAlgorithmSelect(algorithm)}
                    aria-pressed={isActive}
                    title={description}
                    className={getSimpleSegmentButtonClassName(
                      isActive,
                      'shrink-0 whitespace-nowrap px-3 text-center uppercase tracking-wide',
                    )}
                  >
                    {CLUSTERING_ALGORITHM_LABELS[algorithm]}
                  </button>
                );
              })}
            </div>
            <AlgorithmHelpButton
              algorithm={config.algorithm}
              isOpen={showAlgorithmHelp}
              onClick={() => setShowAlgorithmHelp((prev) => !prev)}
            />
          </div>

          {showAlgorithmHelp && (
            <ClusteringMethodGuide algorithm={config.algorithm} onClose={() => setShowAlgorithmHelp(false)} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Parameters Area */}
            <div className="lg:col-span-2 space-y-4">
              {/* Dendrogram Visualization for Agglomerative */}
              {config.algorithm === 'AGGLOMERATIVE' && (
                <div className="bg-gray-950/50 rounded-lg border border-gray-800 p-3 relative group">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-gray-400 flex items-center gap-2">
                      <Activity className="w-3 h-3" /> Dendrogram Cut
                    </label>
                    <span className="text-[10px] text-gray-600 bg-gray-900 px-2 py-0.5 rounded">
                      Drag pink line to adjust clusters
                    </span>
                  </div>

                  {linkageData ? (
                    <Dendrogram
                      linkage={linkageData}
                      threshold={config.distanceThreshold}
                      onThresholdChange={(val) =>
                        setConfig({
                          ...config,
                          distanceThreshold: val,
                          nClusters: undefined,
                        })
                      }
                      height={140}
                      color="#60a5fa"
                    />
                  ) : (
                    <div className="h-[140px] border-2 border-dashed border-gray-800 rounded flex flex-col items-center justify-center text-gray-600 gap-2">
                      <Layers className="w-6 h-6 opacity-20" />
                      <span className="text-xs">Run clustering to generate tree</span>
                    </div>
                  )}
                </div>
              )}

              {/* Parameter Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <AlgorithmParameterGrid
                  config={config}
                  projectedK={projectedK}
                  linkageData={linkageData}
                  onConfigChange={setConfig}
                  onClusterCountChange={handleClusterCountChange}
                />
              </div>
            </div>

            {/* Right Column: General Settings & Actions */}
            <div className="flex flex-col gap-6 lg:border-l lg:border-gray-800 lg:pl-6">
              {/* Data Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2">
                    <Scale className="w-3 h-3" /> Data Processing
                  </label>

                  <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
                    <div className={`${SIMPLE_SEGMENTED_CONTROL_FRAME_CLASS} flex gap-1`}>
                      {(['COSINE', 'EUCLIDEAN'] as DistanceMetric[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setConfig({ ...config, metric: m })}
                          className={getSimpleSegmentButtonClassName(config.metric === m)}
                        >
                          {m === 'COSINE' ? 'Cosine Similarity' : 'Euclidean Distance'}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setConfig({ ...config, normalize: !config.normalize })}
                      className={`p-2 rounded-lg border text-left transition-colors ${
                        config.normalize
                          ? 'border-accent-500/30 bg-accent-500/10'
                          : 'border-gray-800 bg-gray-950/30 hover:border-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-300">L2 Norm</span>
                        <span
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors ${config.normalize ? 'bg-accent-600' : 'bg-gray-700'}`}
                        >
                          <span
                            className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config.normalize ? 'translate-x-4' : 'translate-x-0'}`}
                          ></span>
                        </span>
                      </div>
                      {/* <p className="text-[10px] text-gray-500 mt-1">Vector normalize</p> */}
                    </button>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-800">
                <div className="grid gap-3 grid-cols-1">
                  <button
                    onClick={handleResetDefaults}
                    disabled={tuningState.active}
                    className={`flex items-center justify-center gap-2 py-3 px-3 rounded-lg border transition-colors text-xs font-bold group ${
                      tuningState.active
                        ? 'border-accent-500/30 bg-accent-500/10 text-accent-300 cursor-wait'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                    title="Reset selected algorithm defaults and optimize when supported"
                  >
                    {tuningState.active ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-180 transition-transform duration-500" />
                    )}
                    {tuningState.active ? `${tuningState.progress}%` : 'Reset'}
                  </button>
                </div>

                {readyCount < 5 && (
                  <p className="text-[10px] text-center text-gray-600">Need at least 5 items for optimization.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Results Gallery */}
      <div className="flex-1 bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden flex flex-col min-h-0 relative">
        <div className="flex-1 min-h-0 flex flex-col">
          {readyCount < 2 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 opacity-50">
              <AlertCircle className="w-12 h-12 mb-3" />
              <p>Not enough items to cluster</p>
              {currentPath.length > 0 && <p className="text-xs mt-2">Try adjusting parameters or navigating up.</p>}
            </div>
          ) : (
            <Gallery
              images={activeItems}
              onSelect={(item) => setSelectedGalleryId(item?.id || null)}
              selectedId={selectedGalleryId}
              isProcessing={isProcessing}
              viewMode="grid"
              groupBy={groupByFn}
              groupTitleBuilder={renderGroupTitle}
              onUpdateItems={onUpdateItems}
              onDrillDown={handleSubCluster}
              defaultDensity="compact"
              headerMeta={
                stats ? (
                  <span className="px-2 py-0.5 rounded-full bg-gray-800 text-xs border border-gray-700 whitespace-nowrap">
                    <span className="text-green-400 font-semibold">{stats.clusters} clusters</span>
                    <span className="text-gray-600 px-1">|</span>
                    <span className="text-orange-400 font-semibold">{stats.noise} noise</span>
                  </span>
                ) : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusteringView;
