# Third-Party Licenses

This document lists the third-party dependencies used by **cluster-lab** and their respective licenses.

cluster-lab itself is licensed under the [MIT License](./LICENSE).

---

## Direct Production Dependencies

| Package | License | Repository | Version |
|---------|---------|------------|---------|
| [react](https://github.com/facebook/react) | MIT | https://github.com/facebook/react | 18.3.1 |
| [react-dom](https://github.com/facebook/react) | MIT | https://github.com/facebook/react | 18.3.1 |
| [three](https://github.com/mrdoob/three.js) | MIT | https://github.com/mrdoob/three.js | 0.164.0 |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) | MIT | https://github.com/pmndrs/react-three-fiber | 8.16.6 |
| [@react-three/drei](https://github.com/pmndrs/drei) | MIT | https://github.com/pmndrs/drei | 9.105.6 |
| [lucide-react](https://github.com/lucide-icons/lucide) | ISC | https://github.com/lucide-icons/lucide | 0.344.0 |
| [buffer](https://github.com/feross/buffer) | MIT | https://github.com/feross/buffer | 6.0.3 |
| [long](https://github.com/dcodeIO/long.js) | Apache-2.0 | https://github.com/dcodeIO/long.js | 5.2.3 |
| [@huggingface/transformers](https://github.com/huggingface/transformers) | Apache-2.0 (verify per version) | https://github.com/huggingface/transformers | 3.8.1 |

## External Model Weights / Hugging Face Models

These models are loaded dynamically at runtime via Hugging Face (either a public repo or a custom model ID). Always verify the license on the model card for the specific model and version.

| Model (Hugging Face ID) | License | Notes |
|------------------------|---------|-------|
| [facebook/dinov2-small](https://huggingface.co/facebook/dinov2-small) | Apache-2.0 | Base model license (used by Xenova/dinov2-small) |
| [Xenova/dinov2-small](https://huggingface.co/Xenova/dinov2-small) | Apache-2.0 (inherited from base model; verify on model card) | Used by default in the UI |

## Direct Development Dependencies

| Package | License | Repository | Version |
|---------|---------|------------|---------|
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 | https://github.com/microsoft/TypeScript | 5.8.2 |
| [vite](https://github.com/vitejs/vite) | MIT | https://github.com/vitejs/vite | ^6.2.0 |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | MIT | https://github.com/vitejs/vite-plugin-react | ^5.0.0 |
| [vite-plugin-pwa](https://github.com/antfu/vite-plugin-pwa) | MIT | https://github.com/antfu/vite-plugin-pwa | ^1.2.0 |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | MIT (DefinitelyTyped) | https://github.com/DefinitelyTyped/DefinitelyTyped | ^22.14.0 |

## Transitive Dependencies

Some direct dependencies bring in transitive packages with their own licenses. Notably, the Hugging Face JavaScript runtime uses ONNX Runtime under the hood (e.g., `onnxruntime-node`, `onnxruntime-web`, `onnxruntime-common`), which are licensed under **MIT**.

For a full list of transitive dependencies and their licenses, run:

```bash
npx license-checker --production
```

## Disclaimer

This project includes third-party open-source software. Each dependency is subject to its own license terms.

Some dependencies licensed under Apache-2.0 may include a NOTICE file that must be preserved when redistributing.

## License Summaries

### MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.

Full text: https://opensource.org/licenses/MIT

### Apache License 2.0

A permissive license that also provides an express grant of patent rights from contributors to users.

Full text: https://www.apache.org/licenses/LICENSE-2.0

### ISC License

A simplified version of the MIT/BSD licenses that is functionally equivalent to the MIT License.

Full text: https://opensource.org/licenses/ISC
