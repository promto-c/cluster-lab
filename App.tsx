

import React, { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ModelSetup from './components/steps/ModelSetup';
import DatasetUpload from './components/steps/DatasetUpload';
import EmbeddingStudio from './components/steps/EmbeddingStudio';
import ClusteringView from './components/ClusteringView';

import { ModelConfig, ModelSource, ProcessingStatus, InferenceResult, LogEntry, GalleryItem, AppStep, ResizeMethod, PadStyle } from './types';
import { DEFAULT_REMOTE_ONNX_FILE, loadModel, runInference as runDinoInference, type ModelDownloadProgressEntry } from './services/dinoService';
import { runClassicalInference } from './services/classicalService';
import { generateThumbnail } from './utils/imageProcessing';
import { Terminal, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';

const App: React.FC = () => {
  // --- Global State ---
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.INITIALIZE);
  const [isStandalonePwa, setIsStandalonePwa] = useState(false);
  
  const [config, setConfig] = useState<ModelConfig>({
    source: ModelSource.HUGGINGFACE,
    repoId: 'Xenova/dinov2-small',
    variant: 'v2-small',
    localFiles: [],
    remoteOnnxFile: DEFAULT_REMOTE_ONNX_FILE,
    classical: {
      colorHistogram: true,
      lbp: false,
      glcm: false,
      hog: false
    },
    preprocessing: {
      resizeMethod: ResizeMethod.PAD, // Default to standard Center Crop behavior
      padStyle: PadStyle.BLUR,
      padColor: '#000000'
    }
  });
  
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [logProgress, setLogProgress] = useState<{ mode: 'cluster' | 'tune'; value: number; message: string } | null>(null);
  const [modelDownloadProgress, setModelDownloadProgress] = useState<ModelDownloadProgressEntry[]>([]);
  const activeRunControllerRef = useRef<AbortController | null>(null);
  const singleRunTargetIdRef = useRef<string | null>(null);
  const galleryImagesRef = useRef<GalleryItem[]>([]);
  const suppressNextEmbeddingsReadyRebuildRef = useRef(false);

  // --- Data State ---
  const [galleryImages, setGalleryImages] = useState<GalleryItem[]>([]);
  const [selectedGalleryId, setSelectedGalleryId] = useState<string | null>(null);
  const [globalPcaSamples, setGlobalPcaSamples] = useState<number[][]>([]);
  const [globalPcaSnapshotAt, setGlobalPcaSnapshotAt] = useState<number | null>(null);
  
  // Derive Selection and Result from Source of Truth (galleryImages)
  // This ensures that when galleryImages updates (e.g. via JSON import), the UI reflects it immediately.
  const selectedItem = galleryImages.find(i => i.id === selectedGalleryId) || null;
  const result = selectedItem?.result || null;
  const imageSrc = selectedItem?.url || null;

  // --- Helper: Logging ---
  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const clearLogs = () => setLogs([]);

  const upsertModelDownloadProgress = useCallback((entry: ModelDownloadProgressEntry) => {
    setModelDownloadProgress(prev => {
      const index = prev.findIndex(item => item.id === entry.id);
      if (index === -1) return [...prev, entry];
      const next = [...prev];
      next[index] = entry;
      return next;
    });
  }, []);

  useEffect(() => {
    galleryImagesRef.current = galleryImages;
  }, [galleryImages]);

  const sampleGlobalPcaPatches = useCallback((items: GalleryItem[]) => {
    const sampled: number[][] = [];
    const MAX_TOTAL_PATCHES = 4096;
    const MAX_PATCHES_PER_IMAGE = 192;

    for (const item of items) {
      if (!item.result?.patches || item.result.patches.length === 0) continue;
      const patches = item.result.patches;
      const step = Math.max(1, Math.floor(patches.length / MAX_PATCHES_PER_IMAGE));

      for (let i = 0; i < patches.length; i += step) {
        sampled.push(patches[i]);
        if (sampled.length >= MAX_TOTAL_PATCHES) return sampled;
      }
    }

    return sampled;
  }, []);

  const rebuildGlobalPcaSamples = useCallback((reason: string, itemsOverride?: GalleryItem[]) => {
    const sampled = sampleGlobalPcaPatches(itemsOverride ?? galleryImagesRef.current);
    setGlobalPcaSamples(sampled);
    setGlobalPcaSnapshotAt(Date.now());

    if (sampled.length >= 32) {
      addLog(`Global PCA snapshot updated (${reason}) with ${sampled.length} sampled patches.`, 'info');
      return;
    }
    if (sampled.length > 0) {
      addLog(`Global PCA snapshot updated (${reason}) with ${sampled.length} sampled patches (need >= 32 for stable basis).`, 'info');
      return;
    }
    addLog(`Global PCA snapshot updated (${reason}) but no patch-level data was available.`, 'info');
  }, [addLog, sampleGlobalPcaPatches]);

  const handleStopRun = useCallback(() => {
    const controller = activeRunControllerRef.current;
    if (controller && !controller.signal.aborted) {
      controller.abort();
      singleRunTargetIdRef.current = null;
      addLog('Stop requested. Finishing current item...', 'info');
    }
  }, [addLog]);

  // --- Logic: Model Status ---
  const isModelLoaded = status === 'ready' || status === 'batch_processing' || status === 'clustering' || (status === 'idle' && logs.some(l => l.message.includes('Model loaded successfully') || l.message.includes('Algorithms Configured')));
  // Using a simpler heuristic: if we ever hit 'ready' after load, we are good.
  const [modelReady, setModelReady] = useState(false);

  // --- Background Thumbnail Generation ---
  const generateThumbnails = useCallback(async (items: GalleryItem[]) => {
      const CHUNK_SIZE = 5;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
          const chunk = items.slice(i, i + CHUNK_SIZE);
          const updates = await Promise.all(chunk.map(async (item) => {
              // Skip if already has thumbnail
              if (item.thumbnailUrl) return null;
              try {
                  const url = await generateThumbnail(item.file, 256);
                  return { id: item.id, url };
              } catch (e) {
                  return null;
              }
          }));
          
          const validUpdates = updates.filter((u): u is {id: string, url: string} => u !== null);
          if (validUpdates.length > 0) {
              setGalleryImages(prev => {
                  const map = new Map(validUpdates.map(u => [u.id, u.url]));
                  return prev.map(p => map.has(p.id) ? { ...p, thumbnailUrl: map.get(p.id) } : p);
              });
          }
          await new Promise(r => setTimeout(r, 20)); // Yield to main thread
      }
  }, []);

  // --- Logic: Workspace Selection (Files) ---
  const handleWorkspaceSelect = useCallback(async (fileList: FileList) => {
    const images: GalleryItem[] = [];
    const modelFiles: File[] = [];
    let imageCount = 0;

    addLog(`Scanning ${fileList.length} files...`, 'info');

    Array.from(fileList).forEach(file => {
      const fileName = file.name.toLowerCase();
      
      // Check for Images
      if (file.type.startsWith('image/')) {
        const url = URL.createObjectURL(file);
        images.push({
          id: file.name + '-' + Date.now() + Math.random(),
          name: file.name,
          url,
          file,
          status: 'idle',
          enabled: true,
          clusterPath: []
        });
        imageCount++;
      }

      // Check for Model Files
      if (fileName.endsWith('.onnx') || fileName.endsWith('.json') || fileName.endsWith('.bin')) {
        modelFiles.push(file);
      }
    });

    // Update Images
    if (imageCount > 0) {
      setGalleryImages(prev => {
        // Only keep previous if we are appending? Let's just append for now.
        return [...prev, ...images];
      });
      addLog(`Added ${imageCount} images to dataset.`, 'success');
      
      // Start background thumbnail generation
      generateThumbnails(images);
    }

    // Update Model Files (Merged)
    if (modelFiles.length > 0) {
      setConfig(prev => {
        // If we are already in LOCAL mode, merge with existing files to allow adding missing ones.
        // If switching from HF, we start fresh with these files, but since we are accumulating,
        // we essentially treat "LOCAL" as a bucket of files.
        
        const existingFiles = (prev.source === ModelSource.LOCAL && prev.localFiles) ? prev.localFiles : [];
        
        // Use Map to deduplicate by name, preferring the new files
        const fileMap = new Map<string, File>();
        existingFiles.forEach(f => fileMap.set(f.name, f));
        modelFiles.forEach(f => fileMap.set(f.name, f));
        
        const mergedFiles = Array.from(fileMap.values());
        
        return { 
           ...prev, 
           localFiles: mergedFiles, 
           source: ModelSource.LOCAL, 
           // Maintain fileName if it still exists in the merged list, or let auto-detect handle it
           fileName: prev.fileName 
        };
      });
      addLog(`Processed ${modelFiles.length} model files.`, 'success');
    }

  }, [addLog, generateThumbnails]);

  // --- Logic: Image Selection ---
  const handleGallerySelect = (item: GalleryItem | null) => {
    setSelectedGalleryId(item?.id || null);
  };

  const handleEmbeddingsImported = useCallback((nextImages: GalleryItem[], matchCount: number) => {
    if (matchCount <= 0) return;
    suppressNextEmbeddingsReadyRebuildRef.current = true;
    rebuildGlobalPcaSamples('JSON import', nextImages);
  }, [rebuildGlobalPcaSamples]);

  // --- Logic: Load Model ---
  const handleLoadModel = async () => {
    setStatus('loading_model');
    setModelDownloadProgress([]);
    try {
      if (config.source === ModelSource.CLASSICAL) {
        // No heavy lifting for classical, just state transition
        await new Promise(r => setTimeout(r, 500)); // Fake small delay
        setStatus('ready');
        setModelReady(true);
        addLog('Classical Computer Vision Algorithms Configured.', 'success');
        setTimeout(() => setCurrentStep(AppStep.DATASET), 500);
        return;
      }

      const isLocal = config.source === ModelSource.LOCAL;
      const filesToLoad = isLocal ? config.localFiles : undefined;
      
      await loadModel(
        config.repoId,
        (msg) => addLog(msg, 'info'),
        filesToLoad,
        config.remoteOnnxFile,
        config.fileName,
        upsertModelDownloadProgress
      );
      
      setStatus('ready');
      setModelReady(true);
      addLog('Model loaded successfully. Ready for Step 2.', 'success');
      
      // Auto-advance to dataset step after short delay
      setTimeout(() => setCurrentStep(AppStep.DATASET), 1000);
      
    } catch (error: any) {
      setStatus('error');
      setModelReady(false);
      addLog(`Error loading model: ${error.message}`, 'error');
    }
  };

  // --- Logic: Run Inference (Single & Batch) ---
  const runSingle = async (file: File, signal?: AbortSignal) => {
     try {
       setStatus('processing');
       if (signal?.aborted) {
         setStatus('ready');
         return null;
       }
       let res: InferenceResult;

       if (config.source === ModelSource.CLASSICAL) {
          const classicalConfig = config.classical || { colorHistogram: true, lbp: false, glcm: false, hog: false };
          res = await runClassicalInference(file, classicalConfig, signal);
       } else {
          // Pass preprocessing config
          res = await runDinoInference(file, config.preprocessing, signal);
       }

       if (signal?.aborted) {
         setStatus('ready');
         return null;
       }
       setStatus('ready');
       return res;
     } catch (e: any) {
       if (e?.name === 'AbortError' || signal?.aborted) {
         setStatus('ready');
         return null;
       }
       setStatus('ready');
       const message = typeof e?.message === 'string' ? e.message : 'Inference failed.';
       addLog(`Failed to process ${file.name}: ${message}`, 'error');
       return null;
     }
  };

  const handleRunAll = async () => {
    if (!modelReady) return;
    if (activeRunControllerRef.current && !activeRunControllerRef.current.signal.aborted) return;

    const controller = new AbortController();
    const signal = controller.signal;
    activeRunControllerRef.current = controller;

    setStatus('batch_processing');
    addLog('Starting batch embedding generation...', 'info');

    try {
      // Filter items
      const pendingItems = galleryImages.filter(img => img.status !== 'cached' && img.enabled !== false);
      
      if (pendingItems.length === 0) {
          addLog('All enabled images already processed.', 'info');
          setStatus('ready');
          return;
      }

      const CHUNK_SIZE = 4; // Process in batches to balance speed and UI responsiveness

      for (let i = 0; i < pendingItems.length; i += CHUNK_SIZE) {
          if (signal.aborted) break;

          const chunk = pendingItems.slice(i, i + CHUNK_SIZE);
          
          // 1. Mark chunk as processing
          setGalleryImages(prev => prev.map(img => 
               chunk.some(c => c.id === img.id) ? { ...img, status: 'processing' } : img
          ));
          
          // Visual feedback for the first item in chunk if needed
          if (i === 0 && chunk.length > 0 && !selectedGalleryId) {
               handleGallerySelect(chunk[0]);
          }

          // 2. Run Inference in Parallel
          const chunkResults = await Promise.all(chunk.map(async (item) => {
              try {
                  if (signal.aborted) {
                    return { id: item.id, result: null, error: null, aborted: true };
                  }

                  let res: InferenceResult;
                  if (config.source === ModelSource.CLASSICAL) {
                     const classicalConfig = config.classical || { colorHistogram: true, lbp: false, glcm: false, hog: false };
                     res = await runClassicalInference(item.file, classicalConfig, signal);
                  } else {
                     res = await runDinoInference(item.file, config.preprocessing, signal);
                  }

                  if (signal.aborted) {
                    return { id: item.id, result: null, error: null, aborted: true };
                  }

                  return { id: item.id, result: res, error: null, aborted: false };
              } catch (e: any) {
                  if (e?.name === 'AbortError' || signal.aborted) {
                    return { id: item.id, result: null, error: null, aborted: true };
                  }
                  return { id: item.id, result: null, error: e.message, aborted: false };
              }
          }));

          // 3. Update Results
          setGalleryImages(prev => prev.map(img => {
              const res = chunkResults.find(r => r.id === img.id);
              if (res) {
                  if (res.aborted) return { ...img, status: img.result ? 'cached' : 'idle' };
                  if (res.error) return { ...img, status: 'error' };
                  return { ...img, status: 'cached', result: res.result! };
              }
              return img;
          }));

          if (signal.aborted) break;

          // Small yield to allow UI to paint
          await new Promise(resolve => setTimeout(resolve, 20));
      }

      setStatus('ready');
      if (signal.aborted) {
        addLog('Embedding run stopped.', 'info');
      } else {
        addLog('Batch processing complete. Ready for Clustering.', 'success');
      }
    } finally {
      if (activeRunControllerRef.current === controller) {
        activeRunControllerRef.current = null;
      }
    }
  };

  // Auto-run inference when selecting an item that hasn't been processed
  useEffect(() => {
    if (
      currentStep === AppStep.EMBED &&
      status === 'ready' &&
      selectedItem &&
      !selectedItem.result &&
      selectedItem.status !== 'error'
    ) {
        if (selectedItem.enabled === false) return; // Don't run disabled
        if (
          singleRunTargetIdRef.current === selectedItem.id &&
          activeRunControllerRef.current &&
          !activeRunControllerRef.current.signal.aborted
        ) {
          return;
        }

        // If user switched selection while a single run is in flight, stop the previous target.
        if (
          singleRunTargetIdRef.current &&
          singleRunTargetIdRef.current !== selectedItem.id &&
          activeRunControllerRef.current &&
          !activeRunControllerRef.current.signal.aborted
        ) {
          activeRunControllerRef.current.abort();
        }

        const controller = new AbortController();
        const targetId = selectedItem.id;
        activeRunControllerRef.current = controller;
        singleRunTargetIdRef.current = targetId;

        setGalleryImages(prev => prev.map(img =>
          img.id === targetId ? { ...img, status: 'processing' } : img
        ));

        const run = async () => {
           const res = await runSingle(selectedItem.file, controller.signal);
           if (!controller.signal.aborted) {
             setGalleryImages(prev => prev.map(img => {
               if (img.id !== targetId) return img;
               if (res) {
                 return { ...img, status: 'cached', result: res };
               }
               return { ...img, status: 'error' };
             }));
           }
           if (activeRunControllerRef.current === controller) {
             activeRunControllerRef.current = null;
           }
           if (singleRunTargetIdRef.current === targetId) {
             singleRunTargetIdRef.current = null;
           }
        }
        run();
    }
  }, [selectedItem, currentStep, status, selectedGalleryId]);


  // --- Step Completion Tracking ---
  const datasetReady = galleryImages.length > 0;
  const enabledItems = galleryImages.filter(i => i.enabled !== false);
  const embeddingsReady = enabledItems.length > 0 && enabledItems.every(i => i.status === 'cached');
  const previousEmbeddingsReadyRef = useRef(false);

  useEffect(() => {
    if (
      embeddingsReady &&
      !previousEmbeddingsReadyRef.current &&
      !suppressNextEmbeddingsReadyRebuildRef.current
    ) {
      rebuildGlobalPcaSamples('all embeddings complete');
    }
    suppressNextEmbeddingsReadyRebuildRef.current = false;
    previousEmbeddingsReadyRef.current = embeddingsReady;
  }, [embeddingsReady, rebuildGlobalPcaSamples]);

  useEffect(() => {
    if (galleryImages.length > 0) return;
    setGlobalPcaSamples(prev => (prev.length === 0 ? prev : []));
    setGlobalPcaSnapshotAt(prev => (prev === null ? prev : null));
  }, [galleryImages.length]);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const updateDisplayMode = () => {
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsStandalonePwa(standaloneMedia.matches || iosStandalone);
    };
    const mediaListener = updateDisplayMode as EventListener;

    updateDisplayMode();
    if (typeof standaloneMedia.addEventListener === 'function') {
      standaloneMedia.addEventListener('change', mediaListener);
    } else {
      standaloneMedia.addListener(updateDisplayMode);
    }
    window.addEventListener('appinstalled', updateDisplayMode);

    return () => {
      if (typeof standaloneMedia.removeEventListener === 'function') {
        standaloneMedia.removeEventListener('change', mediaListener);
      } else {
        standaloneMedia.removeListener(updateDisplayMode);
      }
      window.removeEventListener('appinstalled', updateDisplayMode);
    };
  }, []);

  useEffect(() => {
    document.title = isStandalonePwa ? `ClusterLab v${__APP_VERSION__}` : 'ClusterLab';
  }, [isStandalonePwa]);

  useEffect(() => {
    if (currentStep !== AppStep.CLUSTER) {
      setLogProgress(null);
    }
  }, [currentStep]);
  
  const completedSteps = [
    modelReady,          // Init
    datasetReady,        // Dataset
    embeddingsReady,     // Embed
    false                // Cluster (Always repeatable)
  ];

  // --- Render ---
  return (
    // Responsive Layout: flex-col-reverse on mobile (Sidebar at bottom), flex-row on desktop (Sidebar at left)
    <div className="flex flex-col-reverse md:flex-row h-dvh min-h-dvh bg-gray-950 text-gray-100 font-sans overflow-hidden">
      
      <Sidebar 
        currentStep={currentStep} 
        setStep={setCurrentStep}
        completedSteps={completedSteps}
        hideBrandHeader={isStandalonePwa}
      />

      <main className="flex-1 flex flex-col min-w-0 min-h-0 h-full relative">
        
        {/* Step Content Area */}
        <div className="flex-1 p-2 sm:p-3 md:p-6 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {currentStep === AppStep.INITIALIZE && (
            <ModelSetup 
              config={config} 
              onConfigChange={setConfig} 
              onLoadModel={handleLoadModel}
              onWorkspaceSelect={handleWorkspaceSelect}
              status={status}
              modelDownloadProgress={modelDownloadProgress}
            />
          )}

          {currentStep === AppStep.DATASET && (
            <DatasetUpload 
              images={galleryImages} 
              setImages={setGalleryImages} 
              onWorkspaceSelect={handleWorkspaceSelect}
              onSelectImage={handleGallerySelect}
              onRunAll={handleRunAll}
              onStopRun={handleStopRun}
              isProcessing={status === 'batch_processing' || status === 'processing'}
              onEmbeddingsImported={handleEmbeddingsImported}
            />
          )}

          {currentStep === AppStep.EMBED && (
            <EmbeddingStudio 
              images={galleryImages}
              setImages={setGalleryImages}
              selectedItem={selectedItem}
              onSelect={handleGallerySelect}
              result={result}
              imageSrc={imageSrc}
              isProcessing={status === 'processing' || status === 'batch_processing'}
              onRunAll={handleRunAll}
              onStopRun={handleStopRun}
              preprocessingConfig={config.preprocessing}
              globalPcaSamples={globalPcaSamples}
              onBuildGlobalPca={() => rebuildGlobalPcaSamples('manual refresh')}
              globalPcaSnapshotAt={globalPcaSnapshotAt}
            />
          )}

          {currentStep === AppStep.CLUSTER && (
            <ClusteringView 
              items={galleryImages}
              onUpdateItems={setGalleryImages}
              isProcessing={status === 'clustering'}
              setIsProcessing={(val) => setStatus(val ? 'clustering' : 'ready')}
              onLog={addLog}
              onProgressUpdate={setLogProgress}
            />
          )}
        </div>

        {/* Logs Panel - Collapsible */}
        <div className={`relative flex flex-col bg-gray-900 border-t border-gray-800 shrink-0 transition-all duration-300 ease-in-out pb-[max(env(safe-area-inset-bottom),0px)] md:pb-0 ${showLogs ? 'h-48' : 'h-9'}`}>
           {!showLogs && logProgress && (
             <div className="absolute left-0 top-0 z-10 h-px w-full bg-gray-800 pointer-events-none">
               <div
                 className="h-full bg-accent-500 transition-all duration-200"
                 style={{ width: `${Math.max(0, Math.min(100, logProgress.value))}%` }}
               />
             </div>
           )}

           <div className="px-3 sm:px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between cursor-pointer hover:bg-gray-800/50" onClick={() => setShowLogs(!showLogs)}>
              <div className="flex items-center gap-2 text-xs font-mono text-gray-500 uppercase overflow-hidden flex-1 mr-4">
                <Terminal className="w-3 h-3 shrink-0" /> 
                <span className="shrink-0 font-bold">System Logs</span>
                
                {/* Show recent log line when minimized */}
                {!showLogs && logs.length > 0 && (
                   <div className="flex items-center overflow-hidden min-w-0 flex-1">
                      <span className="text-gray-700 mx-2 shrink-0">|</span>
                      <span className={`truncate font-normal normal-case ${
                         logs[logs.length - 1].type === 'error' ? 'text-red-400' : 
                         logs[logs.length - 1].type === 'success' ? 'text-green-400' : 'text-gray-500'
                      }`}>
                         {logs[logs.length - 1].message}
                      </span>
                   </div>
                )}
              </div>

              <div className="flex items-center gap-4 shrink-0">
                 <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${status === 'ready' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : status === 'idle' ? 'bg-gray-500' : 'bg-accent-500 animate-pulse'}`}></span>
                    <span className="text-xs text-gray-500 uppercase hidden sm:inline">{status.replace('_', ' ')}</span>
                 </div>
                 
                 <div className="flex items-center gap-2 border-l border-gray-800 pl-4">
                     <button onClick={(e) => { e.stopPropagation(); clearLogs(); }} className="text-gray-600 hover:text-gray-400 p-1 rounded" title="Clear Logs">
                        <Trash2 className="w-3 h-3" />
                     </button>
                     <button className="text-gray-500 hover:text-white transition-colors">
                        {showLogs ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                     </button>
                 </div>
              </div>
           </div>

           <div className="flex-1 overflow-y-auto p-3 font-mono text-[10px] space-y-1 scrollbar-thin bg-gray-950">
               {logProgress && (
                 <div className="mb-2 pb-2 border-b border-gray-800">
                   <div className="flex items-center justify-between gap-2 text-gray-500 mb-1">
                     <span className="truncate normal-case">
                       {logProgress.mode === 'tune' ? 'Smart tune' : 'Clustering'}: {logProgress.message}
                     </span>
                     <span className="shrink-0 text-accent-400 font-bold">{logProgress.value}%</span>
                   </div>
                   <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                     <div
                       className="h-full bg-accent-500 transition-all duration-200"
                       style={{ width: `${Math.max(0, Math.min(100, logProgress.value))}%` }}
                     />
                   </div>
                 </div>
               )}
               {logs.length === 0 && <span className="text-gray-700 italic">No activity recorded.</span>}
               {logs.slice().reverse().map((log, idx) => (
                 <div key={idx} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : 'text-gray-500'}`}>
                   <span className="shrink-0 opacity-50">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span>
                   <span className="break-all">{log.message}</span>
                 </div>
               ))}
           </div>
        </div>

      </main>
    </div>
  );
};

export default App;
