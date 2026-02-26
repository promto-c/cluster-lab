

import React, { useEffect, useState } from 'react';
import { GalleryItem, InferenceResult, PreprocessingConfig } from '../../types';
import Visualizer from '../Visualizer';
import Gallery from '../Gallery';
import ClusteringView from '../ClusteringView';
import { processImageForDisplay } from '../../utils/imageProcessing';
import { Network, ChevronUp, ChevronDown } from 'lucide-react';

interface ClusteringViewProps {
  items: GalleryItem[];
  onUpdateItems: (items: GalleryItem[]) => void;
  isProcessing: boolean;
  setIsProcessing: (val: boolean) => void;
  onLog?: (message: string, type?: 'info' | 'success' | 'error') => void;
  onProgressUpdate?: (progress: { mode: 'cluster' | 'tune'; value: number; message: string } | null) => void;
}

interface EmbeddingStudioProps {
  images: GalleryItem[];
  setImages: (items: GalleryItem[]) => void;
  selectedItem: GalleryItem | null;
  onSelect: (item: GalleryItem | null) => void;
  result: InferenceResult | null;
  imageSrc: string | null;
  isProcessing: boolean;
  onRunAll: () => void;
  onStopRun?: () => void;
  preprocessingConfig: PreprocessingConfig;
  globalPcaSamples: number[][];
  onBuildGlobalPca: () => void;
  globalPcaSnapshotAt: number | null;
  clusteringProps?: ClusteringViewProps;
}

const EmbeddingStudio: React.FC<EmbeddingStudioProps> = ({ 
  images, 
  setImages,
  selectedItem, 
  onSelect, 
  result, 
  imageSrc, 
  isProcessing,
  onRunAll,
  onStopRun,
  preprocessingConfig,
  globalPcaSamples,
  onBuildGlobalPca,
  globalPcaSnapshotAt,
  clusteringProps
}) => {
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null);
  const [showClustering, setShowClustering] = useState(false);

  // Auto-generate processed image URL for visualization whenever selection or config changes
  useEffect(() => {
    let active = true;
    
    const generatePreview = async () => {
      if (!selectedItem) {
        if (active) {
          setProcessedImageSrc(null);
        }
        return;
      }

      try {
        const url = await processImageForDisplay(selectedItem.file, preprocessingConfig);
        if (active) {
          setProcessedImageSrc(url);
        }
      } catch (e) {
        console.error("Failed to generate preview", e);
        if (active) {
          setProcessedImageSrc(selectedItem.url); // Fallback
        }
      }
    };

    generatePreview();

    return () => { active = false; };
  }, [selectedItem, preprocessingConfig]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Visualizer Area (Hero) */}
      <div className={`min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative shadow-2xl ${showClustering ? 'h-48 md:h-64 shrink-0' : 'flex-1'}`}>
         <Visualizer 
           imageSrc={processedImageSrc || imageSrc} 
           result={result} 
           isProcessing={isProcessing} 
           globalPcaSamples={globalPcaSamples}
           onBuildGlobalPca={onBuildGlobalPca}
           globalPcaSnapshotAt={globalPcaSnapshotAt}
         />
         
         {!selectedItem && (
            <div className="absolute top-2 left-2 md:top-4 md:left-4 bg-gray-900/80 backdrop-blur border border-gray-700 p-2.5 md:p-3 rounded-lg max-w-[15rem] md:max-w-xs pointer-events-none">
               <h3 className="text-xs md:text-sm font-bold text-white mb-1">Feature Extraction</h3>
               <p className="text-[11px] md:text-xs text-gray-400">
                 Select an image from the gallery below to visualize its patch embeddings as a 2D overlay, or click "Run Embeddings" to process the entire batch.
               </p>
            </div>
         )}
      </div>

      {/* Action Bar & Gallery */}
      <div className="flex flex-col gap-4 shrink-0">
          <Gallery 
            images={images} 
            onSelect={onSelect} 
            selectedId={selectedItem?.id || null} 
            isProcessing={isProcessing} 
            onRunAll={onRunAll}
            onStop={onStopRun}
            viewMode="strip"
            onUpdateItems={setImages}
          />
      </div>

      {/* Clustering Tool - Expandable/Collapsible */}
      {clusteringProps && (
        <div className="flex flex-col shrink-0">
          <button
            onClick={() => setShowClustering(!showClustering)}
            className={`flex items-center justify-between w-full px-4 py-2.5 rounded-t-xl border transition-colors ${
              showClustering
                ? 'bg-gray-900 border-gray-700 text-white'
                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 rounded-b-xl'
            }`}
          >
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-accent-500" />
              <span className="text-sm font-bold">Cluster Analysis</span>
              <span className="text-[10px] text-gray-500 font-medium">Unsupervised Learning</span>
            </div>
            {showClustering ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${showClustering ? 'max-h-[70dvh] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="border border-t-0 border-gray-700 rounded-b-xl overflow-hidden" style={{ height: '60dvh' }}>
              <div className="h-full overflow-y-auto p-2">
                <ClusteringView {...clusteringProps} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmbeddingStudio;
