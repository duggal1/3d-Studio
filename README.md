# 3d Studio

A local-first browser 3D asset studio built with Next.js, React, TypeScript, Tailwind CSS, Three.js, React Three Fiber, and Drei.

## Run

```bash
npm install
npm run dev
```

Production check:

```bash
npm run typecheck
npm run lint
npm run build
npm start
```

`postinstall` copies Three.js' Draco and Basis/KTX2 decoder assets from `node_modules` into `public/decoders`, so compressed GLB/GLTF files do not depend on a decoder CDN.

## Model loading

- `.glb` works as a single local file.
- `.gltf` can reference external `.bin` buffers and textures. Select or drop those files together with the `.gltf`; the loader resolves references locally by relative path and unambiguous filename.
- Nothing is uploaded to an application backend.
- Draco, Meshopt, and KTX2/Basis assets are supported.

## Video creation

`Create video` records the WebGL canvas at 60 fps with the browser's `MediaRecorder`, plays every embedded animation once in source order, then downloads the result. The codec is selected from the browser's supported WebM/MP4 options. Recording is real-time and contains the 3D viewport only, not the floating UI.

## Renderer

The production default is high-performance WebGL2 through Three.js/R3F. This is deliberate: it has the broadest stable compatibility with GLTF loaders, Drei controls/environment helpers, and `canvas.captureStream()` recording. Three.js WebGPU can be introduced as an opt-in renderer later without changing the asset/runtime architecture.
