

import React, { useRef, useState } from 'react';
import { GalleryItem } from '../../types';
import Gallery from '../Gallery';
import { Files, FolderUp, ImagePlus, Loader2, Database, ChevronDown, Images } from 'lucide-react';
import { Button } from '../Button';
import { generateThumbnail } from '../../utils/imageProcessing';

interface DatasetUploadProps {
  images: GalleryItem[];
  setImages: (items: GalleryItem[]) => void;
  onWorkspaceSelect: (files: FileList) => void;
  onSelectImage: (item: GalleryItem | null) => void; // for preview if needed
  onRunAll?: () => void;
  onStopRun?: () => void;
  isProcessing?: boolean;
  onEmbeddingsImported?: (items: GalleryItem[], matchCount: number) => void;
}

const EXAMPLE_DATASETS = [
  {
    name: 'Nature',
    images: [
      'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=500&q=80', // Field
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&q=80', // Woods
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=500&q=80', // Foggy mtn
      'https://images.unsplash.com/photo-1501854140884-074cf2b21d25?w=500&q=80', // Lake
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=500&q=80', // Mountains
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=500&q=80', // Beach
      'https://images.unsplash.com/photo-1448375240586-dfd8d395ea6c?w=500&q=80', // Forest
      'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=500&q=80', // Canyon
      'https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?w=500&q=80', // Waterfall
      'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=500&q=80', // Desert
      'https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?w=500&q=80', // Snow
      'https://images.unsplash.com/photo-1476820865390-c52aeebb9891?w=500&q=80', // Leaf
    ]
  },
  {
    name: 'Modern Arch',
    images: [
      'https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=500&q=80', // Building
      'https://images.unsplash.com/photo-1479839672679-a46483c0e7c8?w=500&q=80', // Architecture
      'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=500&q=80', // Modern
      'https://images.unsplash.com/photo-1355088257008-038222a7f055?w=500&q=80', // Glass
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=500&q=80', // Skyscraper
      'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=500&q=80', // Abstract
      'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=500&q=80', // City
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=500&q=80', // Interior
      'https://images.unsplash.com/photo-1494526585095-c41746248156?w=500&q=80', // White
      'https://images.unsplash.com/photo-1465447142348-e9952c393450?w=500&q=80', // Structure
      'https://images.unsplash.com/photo-1466027389868-22d7168a2307?w=500&q=80', // Windows
      'https://images.unsplash.com/photo-1506509007624-94645398d363?w=500&q=80', // Spiral
    ]
  },
   {
    name: 'Cats & Dogs',
    images: [
      'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?w=500&q=80', // Dog
      'https://images.unsplash.com/photo-1519052537078-e6302a4968ef?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=500&q=80', // Dog
      'https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=500&q=80', // Dog
      'https://images.unsplash.com/photo-1495360019602-e001c276375f?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1517849845537-4d257902454a?w=500&q=80', // Dog
      'https://images.unsplash.com/photo-1529778873920-4da4926a7071?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?w=500&q=80', // Dog
      'https://images.unsplash.com/photo-1501820488136-72669149e0d4?w=500&q=80', // Cat
      'https://images.unsplash.com/photo-1561037404-61cd46aa615b?w=500&q=80', // Dog
    ]
  }
];

