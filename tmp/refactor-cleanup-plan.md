# Low-Risk Refactor Plan: Next Reusable Components Cleanup

## Summary
Code review found several strong, low-risk cleanup targets similar to the recent `FileFolderPickerActions` extraction.  
Priority is maintainability reduction with no behavior changes, using **local-first subcomponents** inside existing files unless a pattern is already cross-file.

## Findings (Prioritized)
1. High impact duplication in `components/ClusteringView.tsx:687`, `components/ClusteringView.tsx:708`, `components/ClusteringView.tsx:727`, `components/ClusteringView.tsx:742`, `components/ClusteringView.tsx:854`, `components/ClusteringView.tsx:893`, `components/ClusteringView.tsx:923`, `components/ClusteringView.tsx:954`.  
The same labeled number-control pattern appears many times across quick-controls and full config sections.

2. High impact duplication in `components/steps/ModelSetup.tsx:629`, `components/steps/ModelSetup.tsx:652`, `components/steps/ModelSetup.tsx:674`.  
Three nearly identical local model requirement cards (`Model File`, `Config`, `Preprocessor`) differ mostly by icon/accept/state.

3. Medium impact duplication in `components/steps/ModelSetup.tsx:748`, `components/steps/ModelSetup.tsx:819`, `components/steps/ModelSetup.tsx:847`.  
Three preprocessing option cards (`Pad`, `Stretch`, `Crop`) repeat a large shared wrapper structure.

4. Medium impact duplication in `components/steps/DatasetUpload.tsx:300` and `components/steps/DatasetUpload.tsx:338`.  
Example dataset button rendering is duplicated in mobile and desktop sections.

5. Medium impact duplication in `components/Gallery.tsx:623`, `components/Gallery.tsx:627`, `components/Gallery.tsx:792`, `components/Gallery.tsx:800`.  
Export actions (`Lite`/`Full`) are duplicated between mobile “More” and desktop export menu.

## Implementation Plan
1. Refactor `components/Gallery.tsx` export actions into one source of truth.  
Create local `EXPORT_ACTIONS` constant and `renderExportAction` helper.  
Reuse same action descriptors for mobile “More” and desktop dropdown.  
Keep desktop descriptions and current order exactly unchanged.

2. Keep `FileFolderPickerActions` as shared cross-file component.  
No additional cross-file extraction in this wave unless a new duplication appears in at least two files.

## Important API / Interface / Type Changes
1. No public app API changes.  
2. No service-layer or domain type changes.  
3. New internal/local prop interfaces inside files only (`LabeledNumberControlProps`, `LocalModelRequirementCardProps`, `ResizeMethodCardProps`, `ExampleDatasetButtonsProps`).  
4. No new exported types required.

## Test Cases and Scenarios
1. Build validation: run `npm run build` and ensure TypeScript + Vite succeed.
2. Clustering UI parity: verify quick-controls and full config controls still update same `config` fields for all algorithms.
3. Model setup parity: verify missing/ready states for `Model File`, `Config`, `Preprocessor` still gate initialize button exactly as before.
4. Preprocessing parity: verify `Pad`, `Stretch`, `Crop` selection and pad-style swatches produce identical config values.
5. Dataset examples parity: verify example loading works in both mobile and desktop layouts with same dataset count behavior.
6. Gallery export parity: verify `Export Lite` and `Export Full` both work from mobile and desktop menus.

## Assumptions and Defaults
1. Scope is **low-risk extracts only**; no behavioral redesign.
2. Placement is **local-first**; do not create new shared components unless reused across files.
3. Preserve existing CSS class behavior and visual output (except harmless DOM reshaping from extraction).
4. Do not refactor business logic, async flows, or state model structure in this wave.
