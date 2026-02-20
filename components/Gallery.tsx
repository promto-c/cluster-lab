

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GalleryItem } from '../types';
import { Image as ImageIcon, Folder, Files, FolderUp, FileJson, Play, CheckCircle, Loader2, AlertCircle, Download, Trash2, CheckSquare, Square, Power, XCircle, Check, Layers, AlertTriangle, HelpCircle, Focus, MinusSquare, ChevronDown, X, Split, Grid, LayoutGrid, Grip } from 'lucide-react';
import { Button } from './Button';

type Density = 'normal' | 'compact' | 'tiny';

interface GalleryProps {
  images: GalleryItem[];
  onSelect: (item: GalleryItem | null) => void;
  onRunAll?: () => void;
  onStop?: () => void;
  selectedId: string | null;
  isProcessing: boolean;
  viewMode?: 'strip' | 'grid';
  onClear?: () => void;
  onUpdateItems?: (items: GalleryItem[]) => void;
  groupBy?: keyof GalleryItem | ((item: GalleryItem) => string | number | undefined);
  groupTitleBuilder?: (value: any, count: number, isSubCluster?: boolean) => React.ReactNode;
  onDrillDown?: (groupId: string) => void;
  defaultDensity?: Density;
  headerMeta?: React.ReactNode;
  onAddFiles?: () => void;
  onAddFolder?: () => void;
  onImportEmbeddings?: () => void;
  importEmbeddingsDisabled?: boolean;
}

const DENSITY_CONFIG = {
  normal: {
    gridClass: 'grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3',
    baseSize: 130,
    icon: Grid,
    label: 'Normal'
  },
  compact: {
    gridClass: 'grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-1.5',
    baseSize: 60,
    icon: LayoutGrid,
    label: 'Compact'
  },
  tiny: {
    gridClass: 'grid-cols-[repeat(auto-fill,minmax(24px,1fr))] gap-0.5',
    baseSize: 24,
    icon: Grip,
    label: 'Tiny'
  }
};

// --- Memoized Card Component ---
interface GalleryCardProps {
  item: GalleryItem;
  isSelected: boolean;
  isCurrent: boolean;
  isEnabled: boolean;
  viewMode: 'strip' | 'grid';
  density: Density;
  onClick: (item: GalleryItem, e: React.MouseEvent) => void;
  showBatchControls: boolean;
}