const DatasetUpload: React.FC<DatasetUploadProps> = ({ 
  images, 
  setImages, 
  onWorkspaceSelect, 
  onSelectImage,
  onRunAll,
  onStopRun,
  isProcessing,
  onEmbeddingsImported
}) => {
  const [loadingExample, setLoadingExample] = useState<string | null>(null);
  const [exampleCount, setExampleCount] = useState(12);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const embeddingsInputRef = useRef<HTMLInputElement>(null);

  const openFilesPicker = () => {
    filesInputRef.current?.click();
  };

  const openFolderPicker = () => {
    folderInputRef.current?.click();
  };

  const openEmbeddingsPicker = () => {
    embeddingsInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      onWorkspaceSelect(e.target.files);
    }
  };

  const handleImportEmbeddings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = ev.target?.result as string;
        const data = JSON.parse(json); // Expected: Array of items
        
        if (!Array.isArray(data)) {
            alert("Invalid JSON: Expected an array of embedding data.");
            return;
        }

        let matchCount = 0;
        const newImages = images.map(img => {
            // Match logic: Try matching by 'name' or 'id' in the JSON
            const match = data.find((d: any) => d.name === img.name || d.id === img.name);
            
            if (match && match.embedding) {
                matchCount++;
                
                // Smart fallback for dimensions if missing
                let dims = match.dimensions;
                const patches = match.patches || [];
                
                if (!dims && patches.length > 0) {
                    const size = Math.sqrt(patches.length);
                    if (Number.isInteger(size)) {
                        dims = { width: size, height: size, patchSize: 14 };
                    }
                }

                return {
                    ...img,
                    status: 'cached',
                    clusterLabel: match.cluster,
                    result: {
                        embedding: match.embedding,
                        patches: patches, 
                        dimensions: dims || { width: 16, height: 16, patchSize: 14 } // Fallback
                    }
                } as GalleryItem;
            }
            return img;
        });

        setImages(newImages);
        onEmbeddingsImported?.(newImages, matchCount);
        console.log(`Imported embeddings for ${matchCount} images.`);
      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset
  };

  const handleClear = () => {
    // Revoke URLs to prevent leak
    images.forEach(img => {
      URL.revokeObjectURL(img.url);
      if (img.thumbnailUrl) URL.revokeObjectURL(img.thumbnailUrl);
    });
    setImages([]);
  };

  const loadExample = async (datasetIndex: number) => {
    const dataset = EXAMPLE_DATASETS[datasetIndex];
    setLoadingExample(dataset.name);
    
    try {
        const newItems: GalleryItem[] = [];
        const targets = dataset.images.slice(0, exampleCount);
        
        // Parallel fetch for speed
        const promises = targets.map(async (url, i) => {
            try {
                const response = await fetch(url);
                
                if (!response.ok) {
                    console.warn(`Failed to fetch example image ${url}: ${response.status}`);
                    return null;
                }

                const blob = await response.blob();
                
                // Sanity check for HTML responses (some 404s return 200 OK with HTML body)
                if (blob.type.includes('html')) {
                    console.warn(`Fetched resource was HTML, not image: ${url}`);
                    return null;
                }

                const filename = `example_${dataset.name.replace(/\s+/g, '')}_${i}.jpg`;
                const file = new File([blob], filename, { type: 'image/jpeg' });
                const thumb = await generateThumbnail(file);

                return {
                    id: filename + '-' + Date.now() + Math.random(),
                    name: filename,
                    url: URL.createObjectURL(file),
                    thumbnailUrl: thumb,
                    file: file,
                    status: 'idle',
                    enabled: true
                } as GalleryItem;
            } catch (err) {
                console.error("Failed to fetch image", url, err);
                return null;
            }
        });

        const results = await Promise.all(promises);
        results.forEach(item => {
            if (item) newItems.push(item);
        });
        
        setImages([...images, ...newItems]);
    } catch (e) {
        console.error("Failed to load examples", e);
    } finally {
        setLoadingExample(null);
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Top Controls */}
      <div className="flex flex-col gap-2 shrink-0">
         <div className="flex items-center justify-between gap-2 text-xs text-gray-400 bg-gray-950/30 p-2 rounded-lg border border-gray-800/50">
            <div className="flex items-center gap-2 min-w-0 flex-1">
               <div className="flex items-center gap-2 pr-2 mr-1 border-r border-gray-800/80 shrink-0">
                  <div className="p-1.5 bg-accent-500/10 rounded-lg">
                     <Images className="w-4 h-4 text-accent-500" />
                  </div>
                  <div className="leading-none">
                     <h2 className="text-sm font-bold text-white">Curate Dataset</h2>
                     <p className="text-[10px] text-gray-500 font-medium mt-0.5">Add files, folders, or examples</p>
                  </div>
               </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
             {/* Example Loaders */}
             <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg px-2 py-1">
                <div className="px-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1 border-r border-gray-800 mr-2 pr-2">
                    <Database className="w-3 h-3" /> 
                    <span className="hidden sm:inline">Examples</span>
                </div>
                
                {/* Count Selector */}
                <div className="relative mr-1 shrink-0">
                   <select 
                      value={exampleCount}
                      onChange={(e) => setExampleCount(Number(e.target.value))}
                      className="bg-transparent text-[10px] font-bold text-gray-500 appearance-none pr-3 cursor-pointer focus:outline-none hover:text-white"
                   >
                      <option value={4} className="bg-gray-900">4</option>
                      <option value={8} className="bg-gray-900">8</option>
                      <option value={12} className="bg-gray-900">12</option>
                   </select>
                   <ChevronDown className="w-2 h-2 text-gray-600 absolute right-0 top-1.5 pointer-events-none" />
                </div>

                {EXAMPLE_DATASETS.map((ds, idx) => (
                    <Button
                        key={ds.name}
                        onClick={() => loadExample(idx)}
                        disabled={!!loadingExample}
                        variant="default"
                        icon={loadingExample === ds.name ? Loader2 : ImagePlus}
                        className={`${loadingExample === ds.name ? "opacity-75" : ""} px-2 py-1`}
                    >
                        <span className="hidden sm:inline">{ds.name}</span>
                        <span className="sm:hidden">{ds.name.slice(0, 4)}</span>
                    </Button>
                ))}
             </div>

             <div className="w-px h-6 bg-gray-800 mx-1"></div>

             {/* Action Buttons */}
             <div className="flex items-center gap-2">
                <div className="inline-flex items-stretch overflow-hidden rounded-md border border-gray-700 bg-gray-800 text-xs font-medium shadow-sm">
                      <button
                         type="button"
                         onClick={openFilesPicker}
                         className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                      >
                         <Files className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
                         Add Files
                      </button>

                   <div className="w-px bg-gray-700" />

                      <button
                         type="button"
                         onClick={openFolderPicker}
                         className="group flex h-full items-center gap-2 px-3 py-1.5 text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                      >
                         <FolderUp className="w-3.5 h-3.5 text-gray-400 transition-colors group-hover:text-gray-200" />
                         Add Folder
                      </button>
                </div>

                <input
                   ref={filesInputRef}
                   type="file"
                   onChange={handleFileChange}
                   className="hidden"
                   accept="image/*"
                   multiple
                />
                <input
                   ref={folderInputRef}
                   type="file"
                   {...({ webkitdirectory: "", directory: "" } as any)}
                   onChange={handleFileChange}
                   className="hidden"
                />
                <input
                   ref={embeddingsInputRef}
                   type="file"
                   onChange={handleImportEmbeddings}
                   className="hidden"
                   accept=".json"
                />
             </div>
            </div>
         </div>
      </div>

      {/* Main Grid Area */}
      <div className="flex-1 min-h-0">
         <Gallery 
            images={images} 
            onSelect={onSelectImage} 
            selectedId={null} 
            isProcessing={!!isProcessing} 
            viewMode="grid"
            onClear={handleClear}
            onUpdateItems={setImages}
            onRunAll={onRunAll}
            onStop={onStopRun}
            onAddFiles={openFilesPicker}
            onAddFolder={openFolderPicker}
            onImportEmbeddings={openEmbeddingsPicker}
            importEmbeddingsDisabled={images.length === 0 || !!isProcessing}
         />
      </div>
    </div>
  );
};

export default DatasetUpload;
