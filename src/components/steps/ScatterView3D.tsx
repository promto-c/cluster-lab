import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GalleryItem, DimReductionMethod } from '../../types';
import { reducePCA, reduceUMAP, reduceTSNE, normalizeVector } from '../../utils/math';
import { Settings2, AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import PrecisionSlider from '../PrecisionSlider';
import useMediaQuery from '../../utils/useMediaQuery';

// JSX intrinsics for react-three-fiber
declare global {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      group: any;
      instancedMesh: any;
      planeGeometry: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      color: any;
      sprite: any;
      spriteMaterial: any;
      gridHelper: any;
      axesHelper: any;
      lineSegments: any;
      bufferGeometry: any;
      bufferAttribute: any;
      lineBasicMaterial: any;
      lineDashedMaterial: any;
      line_: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      mesh: any;
      group: any;
      instancedMesh: any;
      planeGeometry: any;
      sphereGeometry: any;
      meshBasicMaterial: any;
      meshStandardMaterial: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      color: any;
      sprite: any;
      spriteMaterial: any;
      gridHelper: any;
      axesHelper: any;
      lineSegments: any;
      bufferGeometry: any;
      bufferAttribute: any;
      lineBasicMaterial: any;
      lineDashedMaterial: any;
      line_: any;
    }
  }
}

// --- Cluster color palette ---
const CLUSTER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16',
  '#e879f9', '#22d3ee', '#fb923c', '#a78bfa', '#34d399',
  '#fbbf24', '#f472b6', '#2dd4bf', '#c084fc', '#4ade80',
];

const NOISE_COLOR = '#4b5563'; // gray-600

function getClusterColor(label: number | undefined): string {
  if (label === undefined || label < 0) return NOISE_COLOR;
  return CLUSTER_COLORS[label % CLUSTER_COLORS.length];
}

// Get hierarchical cluster identifier: uses clusterPath if available, otherwise clusterLabel
function getClusterIdentifier(item: GalleryItem): string | number {
  if (item.clusterPath && item.clusterPath.length > 0) {
    return item.clusterPath.join('-');
  }
  return item.clusterLabel ?? -1;
}

// Get color for hierarchical cluster
function getHierarchicalClusterColor(item: GalleryItem): string {
  if (item.clusterLabel === undefined || item.clusterLabel < 0) return NOISE_COLOR;
  
  // If hierarchical path exists, hash it to get a consistent color
  if (item.clusterPath && item.clusterPath.length > 0) {
    let hash = 0;
    for (let i = 0; i < item.clusterPath.length; i++) {
      hash = ((hash << 5) - hash) + item.clusterPath[i];
      hash = hash & hash; // Convert to 32-bit integer
    }
    return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
  }
  
  return getClusterColor(item.clusterLabel);
}

// Helper to draw rounded rectangle path
const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

// --- Thumbnail Sprite ---
const ThumbnailSprite: React.FC<{
  position: [number, number, number];
  imageUrl: string;
  color: string;
  size: number;
  selected: boolean;
  onClick: () => void;
}> = ({ position, imageUrl, color, size, selected, onClick }) => {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null);

  useEffect(() => {
    const texSize = 128;
    const border = 6;
    const radius = 24;

    const canvas = document.createElement('canvas');
    canvas.width = texSize;
    canvas.height = texSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw border rounded rect
      drawRoundedRect(ctx, 0, 0, texSize, texSize, radius);
      ctx.fillStyle = color;
      ctx.fill();

      // Clip inner area for image
      const inner = border;
      const innerSize = texSize - border * 2;
      const innerRadius = Math.max(0, radius - border);
      ctx.save();
      drawRoundedRect(ctx, inner, inner, innerSize, innerSize, innerRadius);
      ctx.clip();

      // Center-crop: draw the largest centered square from the source
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      const cropSize = Math.min(srcW, srcH);
      const sx = (srcW - cropSize) / 2;
      const sy = (srcH - cropSize) / 2;
      ctx.drawImage(img, sx, sy, cropSize, cropSize, inner, inner, innerSize, innerSize);
      ctx.restore();

      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.needsUpdate = true;
      setTexture(tex);
    };
    img.src = imageUrl;

    return () => {
      img.onload = null;
    };
  }, [imageUrl, color]);

  if (!texture) return null;

  return (
    <group position={position}>
      <sprite
        scale={[size * 1.15, size * 1.15, 1]}
        onClick={(e: any) => { e.stopPropagation(); onClick(); }}
      >
        <spriteMaterial
          map={texture}
          transparent
          opacity={selected ? 1.0 : 0.85}
        />
      </sprite>
    </group>
  );
};

