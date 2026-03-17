import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InferenceResult, VisSettings, ColormapType } from '../types';
import { computePCA, extractChannel, mapDataToColors, fitPCA, projectPCA, computeChannelRanges, ChannelRange } from '../utils/math';
import { Image as ImageIcon, Settings2, Grid, AlertTriangle } from 'lucide-react';
import SliderField from './SliderField';
import useMediaQuery from '../utils/useMediaQuery';

interface VisualizerProps {
  imageSrc: string | null;
  result: InferenceResult | null;
  isProcessing: boolean;
  globalPcaSamples?: number[][];
  onBuildGlobalPca?: () => void;
  globalPcaSnapshotAt?: number | null;
}


// --- Main Visualizer ---

const Visualizer: React.FC<VisualizerProps> = ({
  imageSrc,
  result,
  isProcessing,
  globalPcaSamples = [],
  onBuildGlobalPca,
  globalPcaSnapshotAt = null
}) => {
  const OPACITY_STEP = 0.005;
  const isMobile = useMediaQuery('(max-width: 767px)');

  const [settings, setSettings] = useState<VisSettings>({
    mode: 'pca',
    components: 3,
    channelIndex: 0,
    colormap: 'rgb',
    opacity: 0.5
  });

  const [showControls, setShowControls] = useState(() => !isMobile);
  const [showPcaInfo, setShowPcaInfo] = useState(false);
  const [useGlobalPca, setUseGlobalPca] = useState(true);

  useEffect(() => {
    setShowControls(!isMobile);
  }, [isMobile]);

  // Validation: Check if patches exist
  const hasPatches = result && result.patches && result.patches.length > 0;
  const embedDim = result?.patches?.[0]?.length || 0;
  const channelMax = Math.max(embedDim - 1, 0);

  const compatibleGlobalSamples = useMemo(() => {
    if (embedDim === 0) return [];
    return globalPcaSamples.filter(row => row.length === embedDim);
  }, [globalPcaSamples, embedDim]);

  const globalPca = useMemo(() => {
    // Require enough samples to avoid unstable global basis
    if (compatibleGlobalSamples.length < 32) return null;
    const model = fitPCA(compatibleGlobalSamples, 3);
    if (model.components.length === 0) return null;
    const projected = projectPCA(compatibleGlobalSamples, model, 3);
    const channelRanges = computeChannelRanges(projected);
    return {
      model,
      channelRanges,
      sampleCount: compatibleGlobalSamples.length
    };
  }, [compatibleGlobalSamples]);

  const snapshotTimeLabel = useMemo(() => {
    if (!globalPcaSnapshotAt) return null;
    return new Date(globalPcaSnapshotAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }, [globalPcaSnapshotAt]);

  // Compute Data (Memoized)
  const computedData = useMemo(() => {
    if (!result || !hasPatches) return { colors: [] };

    let processedData: number[][];
    let fixedRanges: ChannelRange[] | undefined;

    if (settings.mode === 'pca') {
      if (useGlobalPca && globalPca) {
        processedData = projectPCA(result.patches, globalPca.model, settings.components);
        fixedRanges = globalPca.channelRanges.slice(0, settings.components);
      } else {
        processedData = computePCA(result.patches, settings.components);
      }
    } else {
      processedData = extractChannel(result.patches, settings.channelIndex);
    }

    const colors = mapDataToColors(processedData, settings.colormap, fixedRanges);
    return { colors };
  }, [result, hasPatches, settings.mode, settings.components, settings.channelIndex, settings.colormap, useGlobalPca, globalPca]);

  // --- 2D Canvas rendering ---
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Load source image
  useEffect(() => {
    if (!imageSrc) { setImgLoaded(false); return; }
    const img = new Image();
    img.onload = () => { imgRef.current = img; setImgLoaded(true); };
    img.onerror = () => { imgRef.current = null; setImgLoaded(false); };
    img.src = imageSrc;
    setImgLoaded(false);
    return () => { img.onload = null; img.onerror = null; };
  }, [imageSrc]);

  // Paint canvas whenever data or settings change
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const img = imgRef.current;
    if (!canvas || !container) return;

    // Wait for image to load before painting to prevent flash
    if (imageSrc && !imgLoaded) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, cw, ch);

    // Compute fitting rect (contain)
    let drawW = cw, drawH = ch, dx = 0, dy = 0;
    if (img && imgLoaded) {
      const imgAspect = img.naturalWidth / img.naturalHeight;
      const boxAspect = cw / ch;
      if (imgAspect > boxAspect) {
        drawW = cw; drawH = cw / imgAspect;
      } else {
        drawH = ch; drawW = ch * imgAspect;
      }
      dx = (cw - drawW) / 2;
      dy = (ch - drawH) / 2;

      // Draw source image
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    // Draw patch overlay
    if (result && hasPatches && computedData.colors.length > 0) {
      const { width: gridW, height: gridH } = result.dimensions;
      const patchW = drawW / gridW;
      const patchH = drawH / gridH;

      ctx.globalAlpha = settings.opacity;
      for (let i = 0; i < computedData.colors.length; i++) {
        const rgb = computedData.colors[i] || [0, 0, 0];
        const x = i % gridW;
        const y = Math.floor(i / gridW);
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillRect(dx + x * patchW, dy + y * patchH, patchW + 0.5, patchH + 0.5); // +0.5 to avoid sub-pixel gaps
      }
      ctx.globalAlpha = 1;
    }
  }, [imgLoaded, result, hasPatches, computedData.colors, settings.opacity]);

  useEffect(() => { paint(); }, [paint]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => paint());
    ro.observe(container);
    return () => ro.disconnect();
  }, [paint]);

  if (!imageSrc) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-gray-950/50">
        <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
        <p>Upload an image to start analysis</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-800 group">
      
      {/* 2D Canvas */}
      <div ref={containerRef} className="flex-1 w-full h-full min-h-0">
        <canvas ref={canvasRef} className="block w-full h-full" />
      </div>

      {/* Warning for Missing Patches (Imported Embeddings) */}
      {result && !hasPatches && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur border border-red-500/30 p-6 rounded-xl flex flex-col items-center text-center max-w-sm pointer-events-none">
              <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
              <h3 className="text-white font-bold mb-1">Visualization Unavailable</h3>
              <p className="text-sm text-gray-400">
                  This embedding does not contain patch-level data. This usually happens with imported embeddings that were exported without patches to save space.
              </p>
              <p className="text-xs text-gray-500 mt-2">Clustering is still available.</p>
          </div>
      )}

      {/* Floating Controls Overlay - Responsive Width */}
      {result && hasPatches && (
        <div className={`absolute top-2 md:top-4 left-2 right-2 md:left-auto md:right-4 md:w-72 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-xl transition-all duration-300 z-30 ${showControls ? 'translate-y-0 md:translate-x-0 opacity-100' : 'translate-y-2 md:translate-y-0 md:translate-x-[110%] opacity-0 pointer-events-none'}`}>
          <div className="p-3 border-b border-gray-700 flex justify-between items-center">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
               <Settings2 className="w-4 h-4" /> Visualization Controls
            </h3>
            <button onClick={() => setShowControls(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
                <Settings2 className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-4 space-y-5 text-xs max-h-[65dvh] md:max-h-[60vh] overflow-y-auto">
             
             {/* Mode Select */}
             <div className="flex bg-gray-800 rounded p-1">
               <button 
                 onClick={() => setSettings(s => ({ ...s, mode: 'pca', components: 3, colormap: 'rgb' }))}
                 className={`flex-1 py-1.5 rounded text-center transition-colors ${settings.mode === 'pca' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
               >
                 PCA
               </button>
               <button 
                 onClick={() => setSettings(s => ({ ...s, mode: 'channel', colormap: 'viridis' }))}
                 className={`flex-1 py-1.5 rounded text-center transition-colors ${settings.mode === 'channel' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
               >
                 Channel
               </button>
             </div>

             {/* Channel Slider */}
             {settings.mode === 'channel' && (
               <SliderField
                 className="animate-fadeIn"
                 label="Feature Channel"
                 value={settings.channelIndex}
                 min={0}
                 max={channelMax}
                 step={1}
                 valueText={`#${settings.channelIndex}`}
                 valueClassName="font-mono text-accent-400"
                 onChange={(next) => setSettings(s => ({ ...s, channelIndex: Math.round(next) }))}
                 ariaLabel="Feature channel"
                 showBounds
                 minLabel="0"
                 maxLabel={channelMax}
               />
             )}

             {/* PCA Components */}
             {settings.mode === 'pca' && (
               <div className="space-y-2 animate-fadeIn">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-1.5">
                     <span className="text-gray-400">Components</span>
                     <button
                       onClick={() => setShowPcaInfo(v => !v)}
                       className={`w-4 h-4 flex items-center justify-center rounded-full border transition-colors ${showPcaInfo ? 'border-accent-500 text-accent-400 bg-accent-500/10' : 'border-gray-700 text-gray-500 hover:text-white hover:border-gray-500'}`}
                       title="How PCA view works"
                       aria-label="How PCA view works"
                     >
                       i
                     </button>
                   </div>
                   <div className="flex gap-1">
                     <button 
                       onClick={() => setSettings(s => ({ ...s, components: 1, colormap: 'viridis' }))}
                       className={`px-2 py-1 rounded border ${settings.components === 1 ? 'border-accent-500 text-accent-400 bg-accent-500/10' : 'border-gray-700 text-gray-500'}`}
                     >1</button>
                     <button 
                       onClick={() => setSettings(s => ({ ...s, components: 3, colormap: 'rgb' }))}
                       className={`px-2 py-1 rounded border ${settings.components === 3 ? 'border-accent-500 text-accent-400 bg-accent-500/10' : 'border-gray-700 text-gray-500'}`}
                     >3</button>
                   </div>
                 </div>

                 <div className="flex items-center justify-between gap-2">
                   <span className="text-gray-500 text-[11px]">Color basis</span>
                   <div className="flex items-center gap-2">
                     {onBuildGlobalPca && (
                       <button
                         onClick={onBuildGlobalPca}
                         className="px-2 py-1 rounded border text-[11px] border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
                         title="Build or refresh dataset-level PCA snapshot"
                       >
                         {globalPca ? 'Refresh' : 'Build'}
                       </button>
                     )}
                     <button
                       onClick={() => setUseGlobalPca(v => !v)}
                       disabled={!globalPca}
                       className={`px-2 py-1 rounded border text-[11px] transition-colors ${
                         useGlobalPca && globalPca
                           ? 'border-accent-500 text-accent-400 bg-accent-500/10'
                           : globalPca
                             ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
                             : 'border-gray-800 text-gray-600 cursor-not-allowed'
                       }`}
                       title={globalPca ? 'Toggle dataset-level PCA basis' : 'Build a global PCA snapshot first'}
                     >
                       Global PCA
                     </button>
                   </div>
                 </div>

                 {globalPca && (
                   <p className="text-[10px] text-gray-500">
                     Using {globalPca.sampleCount} sampled patches for dataset-level PCA.
                   </p>
                 )}
                 {!globalPca && (
                   <p className="text-[10px] text-gray-600">
                     Global PCA is unavailable until a snapshot is built with enough patch data.
                   </p>
                 )}
                 {snapshotTimeLabel && (
                   <p className="text-[10px] text-gray-600">
                     Snapshot updated at {snapshotTimeLabel}.
                   </p>
                 )}

                 {showPcaInfo && (
                   <div className="rounded-md border border-gray-700 bg-gray-950/70 p-2.5 text-[11px] leading-relaxed text-gray-300 space-y-1">
                     <p>Local PCA computes axes per image, so colors can shift between images.</p>
                     <p>Global PCA fits one dataset-level basis and fixed ranges, then reuses them everywhere.</p>
                     <p><span className="text-gray-200 font-semibold">3 components:</span> PC1/PC2/PC3 are mapped to RGB.</p>
                     <p><span className="text-gray-200 font-semibold">1 component:</span> PC1 is mapped through the selected colormap.</p>
                   </div>
                 )}
               </div>
             )}

             {/* Colormap */}
             {(settings.mode === 'channel' || settings.components === 1) && (
                <div className="space-y-1">
                  <span className="text-gray-400 block mb-1">Colormap</span>
                  <div className="grid grid-cols-5 gap-1">
                    {['viridis', 'plasma', 'inferno', 'magma', 'grayscale'].map(cm => (
                       <button
                         key={cm}
                         onClick={() => setSettings(s => ({ ...s, colormap: cm as ColormapType }))}
                         title={cm}
                         className={`h-4 rounded-sm border transition-all ${settings.colormap === cm ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'}`}
                         style={{ background: `linear-gradient(to right, ${getGradientColors(cm)})` }}
                       />
                    ))}
                  </div>
                </div>
             )}

             <div className="h-px bg-gray-700 my-2"></div>

             {/* Overlay Opacity */}
             <SliderField
               label={<span className="flex items-center gap-1"><Grid className="w-3 h-3" /> Overlay Opacity</span>}
               value={settings.opacity}
               min={0}
               max={1}
               step={OPACITY_STEP}
               valueFormatter={(v) => `${(v * 100).toFixed(0)}%`}
               thresholdScale={0.8}
               precisionPower={1.5}
               minPrecisionScale={0.005}
               fineStepMultiplier={0.1}
               onChange={(next) => setSettings(s => ({ ...s, opacity: next }))}
               ariaLabel="Overlay opacity"
             />

          </div>
        </div>
      )}

      {/* Toggle Button for Controls */}
      {result && hasPatches && (
          <button 
            onClick={() => setShowControls(!showControls)}
            className="absolute top-4 right-2 md:right-4 p-2 bg-gray-800 text-gray-400 rounded-lg border border-gray-700 hover:text-white hover:bg-gray-700 z-10"
            title="Toggle Controls"
          >
            <Settings2 className="w-5 h-5" />
          </button>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <span className="text-sm font-medium text-accent-100 animate-pulse">Running Inference...</span>
          </div>
        </div>
      )}
      
      {/* Stats Footer */}
      {result && hasPatches && (
        <div className="absolute bottom-0 left-0 right-0 bg-gray-900/90 border-t border-gray-800 px-4 py-2 flex justify-between items-center text-xs text-gray-400 backdrop-blur-sm z-10 pointer-events-none">
           <div className="flex gap-4">
              <span>Grid: {result.dimensions.width}x{result.dimensions.height}</span>
              <span className="hidden md:inline">Patches: {result.patches.length}</span>
              <span className="hidden md:inline">Embed Dim: {embedDim}</span>
           </div>
           <span className="text-accent-400 text-[11px]">2D Overlay</span>
        </div>
      )}
    </div>
  );
};

// Helper for CSS Gradients in UI
function getGradientColors(name: string) {
  if (name === 'viridis') return '#440154, #3b528b, #21918c, #5ec962, #fde725';
  if (name === 'inferno') return '#000004, #57106d, #bb3754, #f98e09, #fcffa4';
  if (name === 'plasma') return '#0d0887, #7e03a8, #cc4778, #f89540, #f0f921';
  if (name === 'magma') return '#000004, #511c74, #b73779, #fc8961, #fcfdbf';
  if (name === 'grayscale') return '#000, #fff';
  return '#000, #fff';
}

export default Visualizer;
