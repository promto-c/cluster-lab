import React from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { ClusteringAlgorithm } from '@/types';

type AlgorithmHelpContent = {
  title: string;
  summary: string;
  howItWorks: string[];
  tuning: string[];
  note?: string;
};

const ALGORITHM_HELP: Record<ClusteringAlgorithm, AlgorithmHelpContent> = {
  AGGLOMERATIVE: {
    title: 'Agglomerative Hierarchy',
    summary: 'Starts with one item per cluster, then repeatedly merges the closest pair into a dendrogram.',
    howItWorks: [
      'Pairwise distances are computed from the embeddings using the selected metric, with optional L2 normalization first.',
      'The tree is built bottom-up with the chosen linkage rule. Average linkage blends both groups; complete linkage uses the farthest pair and stays stricter.',
      'The pink cut line uses `distanceThreshold`: merges below that height stay together, and smaller-than-minimum groups are relabeled as noise.',
    ],
    tuning: [
      'ClusterLab scores many candidate split counts using silhouette score after applying the minimum-cluster-size filter.',
      'It does a coarse sweep across a wide `k` range, refines around the best score, then converts that best split back into a cut distance just below the chosen dendrogram merge height.',
    ],
  },
  HDBSCAN: {
    title: 'HDBSCAN-Style Density Clustering',
    summary: 'Finds dense neighborhoods, grows clusters from them, and leaves sparse points as noise.',
    howItWorks: [
      'This build uses a DBSCAN-like density pass: points need enough neighbors inside `epsilon` to become cluster seeds.',
      'Neighbor-connected dense regions expand into clusters, while isolated points and undersized groups stay marked as noise.',
      '`Min Cluster Size` is enforced again after clustering so tiny groups are dropped consistently.',
    ],
    tuning: [
      'There is no dendrogram cut point here. Instead, ClusterLab estimates a good density radius and neighborhood size.',
      'It sets `minSamples` from dataset size, samples the sorted k-distance curve, and uses the elbow of that curve as the suggested `epsilon`.',
    ],
  },
  KMEANS: {
    title: 'K-Means Centroid Clustering',
    summary: 'Places `k` centroids, assigns each point to the nearest one, then recenters until the assignments settle.',
    howItWorks: [
      'The current implementation starts from random points as centroids, then alternates assignment and centroid recomputation.',
      'Each image joins the nearest centroid under the selected metric, and the loop stops when assignments stabilize or `Max Iterations` is reached.',
      'Unlike agglomerative clustering, this method does not produce a tree or cut threshold.',
    ],
    tuning: [
      'There is no cut point here. ClusterLab searches for the best `k` instead.',
      'It tries several `k` values, runs a short clustering pass for each one, and keeps the `k` with the highest simplified silhouette score.',
    ],
  },
  BIRCH: {
    title: 'BIRCH Prototype Mode',
    summary: 'Intended for fast incremental clustering, but this demo currently uses a lightweight placeholder implementation.',
    howItWorks: [
      'In a full BIRCH workflow, points are summarized into a branching clustering tree and then optionally grouped into final clusters.',
      'In this app today, the BIRCH path falls back to a short centroid-based pass, so it behaves more like a quick approximation than a full CF-tree build.',
      'That means the current `Radius Threshold` and `Branching Factor` controls are scaffolded for a fuller implementation rather than deeply driving the result yet.',
    ],
    tuning: [
      'There is no automatic cut-point search for BIRCH in the current build.',
      'Reset restores the default values, but smart parameter optimization is only enabled for agglomerative, K-means, and the density-based mode.',
    ],
    note: 'This note is intentionally explicit so the UI reflects the current implementation honestly.',
  },
};

export const CLUSTERING_ALGORITHM_LABELS: Record<ClusteringAlgorithm, string> = {
  AGGLOMERATIVE: 'Agglomerative',
  HDBSCAN: 'HDBSCAN',
  KMEANS: 'K-Means',
  BIRCH: 'BIRCH',
};

export const CLUSTERING_ALGORITHM_EYEBROWS: Record<ClusteringAlgorithm, string> = {
  AGGLOMERATIVE: 'Tree Cut',
  HDBSCAN: 'Density',
  KMEANS: 'Centroid',
  BIRCH: 'Prototype',
};

interface AlgorithmHelpButtonProps {
  algorithm: ClusteringAlgorithm;
  isOpen: boolean;
  onClick: () => void;
}

export const AlgorithmHelpButton: React.FC<AlgorithmHelpButtonProps> = ({ algorithm, isOpen, onClick }) => (
  <Button
    type="button"
    variant="ghost"
    onClick={onClick}
    aria-label={`Explain how ${CLUSTERING_ALGORITHM_LABELS[algorithm]} works`}
    aria-pressed={isOpen}
    title={`About ${CLUSTERING_ALGORITHM_LABELS[algorithm]}`}
    className={`h-7 w-7 shrink-0 rounded-full px-0 py-0 text-[11px] font-bold ${
      isOpen
        ? 'border-accent-400/60 bg-accent-500/15 text-accent-200 hover:border-accent-300 hover:text-white hover:bg-accent-500/20'
        : 'border-gray-700 bg-gray-950/80 text-gray-400 hover:border-gray-500 hover:text-white'
    }`}
  >
    i
  </Button>
);

interface ClusteringMethodGuideProps {
  algorithm: ClusteringAlgorithm;
  onClose: () => void;
}

const ClusteringMethodGuide: React.FC<ClusteringMethodGuideProps> = ({ algorithm, onClose }) => {
  const help = ALGORITHM_HELP[algorithm];
  const eyebrow = CLUSTERING_ALGORITHM_EYEBROWS[algorithm];

  return (
    <div className="mb-4 rounded-xl border border-accent-500/20 bg-gradient-to-br from-accent-500/10 via-gray-950 to-gray-950 p-4 shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-accent-300">
            <HelpCircle className="w-4 h-4 shrink-0" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Method Guide</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{help.title}</h3>
            <span className="inline-flex rounded-full border border-accent-400/30 bg-accent-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-accent-100">
              {eyebrow}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-gray-300">{help.summary}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 transition-colors hover:border-gray-500 hover:text-white"
        >
          Hide
        </button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">How It Works</p>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-gray-300">
            {help.howItWorks.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400/80"></span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Best Split / Auto Tune</p>
          <ul className="mt-2 space-y-2 text-xs leading-relaxed text-gray-300">
            {help.tuning.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/80"></span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {help.note && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
          {help.note}
        </p>
      )}
    </div>
  );
};

export default ClusteringMethodGuide;
