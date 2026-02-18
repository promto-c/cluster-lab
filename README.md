# ClusterLab

ClusterLab is a browser-based workspace for image embeddings and clustering.  
You can run DINOv2 models from Hugging Face or local ONNX files, extract embeddings, visualize patch features in 3D, and explore clusters interactively.

## Live Demo
https://promto-c.github.io/cluster-lab/

## Features

- 4-step pipeline: `Initialize -> Dataset -> Embed -> Cluster`
- Model sources: Hugging Face (`Xenova/dinov2-small`, `base`, `large`, or custom repo ID), local ONNX model folder, or classical CV descriptors (Color Histogram, LBP, GLCM, HOG)
- Preprocessing controls: `Letterbox Pad` (blur or solid), `Stretch`, `Center Crop`
- Dataset tooling: add files/folders, example datasets, enable/disable/focus batch controls
- Embedding studio: batch embedding generation, 3D patch visualization (PCA or channel mode), and local vs global PCA color basis
- Clustering lab: Agglomerative, KMeans, HDBSCAN-style density clustering, and BIRCH with cosine/euclidean metrics, normalization, auto-tuning, and dendrogram thresholding
- Hierarchical drill-down clustering across sub-clusters
- Import/export embeddings as JSON (`lite` or `full` with patches)

## Tech Stack

- React 18 + TypeScript + Vite
- `@xenova/transformers` for in-browser model inference
- ONNX Runtime Web (WASM assets in `public/onnxruntime`)
- Three.js + React Three Fiber for 3D visualization

## Run Locally

Prerequisites: Node.js 18+

1. Install dependencies:
   `npm install`
2. Start dev server:
   `npm run dev`

## Build

1. Sync ONNX Runtime WebAssembly assets (optional; automatically runs before build):
   `npm run sync:onnx-wasm`
2. Create production build:
   `npm run build`
3. Preview production build:
   `npm run preview`

## Deploy to GitHub Pages

This repository includes `.github/workflows/deploy-pages.yml` for automatic deployment.

1. Push to the `main` branch.
2. In GitHub, open `Settings -> Pages`.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Wait for the `Deploy to GitHub Pages` workflow to finish.
5. Your site will be available at:
   `https://promto-c.github.io/cluster-lab/`

Notes:

- If your default branch is not `main`, update the workflow trigger in `.github/workflows/deploy-pages.yml`.
- The build uses `VITE_BASE_PATH` so asset paths resolve correctly for GitHub Pages project URLs.

## ONNX Runtime WASM Assets

- The app self-hosts ONNX Runtime WASM binaries in `public/onnxruntime`.
- `npm run build` automatically syncs required variants from `onnxruntime-web` via `prebuild`.
- Runtime path uses `import.meta.env.BASE_URL`, so this works on GitHub Pages project URLs.

## Local Model Folder Requirements

When using **Local Folder** mode, include:

- `model.onnx` (or another `.onnx` file selected in the UI)
- `config.json`
- `preprocessor_config.json`

## Workflow Quick Start

1. **Initialize**: choose model source and preprocessing, then initialize model/algorithms.
2. **Dataset**: import images (or load examples).
3. **Embed**: run embeddings and inspect patch features in the visualizer.
4. **Cluster**: pick algorithm/settings, run clustering, and drill down into sub-clusters.