// --- Dot fallback (when no thumbnail) ---
const DotPoint: React.FC<{
  position: [number, number, number];
  color: string;
  size: number;
  selected: boolean;
  onClick: () => void;
}> = ({ position, color, size, selected, onClick }) => {
  const col = useMemo(() => new THREE.Color(color), [color]);
  return (
    <mesh
      position={position}
      onClick={(e: any) => { e.stopPropagation(); onClick(); }}
    >
      <sphereGeometry args={[size * 0.15, 16, 16]} />
      <meshStandardMaterial
        color={col}
        emissive={col}
        emissiveIntensity={selected ? 0.6 : 0.15}
        roughness={0.4}
      />
    </mesh>
  );
};

// --- Auto-fit camera on mount ---
const AutoFitCamera: React.FC<{ positions: [number, number, number][]; controlsRef: React.RefObject<any> }> = ({
  positions,
  controlsRef,
}) => {
  const { camera } = useThree();
  const fitted = useRef(false);

  useEffect(() => {
    if (positions.length === 0 || fitted.current) return;
    const box = new THREE.Box3();
    for (const p of positions) box.expandByPoint(new THREE.Vector3(...p));
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);

    camera.position.set(center.x + maxDim * 0.8, center.y + maxDim * 0.6, center.z + maxDim * 1.2);
    camera.lookAt(center);
    (camera as THREE.PerspectiveCamera).far = maxDim * 20;
    (camera as THREE.PerspectiveCamera).near = maxDim * 0.001;
    camera.updateProjectionMatrix();

    if (controlsRef.current) {
      controlsRef.current.target.copy(center);
      controlsRef.current.update();
    }
    fitted.current = true;
  }, [positions, camera, controlsRef]);

  return null;
};

// --- Cluster centroid + connecting lines ---
interface ClusterCentroidData {
  label: number;
  color: string;
  centroid: [number, number, number];
  memberPositions: [number, number, number][];
}

const ClusterCentroids: React.FC<{ clusters: ClusterCentroidData[] }> = ({ clusters }) => {
  return (
    <group>
      {clusters.map(cluster => {
        const col = new THREE.Color(cluster.color);

        // Build line segments: pairs of [centroid, member] for each member
        const lineVerts = new Float32Array(cluster.memberPositions.length * 6);
        for (let i = 0; i < cluster.memberPositions.length; i++) {
          const off = i * 6;
          lineVerts[off] = cluster.centroid[0];
          lineVerts[off + 1] = cluster.centroid[1];
          lineVerts[off + 2] = cluster.centroid[2];
          lineVerts[off + 3] = cluster.memberPositions[i][0];
          lineVerts[off + 4] = cluster.memberPositions[i][1];
          lineVerts[off + 5] = cluster.memberPositions[i][2];
        }

        return (
          <group key={`centroid-${cluster.label}`}>
            {/* Centroid sphere */}
            <mesh position={cluster.centroid}>
              <sphereGeometry args={[0.05, 16, 16]} />
              <meshStandardMaterial
                color={col}
                emissive={col}
              />
            </mesh>
            {/* Lines to children */}
            {cluster.memberPositions.length > 0 && (
              <lineSegments>
                <bufferGeometry>
                  <bufferAttribute
                    attach="attributes-position"
                    args={[lineVerts, 3]}
                    count={cluster.memberPositions.length * 2}
                  />
                </bufferGeometry>
                <lineBasicMaterial color={col} transparent opacity={0.4} />
              </lineSegments>
            )}
          </group>
        );
      })}
    </group>
  );
};

// --- Grid Floor ---
const FloorGrid: React.FC<{ size: number }> = ({ size }) => {
  return (
    <gridHelper args={[size, 20, '#27272a', '#18181b']} rotation={[0, 0, 0]} position={[0, -size / 2 * 0.5, 0]} />
  );
};

// --- Main ScatterView3D ---

interface ScatterView3DProps {
  items: GalleryItem[];
  selectedId: string | null;
  onSelect: (item: GalleryItem | null) => void;
}