const GalleryCard = React.memo(({ 
  item, 
  isSelected, 
  isCurrent, 
  isEnabled, 
  viewMode, 
  density,
  onClick, 
  showBatchControls 
}: GalleryCardProps) => {

  const isTiny = density === 'tiny' && viewMode === 'grid';
  const isCompact = density === 'compact' && viewMode === 'grid';
  
  // Calculate size for content-visibility optimization
  const intrinsicSize = viewMode === 'strip' ? '112px' : `${DENSITY_CONFIG[density].baseSize}px`;

  return (
    <button
      onClick={(e) => onClick(item, e)}
      data-gallery-card="true"
      className={`group relative rounded-sm overflow-hidden transition-all bg-gray-950 content-visibility-auto outline-none
        ${viewMode === 'grid' ? 'aspect-square w-full' : 'flex-shrink-0 w-28 h-28 border-2 rounded-md'}
        ${viewMode === 'grid' && (density === 'tiny' || density === 'compact') ? 'border-0' : 'border-2'}
        ${isCurrent 
          ? 'border-accent-500 shadow-[0_0_15px_rgba(59,130,246,0.5)] z-10 scale-[1.05]' 
          : isSelected 
             ? 'border-accent-600/60 ring-1 ring-accent-500/30 z-0 bg-accent-900/20'
             : 'border-transparent hover:brightness-110'
        }
        ${!isEnabled ? 'opacity-50 grayscale' : ''}
      `}
      style={{ contentVisibility: 'auto', containIntrinsicSize: intrinsicSize }}
      title={item.name}
    >
      <img 
        src={item.thumbnailUrl || item.url} 
        alt={item.name} 
        className={`w-full h-full object-cover transition-all duration-500 will-change-transform 
            ${item.status === 'processing' ? 'scale-110 blur-[1px]' : ''}
            ${isSelected && !isCurrent ? 'opacity-70 mix-blend-overlay' : ''}
        `}
        loading="lazy"
      />
      
      {/* Selection Badge - Hide in Tiny mode unless selected */}
      {isSelected && showBatchControls && (
          <div className={`absolute z-20 bg-accent-600 text-white rounded shadow-lg animate-in fade-in zoom-in duration-200 border border-accent-400
             ${isTiny ? 'inset-0 opacity-40 mix-blend-multiply' : isCompact ? 'inset-0 opacity-20 mix-blend-multiply' : 'top-2 left-2 p-0.5'}
          `}>
             {!isTiny && !isCompact && <Check className="w-3 h-3 stroke-[3]" />}
          </div>
      )}
      
      {/* Status Icons - Hide in Tiny mode */}
      {!isTiny && (
        <div className={`absolute pointer-events-none flex gap-1 ${isCompact ? 'top-0.5 right-0.5' : 'top-2 right-2'}`}>
            {item.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-accent-400 animate-spin drop-shadow-md" />}
            {item.status === 'cached' && !isCompact && <CheckCircle className="w-3.5 h-3.5 text-green-400 fill-green-900/80 drop-shadow-md" />}
            {item.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400 drop-shadow-md" />}
        </div>
      )}

      {/* Disabled Indicator */}
      {!isEnabled && !isTiny && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/70 px-2 py-1 rounded text-[8px] font-bold uppercase text-gray-400 border border-gray-700">
                Off
            </div>
          </div>
      )}

      {/* Label Overlay - Hide in Compact/Tiny */}
      {!isTiny && !isCompact && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
          <span className="truncate text-xs text-gray-200 font-medium">{item.name}</span>
        </div>
      )}
      
      {/* Processing Border Effect */}
      {item.status === 'processing' && (
        <div className="absolute inset-0 bg-accent-500/10 border-2 border-accent-500 animate-pulse rounded pointer-events-none"></div>
      )}
    </button>
  );
}, (prev, next) => {
  return prev.item === next.item && 
         prev.isSelected === next.isSelected && 
         prev.isCurrent === next.isCurrent &&
         prev.isEnabled === next.isEnabled &&
         prev.viewMode === next.viewMode &&
         prev.density === next.density &&
         prev.showBatchControls === next.showBatchControls;
});

// --- Main Component ---

