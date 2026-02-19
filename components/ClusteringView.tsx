import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GalleryItem, ClusteringConfig, ClusteringAlgorithm, DistanceMetric, LinkageMethod, LinkageStep } from '../types';
import { runClustering, suggestConfig, getClusterCountFromThreshold, getThresholdForClusterCount } from '../services/clusteringService';
import Dendrogram from './Dendrogram';
import Gallery from './Gallery';
import DraggableNumberInput from './DraggableNumberInput';
import { Settings2, Play, RefreshCw, Layers, BrainCircuit, AlertCircle, Zap, ZapOff, Wand2, HelpCircle, Scale, ChevronUp, ChevronDown, SlidersHorizontal, Activity, Network, ChevronRight, Home, MousePointerClick, RotateCcw } from 'lucide-react';

interface ClusteringViewProps {
  items: GalleryItem[];
  onUpdateItems: (items: GalleryItem[]) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
}

// Breadcrumb Separator with Dropdown
const BreadcrumbSeparator: React.FC<{
    depth: number;
    parentPath: number[];
    items: GalleryItem[];
    onSelect: (clusterId: number) => void;
}> = ({ depth, parentPath, items, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Find siblings available at this level given the parent path
    const siblings = useMemo(() => {
        const available = new Set<number>();
        items.forEach(item => {
            // Must match parent path prefix
            if (!item.clusterPath || item.clusterPath.length <= depth) return;
            let match = true;
            for(let i=0; i<parentPath.length; i++) {
                if (item.clusterPath[i] !== parentPath[i]) { match = false; break; }
            }
            if (match) {
                available.add(item.clusterPath[depth]);
            }
        });
        return Array.from(available).sort((a,b) => a-b);
    }, [items, parentPath, depth]);

    if (siblings.length === 0) return <ChevronRight className="w-3 h-3 opacity-30" />;

    return (
        <div className="relative flex items-center" onMouseEnter={() => setIsOpen(true)} onMouseLeave={() => setIsOpen(false)}>
            <div className={`p-0.5 rounded cursor-pointer transition-colors ${isOpen ? 'bg-accent-500/20 text-accent-400' : 'text-gray-600 hover:text-gray-400'}`}>
                <ChevronRight className="w-3 h-3" />
            </div>
            
            {isOpen && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-32 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                     <div className="px-2 py-1 text-[9px] font-bold text-gray-500 uppercase border-b border-gray-800 mb-1">
                        Select Sibling
                     </div>
                     <div className="max-h-40 overflow-y-auto scrollbar-thin">
                        {siblings.map(id => (
                            <button
                                key={id}
                                onClick={() => { onSelect(id); setIsOpen(false); }}
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


const ClusteringView: React.FC<ClusteringViewProps> = ({ items, onUpdateItems, isProcessing, setIsProcessing }) => {
  const [showConfig, setShowConfig] = useState(false);
  
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
    distanceThreshold: 0.4,
    birchThreshold: 0.5,
    birchBranching: 50
  };

  const [config, setConfig] = useState<ClusteringConfig>(defaultConfig);
  // Cache for config at each path level: Key = path.join(',')
  const [configCache, setConfigCache] = useState<Record<string, ClusteringConfig>>({
      "": defaultConfig
  });

  const [stats, setStats] = useState<{ clusters: number, noise: number } | null>(null);
  const [linkageData, setLinkageData] = useState<LinkageStep[] | null>(null);
  const [projectedK, setProjectedK] = useState<number | null>(null);
  // Per-path signature of the last successful clustering run.
  const lastRunSignatureByPath = useRef<Record<string, string>>({});

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
    
    setConfig({ ...config, distanceThreshold: newThreshold, nClusters: undefined });
  };
  
  // Drill Down State
  const [currentPath, setCurrentPath] = useState<number[]>([]);
  const [recentPath, setRecentPath] = useState<number[]>([]);
  
  // Dummy selection state for Gallery
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  
  const [autoRun, setAutoRun] = useState(true);
  const [smartTune, setSmartTune] = useState(true); // New state for auto-tuning on drill down

  const [tuningState, setTuningState] = useState<{ active: boolean, progress: number, message: string }>({
    active: false, progress: 0, message: ''
  });
  
  // Filter items based on current path
  const activeItems = useMemo(() => {
    if (currentPath.length === 0) return items;
    return items.filter(item => {
        // Check if item's path starts with currentPath
        if (!item.clusterPath || item.clusterPath.length < currentPath.length) return false;
        for (let i = 0; i < currentPath.length; i++) {
            if (item.clusterPath[i] !== currentPath[i]) return false;
        }
        return true;
    });
  }, [items, currentPath]);

  const readyItems = activeItems.filter(i => i.status === 'cached' && i.enabled !== false);
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
  const clusteringSignature = useMemo(
    () => JSON.stringify({ config, readyItemsKey }),
    [config, readyItemsKey]
  );

  // Reset linkage/stats when path changes
  useEffect(() => {
      setStats(null);
      setLinkageData(null);
  }, [currentPath]);
  
  // Save/Load Config on Path Change
  const switchPath = (newPath: number[]) => {
      // Save current config for current path
      const currentPathKey = currentPath.join(',');
      setConfigCache(prev => ({ ...prev, [currentPathKey]: config }));
      
      // Update Recent Path Logic:
      const isSubPath = newPath.length <= recentPath.length && 
                        newPath.every((val, i) => val === recentPath[i]);
      
      if (!isSubPath) {
          setRecentPath(newPath);
      }
      
      const newPathKey = newPath.join(',');
      setCurrentPath(newPath);
      
      if (configCache[newPathKey]) {
          setConfig(configCache[newPathKey]);
      } 
  };

  const handleRunClustering = async () => {
    if (readyCount < 2) return;
    setIsProcessing(true);
    const runPathKey = currentPath.join(',');
    const runSignature = clusteringSignature;

    try {
      await new Promise(r => setTimeout(r, 10));

      // Run clustering ONLY on the active subset
      const result = await runClustering(activeItems, config);
        
      // Update items: We need to update ONLY the items involved, appending the new label to their path
      const updatedItems = items.map(item => {
          if (!result.labels.has(item.id)) return item;
          
          const newLabel = result.labels.get(item.id)!;
          const existingPath = item.clusterPath || [];
          const base = existingPath.slice(0, currentPath.length);
          const previousLabelAtDepth = existingPath[currentPath.length];
          const suffix = existingPath.slice(currentPath.length + 1);
          const preserveSuffix = suffix.length > 0 && previousLabelAtDepth === newLabel;
          
          return {
              ...item,
              clusterPath: preserveSuffix ? [...base, newLabel, ...suffix] : [...base, newLabel],
              clusterLabel: newLabel // Update the label for "GroupBy" convenience at this level
          };
      });

      onUpdateItems(updatedItems);
      setStats({ clusters: result.clusterCount, noise: result.noiseCount });
      
      if (result.linkage) {
          setLinkageData(result.linkage);
      }
      lastRunSignatureByPath.current[runPathKey] = runSignature;
      
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoTune = async () => {
     if (readyCount < 5) return;
     setTuningState({ active: true, progress: 0, message: 'Initializing...' });
     
     try {
        const suggestion = await suggestConfig(activeItems, config, (p, msg) => {
            setTuningState({ active: true, progress: p, message: msg });
        });
        setConfig(prev => ({ ...prev, ...suggestion }));
     } catch(e) {
        console.error("Auto tuning failed", e);
     } finally {
        setTuningState(prev => ({ ...prev, active: false }));
     }
  };

  // Trigger Smart Tune when path changes (drilling down)
  // Logic: Only run auto-tune if this path hasn't been auto-tuned in this session.
  // This preserves manual overrides if the user navigates away and back.
  useEffect(() => {
    const pathKey = currentPath.join(',');
    if (smartTune && readyCount >= 5 && !visitedPaths.current.has(pathKey)) {
        // Debounce slightly to let UI settle
        const timer = setTimeout(() => {
            handleAutoTune();
            visitedPaths.current.add(pathKey);
        }, 50);
        return () => clearTimeout(timer);
    }
  }, [currentPath, smartTune, readyCount]); 

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
    if (!autoRun) return;
    if (readyCount < 2) return;
    // Don't auto-run if tuning is in progress; wait for it to finish and update config
    if (tuningState.active) return; 
    const pathKey = currentPath.join(',');
    if (lastRunSignatureByPath.current[pathKey] === clusteringSignature) return;

    const handler = setTimeout(() => {
       handleRunClustering();
    }, 300); // Shorter debounce for slider responsiveness

    return () => clearTimeout(handler);
  }, [autoRun, readyCount, tuningState.active, currentPath, clusteringSignature]);

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
      for(let i=0; i<currentPath.length; i++) {
          if (item.clusterPath[i] !== currentPath[i]) return undefined;
      }
      
      const suffix = item.clusterPath.slice(currentPath.length);
      if (suffix.length === 0) return 'Unassigned';
      return suffix.join('::');
  };

  return (
    <div className="flex flex-col h-full gap-2">

      {/* 1. Header & Toolbar */}
      <div className="flex flex-col gap-2 shrink-0">
        {/* Interactive Breadcrumbs */}
        <div className="flex items-center justify-between gap-2 text-xs text-gray-400 bg-gray-950/30 p-2 rounded-lg border border-gray-800/50">
            <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="flex items-center gap-2 pr-2 mr-1 border-r border-gray-800/80 shrink-0">
                    <div className="p-1.5 bg-accent-500/10 rounded-lg">
                        <Network className="w-4 h-4 text-accent-500" />
                    </div>
                    <div className="leading-none">
                        <h2 className="text-sm font-bold text-white">Cluster Analysis</h2>
                        <p className="text-[10px] text-gray-500 font-medium mt-0.5">Unsupervised Learning</p>
                    </div>
                </div>

                <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto scrollbar-thin">
                    <button 
                        onClick={() => handleNavigate(-1)}
                        className={`p-1 rounded-md transition-colors flex items-center gap-1 shrink-0 ${currentPath.length === 0 ? 'bg-accent-500/10 text-accent-400 font-bold' : 'hover:bg-gray-800 hover:text-white'}`}
                    >
                        <Home className="w-3 h-3" />
                        Root
                    </button>
                    
                    <BreadcrumbSeparator 
                        depth={0} 
                        parentPath={[]} 
                        items={items}
                        onSelect={(id) => switchPath([id])}
                    />

                    {recentPath.map((clusterId, idx) => {
                        const isActive = idx < currentPath.length;
                        const isGhost = !isActive;

                        return (
                        <React.Fragment key={idx}>
                            <button 
                                onClick={() => handleNavigate(idx)}
                                className={`px-1.5 py-0.5 rounded-md transition-colors flex items-center gap-1 shrink-0
                                    ${isActive 
                                        ? (idx === currentPath.length - 1 
                                            ? 'bg-accent-500/10 text-accent-400 font-bold border border-accent-500/20' 
                                            : 'hover:bg-gray-800 hover:text-white')
                                        : 'text-gray-600 hover:text-gray-400 border border-transparent hover:border-gray-800/50 italic'
                                    }`}
                                title={isGhost ? "Go back to recent path" : ""}
                            >
                                Cluster {clusterId}
                            </button>
                            <BreadcrumbSeparator 
                                depth={idx + 1}
                                parentPath={recentPath.slice(0, idx + 1)}
                                items={items}
                                onSelect={(id) => switchPath([...recentPath.slice(0, idx + 1), id])}
                            />
                        </React.Fragment>
                        );
                    })}
                </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
                {/* Compact Actions when Config is Hidden */}
                {!showConfig && (
                <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1 animate-fadeIn">
                    
                    {config.algorithm === 'KMEANS' && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">K</span>
                            <DraggableNumberInput
                                value={config.k}
                                onChange={(next) => setConfig({ ...config, k: next })}
                                min={2}
                                step={1}
                                integer
                                className="w-[4.5rem]"
                                inputClassName="px-1.5 py-0.5 text-xs text-center"
                                handleClassName="w-5"
                                ariaLabel="Number of clusters"
                                title="Number of clusters"
                            />
                        </div>
                    )}
                    
                    {config.algorithm === 'HDBSCAN' && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Min Size</span>
                            <DraggableNumberInput
                                value={config.minClusterSize}
                                onChange={(next) => setConfig({ ...config, minClusterSize: next })}
                                min={2}
                                step={1}
                                integer
                                className="w-[4.5rem]"
                                inputClassName="px-1.5 py-0.5 text-xs text-center"
                                handleClassName="w-5"
                                ariaLabel="Minimum cluster size"
                                title="Minimum cluster size"
                            />
                        </div>
                    )}

                    {config.algorithm === 'AGGLOMERATIVE' && (
                        <>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Cut Dist</span>
                            <DraggableNumberInput
                                value={config.distanceThreshold}
                                onChange={(next) => setConfig({ ...config, distanceThreshold: next, nClusters: undefined })}
                                min={0}
                                step={0.05}
                                className="w-[5.5rem]"
                                inputClassName="px-1.5 py-0.5 text-xs text-center"
                                handleClassName="w-5"
                                ariaLabel="Distance threshold"
                                title="Distance Threshold"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Est. K</span>
                            <div className="relative">
                                <DraggableNumberInput
                                    value={projectedK ?? 1}
                                    disabled={!linkageData}
                                    onChange={(next) => handleClusterCountChange(next)}
                                    min={1}
                                    step={1}
                                    integer
                                    className={`w-[4.5rem] ${!linkageData ? 'opacity-50' : ''}`}
                                    inputClassName="px-1.5 py-0.5 text-xs text-center"
                                    handleClassName="w-5"
                                    ariaLabel="Estimated cluster count"
                                    title="Estimated Cluster Count"
                                />
                                {!linkageData && (
                                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-600 font-bold text-[10px]">?</div>
                                )}
                            </div>
                        </div>
                        </>
                    )}
                    
                    {(!autoRun || !smartTune) && <div className="w-px h-4 bg-gray-700 mx-1"></div>}

                    {/* Compact Auto-Tune Button */}
                    {!smartTune && (
                    <button 
                        onClick={handleAutoTune}
                        disabled={readyCount < 5 || tuningState.active}
                        className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-accent-400 border border-gray-700 hover:border-accent-500/50 rounded transition-colors shadow-sm disabled:opacity-50"
                        title="Optimize Parameters"
                    >
                        {tuningState.active ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                            <Wand2 className="w-3 h-3" />
                        )}
                        <span className="hidden xl:inline text-xs font-bold">Optimize</span>
                    </button>
                    )}

                    {!autoRun && (
                    <button 
                        onClick={handleRunClustering}
                        disabled={isProcessing}
                        className="flex items-center gap-1.5 px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded transition-colors shadow-sm disabled:opacity-50"
                        title="Run Clustering"
                    >
                        {isProcessing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
                        <span className="text-xs font-bold">Run</span>
                    </button>
                    )}
                </div>
                )}

                <button 
                onClick={() => setShowConfig(!showConfig)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm shrink-0
                    ${showConfig 
                        ? 'bg-gray-800 text-white border-gray-700' 
                        : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-white hover:border-gray-700'
                    }`}
                >
                <SlidersHorizontal className="w-3 h-3" />
                {showConfig ? 'Minimize' : 'Configure'}
                {showConfig ? <ChevronUp className="w-3 h-3 opacity-50" /> : <ChevronDown className="w-3 h-3 opacity-50" />}
                </button>
            </div>
        </div>
      </div>

      {/* 2. Collapsible Configuration Panel */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showConfig ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-xl">
          
          {/* Algorithm Selection Tabs */}
          <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-800 pb-4">
              {(['AGGLOMERATIVE', 'HDBSCAN', 'KMEANS', 'BIRCH'] as ClusteringAlgorithm[]).map(algo => (
                  <button
                      key={algo}
                      onClick={() => setConfig({ ...config, algorithm: algo })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all
                          ${config.algorithm === algo 
                              ? 'bg-accent-600 text-white shadow-lg shadow-accent-900/20 scale-105' 
                              : 'bg-gray-800 text-gray-500 hover:bg-gray-750 hover:text-gray-300'
                          }`}
                  >
                      {algo === 'HDBSCAN' ? 'HDBSCAN' : algo === 'KMEANS' ? 'K-Means' : algo === 'BIRCH' ? 'BIRCH' : 'Agglomerative'}
                  </button>
              ))}
          </div>

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
                                onThresholdChange={(val) => setConfig({ ...config, distanceThreshold: val, nClusters: undefined })}
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
                    {config.algorithm === 'AGGLOMERATIVE' && (
                        <>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Linkage Method</label>
                                <select 
                                    value={config.linkage} 
                                    onChange={(e) => setConfig({...config, linkage: e.target.value as LinkageMethod})}
                                    className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-sm text-gray-300 focus:border-accent-500 outline-none transition-colors"
                                >
                                    <option value="AVERAGE">Average</option>
                                    <option value="COMPLETE">Complete</option>
                                </select>
                            </div>
                            <div className="col-span-1 sm:col-span-2 grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Cut Distance</label>
                                    <DraggableNumberInput
                                        value={config.distanceThreshold}
                                        onChange={(next) => setConfig({ ...config, distanceThreshold: next, nClusters: undefined })}
                                        min={0}
                                        step={0.01}
                                        className="w-full"
                                        inputClassName="p-2 text-sm"
                                        ariaLabel="Agglomerative cut distance"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Est. Clusters</label>
                                    <div className="relative">
                                        <DraggableNumberInput
                                            value={projectedK ?? 1}
                                            disabled={!linkageData}
                                            onChange={(next) => handleClusterCountChange(next)}
                                            min={1}
                                            step={1}
                                            integer
                                            className={`w-full ${!linkageData ? 'opacity-50' : ''}`}
                                            inputClassName="p-2 text-sm"
                                            ariaLabel="Estimated clusters"
                                        />
                                        {!linkageData && (
                                            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-600 pointer-events-none">
                                                Run to calc
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {config.algorithm === 'HDBSCAN' && (
                        <>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Epsilon (Radius)</label>
                                <DraggableNumberInput
                                    value={config.epsilon}
                                    onChange={(next) => setConfig({ ...config, epsilon: next })}
                                    min={0}
                                    step={0.05}
                                    className="w-full"
                                    inputClassName="p-2 text-sm"
                                    ariaLabel="HDBSCAN epsilon radius"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-500 uppercase">Min Cluster Size</label>
                                <DraggableNumberInput
                                    value={config.minClusterSize}
                                    onChange={(next) => setConfig({ ...config, minClusterSize: next })}
                                    min={2}
                                    step={1}
                                    integer
                                    className="w-full"
                                    inputClassName="p-2 text-sm"
                                    ariaLabel="HDBSCAN minimum cluster size"
                                />
                            </div>
                        </>
                    )}

                    {config.algorithm === 'KMEANS' && (
                        <>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">K (Clusters)</label>
                              <DraggableNumberInput
                                  value={config.k}
                                  onChange={(next) => setConfig({ ...config, k: next })}
                                  min={2}
                                  step={1}
                                  integer
                                  className="w-full"
                                  inputClassName="p-2 text-sm"
                                  ariaLabel="K-means clusters"
                              />
                          </div>
                          <div className="space-y-1">
                              <label className="text-[10px] font-bold text-gray-500 uppercase">Max Iterations</label>
                              <DraggableNumberInput
                                  value={config.maxIter}
                                  onChange={(next) => setConfig({ ...config, maxIter: next })}
                                  min={1}
                                  step={1}
                                  integer
                                  className="w-full"
                                  inputClassName="p-2 text-sm"
                                  ariaLabel="K-means max iterations"
                              />
                          </div>
                      </>
                    )}
                    
                    {config.algorithm === 'BIRCH' && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-500 uppercase">Radius Threshold</label>
                          <DraggableNumberInput
                              value={config.birchThreshold}
                              onChange={(next) => setConfig({ ...config, birchThreshold: next })}
                              min={0}
                              step={0.05}
                              className="w-full"
                              inputClassName="p-2 text-sm"
                              ariaLabel="BIRCH radius threshold"
                          />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-gray-500 uppercase">Branching Factor</label>
                            <DraggableNumberInput
                                value={config.birchBranching}
                                onChange={(next) => setConfig({ ...config, birchBranching: next })}
                                min={1}
                                step={1}
                                integer
                                className="w-full"
                                inputClassName="p-2 text-sm"
                                ariaLabel="BIRCH branching factor"
                            />
                        </div>
                      </>
                    )}
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
                        <div className="bg-gray-950/30 p-1 rounded-lg border border-gray-800 flex gap-1">
                          {(['COSINE', 'EUCLIDEAN'] as DistanceMetric[]).map(m => (
                              <button
                                key={m}
                                onClick={() => setConfig({...config, metric: m})}
                                className={`flex-1 text-[10px] font-bold py-2 rounded-md transition-all ${config.metric === m ? 'bg-gray-800 text-white shadow-sm border border-gray-700' : 'text-gray-500 hover:text-gray-300'}`}
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
                            <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${config.normalize ? 'bg-accent-600' : 'bg-gray-700'}`}>
                              <span className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${config.normalize ? 'translate-x-4' : 'translate-x-0'}`}></span>
                            </span>
                          </div>
                          {/* <p className="text-[10px] text-gray-500 mt-1">Vector normalize</p> */}
                        </button>
                      </div>
                  </div>
              </div>

              <div className="h-px bg-gray-800"></div>

              {/* Execution Behavior */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-2">
                     <Zap className="w-3 h-3" /> Runtime Behavior
                  </label>
                  
                  <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAutoRun(!autoRun)}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          autoRun
                            ? 'border-accent-500/30 bg-accent-500/10'
                            : 'border-gray-800 bg-gray-950/30 hover:border-gray-700'
                        }`}
                      >
                          <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-300">Auto-Run</span>
                              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${autoRun ? 'bg-accent-600' : 'bg-gray-700'}`}>
                                  <span className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${autoRun ? 'translate-x-4' : 'translate-x-0'}`}></span>
                              </span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">Re-cluster on change</p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setSmartTune(!smartTune)}
                        className={`p-2 rounded-lg border text-left transition-colors ${
                          smartTune
                            ? 'border-accent-500/30 bg-accent-500/10'
                            : 'border-gray-800 bg-gray-950/30 hover:border-gray-700'
                        }`}
                      >
                          <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-300">Smart Tune</span>
                              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${smartTune ? 'bg-accent-600' : 'bg-gray-700'}`}>
                                  <span className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${smartTune ? 'translate-x-4' : 'translate-x-0'}`}></span>
                              </span>
                          </div>
                          <p className="text-[10px] text-gray-500 mt-1">Auto-optimize drill-down</p>
                      </button>
                  </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-gray-800">
                {!smartTune && (
                    <button 
                        onClick={handleAutoTune}
                        disabled={readyCount < 5 || tuningState.active}
                        className={`flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-bold transition-all relative overflow-hidden group
                            ${tuningState.active 
                                ? 'bg-accent-900/20 border-accent-500/20 text-accent-400 cursor-wait' 
                                : 'bg-accent-500/10 border-accent-500/30 text-accent-400 hover:bg-accent-500/20 hover:border-accent-500/50'
                            }
                        `}
                    >
                        {tuningState.active ? (
                            <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>{tuningState.progress}%</span>
                            </>
                        ) : (
                            <>
                                <Wand2 className="w-3.5 h-3.5" />
                                <span>Optimize Params</span>
                            </>
                        )}
                    </button>
                )}

                <div className="grid gap-3 grid-cols-2">
                    <button 
                        onClick={() => setConfig(defaultConfig)}
                        className="flex items-center justify-center gap-2 py-3 px-3 rounded-lg border border-gray-700 bg-gray-800/50 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors text-xs font-bold group"
                        title="Reset all parameters to default"
                    >
                        <RotateCcw className="w-3.5 h-3.5 group-hover:-rotate-180 transition-transform duration-500" />
                        Reset Defaults
                    </button>

                    {autoRun ? (
                        <div className="py-3 px-3 rounded-lg border border-dashed border-gray-700 bg-gray-800/30 flex items-center justify-center gap-2 text-xs text-gray-500 select-none">
                            <Zap className="w-3 h-3 text-accent-500 fill-accent-500/20" />
                            <span className="font-medium">Auto-Run Active</span>
                        </div>
                    ) : (
                        <button
                        onClick={handleRunClustering}
                        disabled={isProcessing || readyCount < 2 || tuningState.active}
                        className={`flex items-center justify-center gap-2 py-3 px-3 rounded-lg border transition-colors text-xs font-bold group
                            ${isProcessing || readyCount < 2
                            ? 'border-gray-700 bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200'
                            }`}
                        >
                        {isProcessing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Play className="w-3.5 h-3.5 fill-current group-hover:scale-110 transition-transform" />
                        )}
                        <span>
                            {isProcessing ? 'Processing...' : 'Run Clustering'}
                        </span>

                        {currentPath.length > 0 && !isProcessing && (
                            <span className="text-[9px] bg-black/15 px-1.5 py-0.5 rounded text-emerald-100/80 font-mono uppercase">
                                Sub
                            </span>
                        )}
                        </button>
                    )}
                </div>
                
                {readyCount < 5 && (
                    <p className="text-[10px] text-center text-gray-600">
                        Need at least 5 items for optimization.
                    </p>
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
                  onClear={() => {}}
                  onDrillDown={handleSubCluster}
                  defaultDensity="compact"
                  headerMeta={stats ? (
                    <span className="px-2 py-0.5 rounded-full bg-gray-800 text-xs border border-gray-700 whitespace-nowrap">
                      <span className="text-green-400 font-semibold">{stats.clusters} clusters</span>
                      <span className="text-gray-600 px-1">|</span>
                      <span className="text-orange-400 font-semibold">{stats.noise} noise</span>
                    </span>
                  ) : undefined}
              />
          )}
        </div>
      </div>
    </div>
  );
};

export default ClusteringView;
