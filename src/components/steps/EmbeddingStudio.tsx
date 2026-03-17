import React, { useEffect, useState } from 'react';
import { GalleryItem, InferenceResult, PreprocessingConfig } from '@/types';
import Visualizer from '@/components/Visualizer';
import Gallery from '@/components/Gallery';
import { processImageForDisplay } from '@/utils/imageProcessing';

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
}) => {
  const [processedImageSrc, setProcessedImageSrc] = useState<string | null>(null);

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

      // If we already have a result, we should strictly assume the model used the config at that time.
      // However, for the purpose of this studio "playground", showing the CURRENT config applied
      // allows users to see what "would" happen or what "did" happen if config hasn't changed.
      // Ideally, the GalleryItem would store the preprocessing config used at inference time.
      // For now, we generate based on current global config to give instant feedback on "Crop vs Pad".
      try {
        const url = await processImageForDisplay(selectedItem.file, preprocessingConfig);
        if (active) {
          setProcessedImageSrc(url);
        }
      } catch (e) {
        console.error('Failed to generate preview', e);
        if (active) {
          setProcessedImageSrc(selectedItem.url); // Fallback
        }
      }
    };

    generatePreview();

    return () => {
      active = false;
    };
  }, [selectedItem, preprocessingConfig]);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Visualizer Area */}
      <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden relative shadow-2xl">
        {/* We pass processedImageSrc if available, otherwise fallback to raw imageSrc */}
        {/* Only render when not loading to prevent flash */}
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
              Select an image from the gallery below to visualize its patch embeddings as a 2D overlay, or click "Run
              Embeddings" to process the entire batch.
            </p>
          </div>
        )}
      </div>

      {/* Action Bar & Gallery */}
      <div className="flex flex-col gap-4 shrink-0">
        {/* Gallery Strip */}
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
    </div>
  );
};

export default EmbeddingStudio;