const Gallery: React.FC<GalleryProps> = ({ 
  images, 
  onSelect, 
  onRunAll, 
  onStop,
  selectedId, 
  isProcessing, 
  viewMode = 'strip',
  onClear,
  onUpdateItems,
  groupBy,
  groupTitleBuilder,
  onDrillDown,
  defaultDensity = 'normal',
  headerMeta,
  onAddFiles,
  onAddFolder,
  onImportEmbeddings,
  importEmbeddingsDisabled = false
}) => {
  const [selectedBatch, setSelectedBatch] = useState<Set<string>>(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [density, setDensity] = useState<Density>(defaultDensity);
  const selectionAnchorRef = useRef<string | null>(selectedId);

  // Sync anchor when selection is changed by parent-driven interactions.
  useEffect(() => {
    selectionAnchorRef.current = selectedId;
  }, [selectedId]);

  const processedCount = images.filter(i => i.status === 'cached').length;
  const progress = images.length > 0 ? (processedCount / images.length) * 100 : 0;

  // --- Grouping Logic ---
  const groupedData = useMemo(() => {
    if (!groupBy || viewMode === 'strip') return null;

    const groups: Record<string, GalleryItem[]> = {};
    images.forEach(item => {
      let val: any;
      if (typeof groupBy === 'function') {
        val = groupBy(item);
      } else {
        val = item[groupBy];
      }
      
      let key = val !== undefined && val !== null ? String(val) : 'Unassigned';
      if (typeof val === 'number' && val === -1) {
          key = 'Noise';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
        // Always place Noise/Unassigned at the end
        if (a === 'Noise') return 1; if (b === 'Noise') return -1;
        if (a === 'Unassigned') return 1; if (b === 'Unassigned') return -1;
        
        // Handle hierarchical keys (e.g. "1::2" vs "1::3" vs "0")
        // We split by '::' and compare segments numerically
        const partsA = a.split('::').map(Number);
        const partsB = b.split('::').map(Number);
        
        // If either part is NaN (pure string keys), fallback to string comparison
        if (partsA.some(isNaN) || partsB.some(isNaN)) {
             return a.localeCompare(b);
        }

        const len = Math.min(partsA.length, partsB.length);
        for(let i=0; i<len; i++) {
            if (partsA[i] !== partsB[i]) {
                return partsA[i] - partsB[i];
            }
        }
        
        // If one is a prefix of another (e.g. "1" vs "1::0"), shortest first?
        return partsA.length - partsB.length;
    });

    return { groups, sortedKeys };
  }, [images, groupBy, viewMode]);
  
  // Calculate display order for Shift-selection
  const displayedItems = useMemo(() => {
     if (!groupedData) return images;
     let flat: GalleryItem[] = [];
     groupedData.sortedKeys.forEach(key => {
         flat = flat.concat(groupedData.groups[key]);
     });
     return flat;
  }, [images, groupedData]);

  const clearSelection = useCallback(() => {
    setSelectedBatch(new Set());
    selectionAnchorRef.current = null;
    onSelect(null);
  }, [onSelect]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (
      target.closest('[data-gallery-card="true"]') ||
      target.closest('[data-gallery-header="true"]') ||
      target.closest('button, a, input, select, textarea, label')
    ) {
      return;
    }
    clearSelection();
  }, [clearSelection]);


  const handleExport = (includePatches: boolean) => {
    const data = images
      .filter(i => i.result && i.enabled !== false)
      .map(i => {
        const itemExport: any = {
          name: i.name,
          embedding: i.result?.embedding,
          dimensions: i.result?.dimensions,
          cluster: i.clusterLabel,
          clusterPath: i.clusterPath
        };
        if (includePatches) {
          itemExport.patches = i.result?.patches;
        }
        return itemExport;
      });

    const fileName = includePatches ? 'embeddings_full.json' : 'embeddings_lite.json';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  // --- Click Logic ---
  const handleCardClick = useCallback((item: GalleryItem, e: React.MouseEvent) => {
      const clickedId = item.id;
      const anchorId = selectionAnchorRef.current;
      onSelect(item);
      
      if (onUpdateItems) {
          const isMulti = e.ctrlKey || e.metaKey;
          const isRange = e.shiftKey;
          
          setSelectedBatch(prev => {
              const next = new Set(isMulti || isRange ? prev : []);
              
              if (isRange) {
                  if (!isMulti) next.clear();

                  if (anchorId) {
                    const anchorIdx = displayedItems.findIndex(i => i.id === anchorId);
                    const currentIdx = displayedItems.findIndex(i => i.id === clickedId);
                    if (anchorIdx !== -1 && currentIdx !== -1) {
                        const start = Math.min(anchorIdx, currentIdx);
                        const end = Math.max(anchorIdx, currentIdx);
                        for (let i = start; i <= end; i++) {
                            next.add(displayedItems[i].id);
                        }
                    } else {
                        next.add(clickedId);
                    }
                  } else {
                    next.add(clickedId);
                  }
              } else if (isMulti) {
                  if (next.has(clickedId)) next.delete(clickedId);
                  else next.add(clickedId);
              } else {
                  next.clear();
                  next.add(clickedId);
              }
              return next;
          });
      }

      // The clicked item is always the new range anchor.
      selectionAnchorRef.current = clickedId;
  }, [onSelect, onUpdateItems, displayedItems]);

  const selectAll = () => {
    if (selectedBatch.size === images.length) {
      setSelectedBatch(new Set());
    } else {
      setSelectedBatch(new Set(images.map(i => i.id)));
    }
  };

  const selectGroup = (itemsInGroup: GalleryItem[]) => {
      setSelectedBatch(prev => {
          const next = new Set(prev);
          const allInGroupSelected = itemsInGroup.every(i => prev.has(i.id));
          
          if (allInGroupSelected) {
              // Deselect all in group
              itemsInGroup.forEach(i => next.delete(i.id));
          } else {
              // Select all in group
              itemsInGroup.forEach(i => next.add(i.id));
          }
          return next;
      });
  };

  const batchAction = (action: 'enable' | 'disable' | 'delete' | 'focus') => {
    if (!onUpdateItems) return;
    
    let nextImages = [...images];
    
    if (action === 'delete') {
      nextImages = nextImages.filter(i => !selectedBatch.has(i.id));
    } else if (action === 'focus') {
      // Enable ONLY selected, disable others
      nextImages = nextImages.map(i => ({
        ...i,
        enabled: selectedBatch.has(i.id)
      }));
    } else {
      nextImages = nextImages.map(i => {
        if (selectedBatch.has(i.id)) {
          return { ...i, enabled: action === 'enable' };
        }
        return i;
      });
    }
    
    onUpdateItems(nextImages);
    if (action === 'delete') setSelectedBatch(new Set());
  };

  // --- Empty State ---
  if (images.length === 0) {
    if (viewMode === 'grid') {
      return (
        <div className="mx-auto w-full max-w-xl flex-1 border-2 border-dashed border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-500 bg-gray-900/30 p-10 transition-colors hover:bg-gray-900/50 hover:border-gray-700">
          <Folder className="w-12 h-12 mb-4 opacity-50" />
          <p className="text-lg font-medium text-gray-400">Your dataset is empty</p>
          <span className="text-sm opacity-50 mt-2 text-center max-w-sm">
            Drag and drop images here to get started.
          </span>
          {(onAddFiles || onAddFolder) && (
            <div className="mt-5 inline-flex items-stretch overflow-hidden rounded-md border border-gray-700 bg-gray-800 text-xs font-medium shadow-sm">
              {onAddFiles && (
                <button
                  type="button"
                  onClick={onAddFiles}
                  className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  <Files className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
                  Add Files
                </button>
              )}

              {onAddFiles && onAddFolder && <div className="w-px bg-gray-700" />}

              {onAddFolder && (
                <button
                  type="button"
                  onClick={onAddFolder}
                  className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                >
                  <FolderUp className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
                  Add Folder
                </button>
              )}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="h-40 bg-gray-900/50 border border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-500 text-xs border-dashed shrink-0">
        <Folder className="w-6 h-6 mb-2 opacity-50" />
        <p>No images found</p>
      </div>
    );
  }

  // --- Header Area (Common) ---
  const Header = () => (
    <div className="px-4 py-2 bg-gray-800/50 border-b border-gray-800 flex justify-between items-center">
      <div className="flex items-center gap-3">

        {/* Select All Checkbox - Persistently visible for access */}
        {onUpdateItems && (
          <button 
            onClick={selectAll}
            className="group flex items-center justify-center focus:outline-none transition-colors w-5 h-5"
            title={selectedBatch.size === images.length ? "Deselect All" : "Select All"}
          >
            {selectedBatch.size === images.length && images.length > 0 ? (
                <CheckSquare className="w-5 h-5 text-accent-500" />
            ) : selectedBatch.size > 0 ? (
                <MinusSquare className="w-5 h-5 text-accent-500" />
            ) : (
                <div className="relative w-5 h-5 flex items-center justify-center">
                   <ImageIcon className="w-5 h-5 text-accent-500 absolute inset-0 transition-all duration-200 ease-out group-hover:opacity-0 group-hover:scale-75" />
                   <Square className="w-5 h-5 text-gray-400 absolute inset-0 transition-all duration-200 ease-out opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 group-hover:text-white" />
                </div>
            )}
          </button>
        )}

        {selectedBatch.size > 0 ? (
           <div className="flex items-center gap-3 animate-fadeIn">
              <div className="flex items-center gap-2 bg-accent-500/10 text-accent-400 px-2 py-1 rounded-md border border-accent-500/20 mr-2">
                  <span className="text-sm font-bold">{selectedBatch.size} Selected</span>
                  <button 
                      onClick={() => setSelectedBatch(new Set())}
                      className="hover:bg-accent-500/20 rounded-full p-0.5 transition-colors"
                      title="Clear Selection"
                  >
                      <X className="w-3 h-3" />
                  </button>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  onClick={() => batchAction('focus')} 
                  disabled={isProcessing} 
                  variant="primary"
                  icon={Focus}
                  title="Enable selected, disable others"
                >
                  Focus
                </Button>

                <div className="h-4 w-px bg-gray-700 mx-1"></div>

                <Button 
                  onClick={() => batchAction('enable')} 
                  disabled={isProcessing} 
                  variant="success"
                  icon={Power}
                >
                  Enable
                </Button>
                
                <Button 
                  onClick={() => batchAction('disable')} 
                  disabled={isProcessing} 
                  variant="default"
                  icon={XCircle}
                >
                  Disable
                </Button>
                
                <Button 
                  onClick={() => batchAction('delete')} 
                  disabled={isProcessing} 
                  variant="danger"
                  icon={Trash2}
                >
                  Delete
                </Button>
              </div>
           </div>
        ) : (
           <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {!onUpdateItems && <ImageIcon className="w-4 h-4 text-accent-500" />}
              <span className="text-sm font-semibold text-gray-300">
                {viewMode === 'grid' ? 'Dataset Overview' : 'Gallery'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-gray-800 text-xs text-gray-500 border border-gray-700">{images.length} items</span>
              {headerMeta}
            </div>
            
            {/* Progress Bar */}
            {(processedCount > 0 || isProcessing) && (
              <div className="hidden md:flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-accent-500 transition-all duration-500" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
                <span className="text-[10px] text-gray-500 font-mono">{processedCount}/{images.length}</span>
              </div>
            )}
           </div>
        )}
      </div>

      <div className="flex items-center gap-2">
          {/* View Density Controls */}
          {viewMode === 'grid' && (
             <div className="flex bg-gray-800 rounded-lg p-0.5 border border-gray-700 mr-2">
                {(Object.keys(DENSITY_CONFIG) as Density[]).map((d) => {
                    const conf = DENSITY_CONFIG[d];
                    const Icon = conf.icon;
                    return (
                        <button
                            key={d}
                            onClick={() => setDensity(d)}
                            className={`p-1.5 rounded-md transition-all ${density === d ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'}`}
                            title={`View: ${conf.label}`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                        </button>
                    )
                })}
             </div>
          )}

          {onClear && selectedBatch.size === 0 && (
             <Button
                onClick={onClear}
                disabled={isProcessing}
                variant="danger"
                icon={Trash2}
             >
                Clear
             </Button>
          )}

          {processedCount > 0 && selectedBatch.size === 0 && (
            <div className="relative">
              <Button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  variant="default"
                  icon={Download}
                  title="Export options"
              >
                  Export
                  <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </Button>
              
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)}></div>
                  <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                      <button 
                          onClick={() => handleExport(false)}
                          className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white flex flex-col group"
                      >
                          <span className="font-bold text-gray-200 group-hover:text-white">Export Lite</span>
                          <span className="text-[10px] text-gray-500 group-hover:text-gray-400">Embeddings only. Fast & small.</span>
                      </button>
                      <div className="h-px bg-gray-800 my-1"></div>
                      <button 
                          onClick={() => handleExport(true)}
                          className="w-full text-left px-4 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white flex flex-col group"
                      >
                          <span className="font-bold text-gray-200 group-hover:text-white">Export Full</span>
                          <span className="text-[10px] text-gray-500 group-hover:text-gray-400">Includes patches for 3D view. Large.</span>
                      </button>
                  </div>
                </>
              )}
            </div>
          )}

          {onImportEmbeddings && (
            <Button
              onClick={onImportEmbeddings}
              disabled={importEmbeddingsDisabled}
              variant="default"
              icon={FileJson}
              title="Import precomputed embeddings from JSON"
            >
              Import Embeddings
            </Button>
          )}

          {onRunAll && (
            isProcessing ? (
              <Button
                onClick={onStop}
                disabled={!onStop}
                variant="danger"
                icon={XCircle}
                className={!onStop ? "!bg-gray-800 !text-gray-500 !border-gray-700 !cursor-not-allowed" : "shadow-lg hover:scale-105"}
              >
                Stop
              </Button>
            ) : (
              <Button
                onClick={onRunAll}
                disabled={processedCount === images.length}
                variant="primary"
                className={processedCount === images.length ? "!bg-gray-800 !text-gray-500 !border-gray-700 !cursor-not-allowed" : "shadow-lg hover:scale-105"}
                icon={Play}
              >
                Run Embeddings
              </Button>
            )
          )}
      </div>
    </div>
  );

  const gridClass = viewMode === 'strip' ? '' : DENSITY_CONFIG[density].gridClass;
  
  // Use masonry layout for dense views to avoid vertical gaps
  const isMasonry = viewMode === 'grid' && (density === 'compact' || density === 'tiny');
  const masonryClass = density === 'tiny' 
     ? 'columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3 px-3' 
     : 'columns-1 sm:columns-2 md:columns-3 gap-4 space-y-4 px-4';

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden shrink-0 transition-all duration-300 ${viewMode === 'grid' ? 'h-full shadow-inner' : 'h-48'}`}>
      <Header />
      
      <div
        onClick={handleCanvasClick}
        className={`flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 ${viewMode === 'strip' ? 'flex p-4 gap-3 overflow-x-auto overflow-y-hidden' : ''}`}
      >
        
        {/* Strip Mode / Non-Grouped Grid */}
        {(!groupedData) && viewMode === 'strip' && images.map(item => (
           <GalleryCard 
              key={item.id}
              item={item}
              isSelected={selectedBatch.has(item.id)}
              isCurrent={selectedId === item.id}
              isEnabled={item.enabled !== false}
              viewMode={viewMode}
              density={density}
              onClick={handleCardClick}
              showBatchControls={!!onUpdateItems}
           />
        ))}

        {(!groupedData) && viewMode === 'grid' && (
            <div className={`p-4 grid ${gridClass} content-start`}>
                {images.map(item => (
                    <GalleryCard 
                        key={item.id}
                        item={item}
                        isSelected={selectedBatch.has(item.id)}
                        isCurrent={selectedId === item.id}
                        isEnabled={item.enabled !== false}
                        viewMode={viewMode}
                        density={density}
                        onClick={handleCardClick}
                        showBatchControls={!!onUpdateItems}
                    />
                ))}
            </div>
        )}

        {/* Grouped Grid Mode */}
        {groupedData && (
            <div className={isMasonry ? `pb-4 pt-4 ${masonryClass} block` : 'pb-4'}>
                {groupedData.sortedKeys.map(key => {
                    const groupItems = groupedData.groups[key];
                    const isNoise = key === 'Noise';
                    const isUnassigned = key === 'Unassigned';
                    
                    // Group Selection State
                    const selectedCount = groupItems.filter(i => selectedBatch.has(i.id)).length;
                    const isAllSelected = selectedCount === groupItems.length && groupItems.length > 0;
                    const isIndeterminate = selectedCount > 0 && !isAllSelected;

                    // Title Builder
                    let titleNode: React.ReactNode = (
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                             {isNoise ? <AlertTriangle className="w-4 h-4 text-red-400" /> : isUnassigned ? <HelpCircle className="w-4 h-4 text-gray-500" /> : <Layers className="w-4 h-4 text-accent-500" />}
                             <span className={isNoise ? "text-red-400" : isUnassigned ? "text-gray-500" : "text-gray-200"}>{key}</span>
                        </div>
                    );

                    if (groupTitleBuilder) {
                        const firstItem = groupItems[0];
                        const val = typeof groupBy === 'function' ? groupBy(firstItem) : firstItem[groupBy!];
                        titleNode = groupTitleBuilder(val, groupItems.length);
                    } else if (key.includes('::')) {
                        // Fallback title for strings not handled by builder
                         titleNode = (
                             <div className="flex items-center gap-2 text-sm font-bold text-gray-300">
                                 <Layers className="w-4 h-4 text-accent-500" />
                                 <span className="text-gray-200">{key.replace(/::/g, ' > ')}</span>
                             </div>
                         );
                    }

                    // Container Styling
                    const groupContainerClass = isMasonry 
                        ? 'break-inside-avoid bg-gray-950/40 border border-gray-800/50 rounded-lg overflow-hidden mb-3 w-full'
                        : 'mb-0'; 

                    // Header Styling: Seamless for masonry, sticky for normal
                    const headerClass = isMasonry
                        ? "group/header bg-gray-800/40 border-b border-gray-700/30 py-1.5 px-2 flex items-center justify-between min-h-[28px] hover:bg-gray-800/60 transition-colors"
                        : "sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800/50 py-2 px-4 flex items-center justify-between shadow-sm group/header hover:bg-gray-800/50 transition-colors";

                    return (
                        <div key={key} className={groupContainerClass}>
                             <div className={headerClass} data-gallery-header="true">
                                <div className="flex items-center gap-3">
                                    {/* Group Select Button */}
                                    {onUpdateItems && (
                                        <button 
                                            onClick={() => selectGroup(groupItems)}
                                            className="text-gray-500 hover:text-white transition-colors focus:outline-none"
                                        >
                                            {isAllSelected ? (
                                                <CheckSquare className="w-4 h-4 text-accent-500" />
                                            ) : isIndeterminate ? (
                                                <MinusSquare className="w-4 h-4 text-accent-400" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    )}
                                    <div className={isMasonry ? "scale-90 origin-left" : ""}>
                                        {titleNode}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Sub-Clustering Drill Down Button */}
                                    {onDrillDown && !isNoise && !isUnassigned && (
                                        <button
                                            onClick={() => onDrillDown(key)}
                                            className={isMasonry 
                                                ? "p-1 rounded text-gray-400 hover:text-white hover:bg-accent-600 transition-colors opacity-0 group-hover/header:opacity-100" 
                                                : "opacity-0 group-hover/header:opacity-100 flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-accent-600 hover:text-white text-gray-400 rounded-md transition-all text-[10px] font-bold uppercase border border-gray-700 hover:border-accent-500 shadow-sm"
                                            }
                                            title="Run Sub-Clustering on this group"
                                        >
                                            <Split className="w-3 h-3 rotate-180" />
                                            {!isMasonry && <span className="hidden sm:inline">Drill Down</span>}
                                        </button>
                                    )}
                                    {/* Simplified count for masonry */}
                                    <span className="text-[10px] font-mono text-gray-500 bg-gray-800/50 px-1.5 py-0.5 rounded">{groupItems.length}</span>
                                </div>
                             </div>
                             <div className={`p-2 grid ${gridClass} content-start`}>
                                {groupItems.map(item => (
                                    <GalleryCard 
                                        key={item.id}
                                        item={item}
                                        isSelected={selectedBatch.has(item.id)}
                                        isCurrent={selectedId === item.id}
                                        isEnabled={item.enabled !== false}
                                        viewMode={viewMode}
                                        density={density}
                                        onClick={handleCardClick}
                                        showBatchControls={!!onUpdateItems}
                                    />
                                ))}
                             </div>
                        </div>
                    );
                })}
            </div>
        )}

      </div>
    </div>
  );
};

export default Gallery;