interface ComputedLayout {
  positions: [number, number, number][];
  itemIds: string[];
  method: DimReductionMethod;
}

const ScatterView3D: React.FC<ScatterView3DProps> = ({ items, selectedId, onSelect }) => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [method, setMethod] = useState<DimReductionMethod>('pca');
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showCentroids, setShowCentroids] = useState(true);
  const [pointSize, setPointSize] = useState(1.0);
  const [showControls, setShowControls] = useState(() => !isMobile);
  const [isComputing, setIsComputing] = useState(false);
  const [layout, setLayout] = useState<ComputedLayout | null>(null);
  const controlsRef = useRef<any>(null);
  const prevMethodRef = useRef<DimReductionMethod | null>(null);

  useEffect(() => { setShowControls(!isMobile); }, [isMobile]);

  // Filter items with embeddings
  const readyItems = useMemo(
    () => items.filter(i => i.result?.embedding && i.enabled !== false),
    [items]
  );

  // Compute layout when method or data changes
  useEffect(() => {
    if (readyItems.length === 0) {
      setLayout(null);
      return;
    }

    // Skip recompute if same method and same item set
    if (
      layout &&
      layout.method === method &&
      layout.itemIds.length === readyItems.length &&
      layout.itemIds.every((id, i) => id === readyItems[i].id)
    ) {
      return;
    }

    let cancelled = false;
    setIsComputing(true);

    // Run async to not block UI
    const compute = async () => {
      // Yield to paint loading indicator
      await new Promise(r => setTimeout(r, 50));
      if (cancelled) return;

      const embeddings = readyItems.map(i => i.result!.embedding);

      let reduced: number[][];
      if (method === 'raw') {
        // Take first 3 dims or pad
        reduced = embeddings.map(e => {
          const r = [e[0] || 0, e[1] || 0, e[2] || 0];
          return r;
        });
      } else if (method === 'pca') {
        reduced = reducePCA(embeddings, 3);
      } else if (method === 'umap') {
        reduced = reduceUMAP(embeddings, 3, Math.min(15, Math.max(2, Math.floor(readyItems.length / 3))), 0.1, 200);
      } else {
        reduced = reduceTSNE(embeddings, 3, Math.min(30, Math.floor(readyItems.length / 3)), 300, 200);
      }

      if (cancelled) return;

      // Normalize to reasonable scale
      let maxAbs = 0;
      for (const r of reduced) {
        for (const v of r) maxAbs = Math.max(maxAbs, Math.abs(v));
      }
      const scale = maxAbs > 0 ? 10 / maxAbs : 1;
      const positions: [number, number, number][] = reduced.map(r => [
        (r[0] || 0) * scale,
        (r[1] || 0) * scale,
        (r[2] || 0) * scale,
      ]);

      if (cancelled) return;
      setLayout({
        positions,
        itemIds: readyItems.map(i => i.id),
        method,
      });
      setIsComputing(false);
    };

    compute();
    return () => { cancelled = true; };
  }, [readyItems, method]); // intentionally exclude layout to avoid infinite loops

  // Map of id -> item for fast lookup
  const itemMap = useMemo(() => {
    const m = new Map<string, GalleryItem>();
    items.forEach(i => m.set(i.id, i));
    return m;
  }, [items]);

  const gridSize = useMemo(() => {
    if (!layout) return 20;
    let maxAbs = 0;
    for (const p of layout.positions) {
      for (const v of p) maxAbs = Math.max(maxAbs, Math.abs(v));
    }
    return Math.ceil(maxAbs * 2.5);
  }, [layout]);

  const handleResetCamera = useCallback(() => {
    if (!controlsRef.current || !layout) return;
    const box = new THREE.Box3();
    for (const p of layout.positions) box.expandByPoint(new THREE.Vector3(...p));
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    controlsRef.current.target.copy(center);
    controlsRef.current.object.position.set(center.x + maxDim * 0.8, center.y + maxDim * 0.6, center.z + maxDim * 1.2);
    controlsRef.current.update();
  }, [layout]);

  // Reset fitted flag when method changes
  useEffect(() => {
    if (prevMethodRef.current !== null && prevMethodRef.current !== method) {
      // Will trigger re-fit via layout change
    }
    prevMethodRef.current = method;
  }, [method]);

  // Compute cluster centroid data
  const clusterData = useMemo<ClusterCentroidData[]>(() => {
    if (!layout) return [];
    // Group positions by hierarchical cluster identifier
    const groups = new Map<string | number, { positions: [number, number, number][]; item: GalleryItem }>();
    for (let i = 0; i < layout.itemIds.length; i++) {
      const item = itemMap.get(layout.itemIds[i]);
      if (!item) continue;
      if (item.clusterLabel === undefined || item.clusterLabel < 0) continue; // skip noise
      
      const clusterId = getClusterIdentifier(item);
      if (!groups.has(clusterId)) groups.set(clusterId, { positions: [], item });
      groups.get(clusterId)!.positions.push(layout.positions[i]);
    }
    const result: ClusterCentroidData[] = [];
    groups.forEach(({ positions, item }, clusterId) => {
      const cx = positions.reduce((s, p) => s + p[0], 0) / positions.length;
      const cy = positions.reduce((s, p) => s + p[1], 0) / positions.length;
      const cz = positions.reduce((s, p) => s + p[2], 0) / positions.length;
      result.push({
        label: typeof clusterId === 'string' ? parseInt(clusterId.split('-')[0]) : clusterId,
        color: getHierarchicalClusterColor(item),
        centroid: [cx, cy, cz],
        memberPositions: positions,
      });
    });
    return result;
  }, [layout, itemMap]);

  // Count clusters for footer
  const clusterStats = useMemo(() => {
    const labels = new Set<number>();
    let noiseCount = 0;
    readyItems.forEach(i => {
      const lbl = i.clusterLabel;
      if (lbl === undefined || lbl < 0) noiseCount++;
      else labels.add(lbl);
    });
    return { clusterCount: labels.size, noiseCount, total: readyItems.length };
  }, [readyItems]);

  if (readyItems.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 bg-gray-950/50 h-full">
        <AlertTriangle className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm">No embeddings available.</p>
        <p className="text-xs text-gray-700 mt-1">Run embeddings and clustering first.</p>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-800 group">
      {/* 3D Canvas */}
      <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing">
        <Canvas camera={{ fov: 50, near: 0.01, far: 5000 }}>
          <color attach="background" args={['#09090b']} />
          <ambientLight intensity={0.6} />
          <directionalLight position={[15, 15, 15]} intensity={0.8} />
          <pointLight position={[-10, -10, -10]} intensity={0.3} />

          {layout && !isComputing && (
            <>
              <AutoFitCamera positions={layout.positions} controlsRef={controlsRef} />
              <FloorGrid size={gridSize} />

              {showCentroids && clusterData.length > 0 && (
                <ClusterCentroids clusters={clusterData} />
              )}

              {layout.positions.map((pos, idx) => {
                const itemId = layout.itemIds[idx];
                const item = itemMap.get(itemId);
                if (!item) return null;

                const color = getHierarchicalClusterColor(item);
                const isSelected = item.id === selectedId;
                const imgUrl = item.thumbnailUrl || item.url;
                const sz = pointSize * (isSelected ? 1.3 : 1.0);

                if (showThumbnails && imgUrl) {
                  return (
                    <ThumbnailSprite
                      key={itemId}
                      position={pos}
                      imageUrl={imgUrl}
                      color={color}
                      size={sz}
                      selected={isSelected}
                      onClick={() => onSelect(item)}
                    />
                  );
                }

                return (
                  <DotPoint
                    key={itemId}
                    position={pos}
                    color={color}
                    size={sz}
                    selected={isSelected}
                    onClick={() => onSelect(item)}
                  />
                );
              })}
            </>
          )}

          <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.12} />
        </Canvas>
      </div>

      {/* Computing overlay */}
      {isComputing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-accent-500 animate-spin mb-3" />
            <span className="text-sm font-medium text-accent-100 animate-pulse">
              Computing {method.toUpperCase()} projection...
            </span>
          </div>
        </div>
      )}

      {/* Controls Panel */}
      <div className={`absolute top-2 md:top-4 left-2 right-2 md:left-auto md:right-4 md:w-64 bg-gray-900/90 backdrop-blur-md border border-gray-700 rounded-lg shadow-xl transition-all duration-300 z-30 ${showControls ? 'translate-y-0 md:translate-x-0 opacity-100' : 'translate-y-2 md:translate-y-0 md:translate-x-[110%] opacity-0 pointer-events-none'}`}>
        <div className="p-3 border-b border-gray-700 flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> 3D Scatter Controls
          </h3>
          <button onClick={() => setShowControls(false)} className="md:hidden p-1 text-gray-400 hover:text-white">
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs max-h-[65dvh] md:max-h-[60vh] overflow-y-auto">
          {/* Dimension Reduction Method */}
          <div>
            <span className="text-gray-400 block mb-1.5 text-[11px] font-semibold uppercase tracking-wide">Mapping</span>
            <div className="grid grid-cols-4 bg-gray-800 rounded p-1 gap-0.5">
              {(['raw', 'pca', 'umap', 'tsne'] as DimReductionMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  disabled={isComputing}
                  className={`py-1.5 rounded text-center text-[11px] font-medium transition-colors ${
                    method === m
                      ? 'bg-gray-700 text-white shadow'
                      : 'text-gray-400 hover:text-white disabled:opacity-40'
                  }`}
                >
                  {m === 'tsne' ? 't-SNE' : m === 'raw' ? 'Raw' : m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-gray-700" />

          {/* Display Options */}
          <div className="space-y-3">
            {/* Thumbnails toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-400">Show Thumbnails</span>
              <button
                onClick={() => setShowThumbnails(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  showThumbnails ? 'bg-accent-500' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  showThumbnails ? 'translate-x-4' : ''
                }`} />
              </button>
            </label>

            {/* Centroids toggle */}
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-gray-400">Centroids &amp; Lines</span>
              <button
                onClick={() => setShowCentroids(v => !v)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  showCentroids ? 'bg-accent-500' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  showCentroids ? 'translate-x-4' : ''
                }`} />
              </button>
            </label>

            {/* Point Size */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-400">Point Size</span>
                <span className="text-gray-500 font-mono">{pointSize.toFixed(1)}x</span>
              </div>
              <PrecisionSlider
                value={pointSize}
                min={0.3}
                max={3}
                step={0.1}
                onChange={v => setPointSize(v)}
                ariaLabel="Point Size"
                className="w-full"
              />
            </div>
          </div>

          <div className="h-px bg-gray-700" />

          {/* Reset Camera */}
          <button
            onClick={handleResetCamera}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Camera
          </button>
        </div>
      </div>

      {/* Toggle Button */}
      <button
        onClick={() => setShowControls(!showControls)}
        className="absolute top-4 right-2 md:right-4 p-2 bg-gray-800 text-gray-400 rounded-lg border border-gray-700 hover:text-white hover:bg-gray-700 z-10"
        title="Toggle Controls"
      >
        <Settings2 className="w-5 h-5" />
      </button>

      {/* Footer Stats */}
      <div className="absolute bottom-0 left-0 right-0 bg-gray-900/90 border-t border-gray-800 px-4 py-2 flex justify-between items-center text-xs text-gray-400 backdrop-blur-sm z-10 pointer-events-none">
        <div className="flex gap-4">
          <span>Points: {clusterStats.total}</span>
          <span className="hidden md:inline">Clusters: {clusterStats.clusterCount}</span>
          {clusterStats.noiseCount > 0 && (
            <span className="hidden md:inline text-gray-500">Noise: {clusterStats.noiseCount}</span>
          )}
        </div>
        <span className="text-accent-400 text-[11px]">
          {method === 'tsne' ? 't-SNE' : method === 'raw' ? 'Raw 3D' : method.toUpperCase()} &middot; Interactive 3D
        </span>
      </div>

      {/* Selected item info tooltip */}
      {selectedId && (() => {
        const sel = itemMap.get(selectedId);
        if (!sel) return null;
        const clusterPath = sel.clusterPath && sel.clusterPath.length > 0 
          ? sel.clusterPath.join(' → ')
          : (sel.clusterLabel !== undefined && sel.clusterLabel >= 0 ? String(sel.clusterLabel) : 'Noise');
        return (
          <div className="absolute bottom-10 left-4 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg p-2 flex items-center gap-2 z-20 max-w-xs pointer-events-none">
            {(sel.thumbnailUrl || sel.url) && (
              <img src={sel.thumbnailUrl || sel.url} className="w-10 h-10 rounded object-cover border border-gray-600" alt="" />
            )}
            <div className="min-w-0">
              <p className="text-xs text-white font-medium truncate">{sel.name}</p>
              <p className="text-[10px] text-gray-500">
                Cluster: {clusterPath}
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ScatterView3D;
