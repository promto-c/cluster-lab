
import React, { useMemo, useRef, useState } from 'react';
import { LinkageStep } from '../types';

interface DendrogramProps {
  linkage: LinkageStep[];
  threshold: number;
  onThresholdChange: (newThreshold: number) => void;
  height?: number;
  color?: string;
}

// Helper to layout dendrogram recursively
// Returns map of ClusterID -> { x, y }
function layoutDendrogram(linkage: LinkageStep[], nSamples: number) {
    const coords = new Map<number, { x: number, y: number }>();
    
    // 1. Initialize Leaves
    // A simple layout: spread leaves evenly on X axis
    for(let i=0; i<nSamples; i++) {
        coords.set(i, { x: i, y: 0 });
    }
    
    // 2. Process Linkage
    // Linkage is sorted by distance usually, building up
    // newClusterId starts at nSamples
    
    // We also need lines for drawing: { x1, y1, x2, y2 }
    const lines: { x1: number, y1: number, x2: number, y2: number, key: string }[] = [];
    
    for(let i=0; i<linkage.length; i++) {
        const step = linkage[i];
        const cA = step.clusterA;
        const cB = step.clusterB;
        const dist = step.distance;
        const newId = step.newClusterId;
        
        const posA = coords.get(cA)!;
        const posB = coords.get(cB)!;
        
        // New X is average of children
        const newX = (posA.x + posB.x) / 2;
        // New Y is distance
        const newY = dist;
        
        coords.set(newId, { x: newX, y: newY });
        
        // Lines: 
        // 1. Vertical line from A up to dist
        lines.push({ x1: posA.x, y1: posA.y, x2: posA.x, y2: dist, key: `${cA}-v` });
        // 2. Vertical line from B up to dist
        lines.push({ x1: posB.x, y1: posB.y, x2: posB.x, y2: dist, key: `${cB}-v` });
        // 3. Horizontal line connecting A and B at dist
        lines.push({ x1: posA.x, y1: dist, x2: posB.x, y2: dist, key: `${newId}-h` });
    }
    
    return { coords, lines };
}

const Dendrogram: React.FC<DendrogramProps> = ({ linkage, threshold, onThresholdChange, height = 200, color = "#3b82f6" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const nSamples = linkage.length + 1; // n-1 steps
  
  const { lines } = useMemo(() => layoutDendrogram(linkage, nSamples), [linkage, nSamples]);
  
  // Scales
  const maxDist = linkage.length > 0 ? linkage[linkage.length - 1].distance * 1.1 : 1;
  // If threshold is higher than maxDist, adjust visualization scale
  const displayMaxY = Math.max(maxDist, threshold * 1.1);
  
  const margin = { top: 20, right: 10, bottom: 0, left: 10 };
  
  const handleInteraction = (clientY: number) => {
     if (!containerRef.current) return;
     const rect = containerRef.current.getBoundingClientRect();
     // In SVG, 0 is top. In our layout data, 0 is bottom (y=0 is leaf).
     // We need to invert logic.
     // SVG Y: 0 (Top) -> Height (Bottom)
     // Data Y: MaxDist (Top) -> 0 (Bottom)
     
     const relativeY = clientY - rect.top - margin.top;
     const drawHeight = height - margin.top - margin.bottom;
     
     // Inverse projection
     // svgY = drawHeight - (dataY / maxY) * drawHeight
     // (drawHeight - svgY) / drawHeight * maxY = dataY
     
     let newVal = ((drawHeight - relativeY) / drawHeight) * displayMaxY;
     newVal = Math.max(0, Math.min(displayMaxY, newVal));
     onThresholdChange(Math.round(newVal * 1000) / 1000);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      setIsDragging(true);
      handleInteraction(e.clientY);
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
      if(isDragging) handleInteraction(e.clientY);
  };
  
  const handleMouseUp = () => {
      setIsDragging(false);
  };
  
  // Projection Helper
  const project = (x: number, y: number) => {
      // X: 0 -> nSamples-1
      // Y: 0 -> displayMaxY
      const drawWidth = 100; // Use percentage for width
      const drawHeight = height - margin.top - margin.bottom;
      
      const px = (x / (nSamples - 1)) * 100;
      const py = drawHeight - (y / displayMaxY) * drawHeight; // Flip Y
      return { x: px, y: py + margin.top };
  };

  const thresholdY = project(0, threshold).y;

  return (
    <div 
        ref={containerRef}
        className={`relative w-full border border-gray-800 bg-gray-900 rounded overflow-hidden select-none cursor-crosshair ${isDragging ? 'cursor-grabbing' : ''}`}
        style={{ height: height }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
      <svg width="100%" height="100%" className="pointer-events-none">
         {/* Grid Lines */}
         <line x1="0" y1={margin.top} x2="100%" y2={margin.top} stroke="#374151" strokeDasharray="4" />
         <text x="5" y={margin.top - 5} fill="#6b7280" fontSize="10">Max Dist: {displayMaxY.toFixed(2)}</text>
         
         {/* Dendrogram Lines */}
         {lines.map(line => {
             const p1 = project(line.x1, line.y1);
             const p2 = project(line.x2, line.y2);
             return (
                 <line 
                    key={line.key}
                    x1={`${p1.x}%`} y1={p1.y}
                    x2={`${p2.x}%`} y2={p2.y}
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.6"
                 />
             );
         })}
         
         {/* Threshold Line */}
         <line 
            x1="0" y1={thresholdY}
            x2="100%" y2={thresholdY}
            stroke="#f472b6" // pink-400
            strokeWidth="2"
            strokeDasharray="4"
         />
      </svg>
      
      {/* Threshold Label Overlay */}
      <div 
        className="absolute right-2 px-2 py-1 bg-pink-500/20 text-pink-400 text-xs rounded border border-pink-500/30 font-mono pointer-events-none"
        style={{ top: Math.max(0, thresholdY - 24) }}
      >
        Cut: {threshold.toFixed(3)}
      </div>
      
      <div className="absolute bottom-1 left-2 text-[10px] text-gray-500 pointer-events-none">
         Items: {nSamples}
      </div>
    </div>
  );
};

export default Dendrogram;
