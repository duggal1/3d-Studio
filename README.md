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

## Render quality

The quality menu sets a pixel budget, not an output resolution: 2K (2560x1440), 4K (3840x2160), or 8K (7680x4320). `targetDpr` in `lib/render-scale.ts` solves for the device-pixel ratio needed to cover that budget at the current canvas size, never below the display's native ratio, then `clampDpr` trims it to `MAX_TEXTURE_SIZE` and `MAX_RENDERBUFFER_SIZE` so 8K degrades to what the GPU can actually back instead of failing.

The draw buffer is then supersampled and box-filtered down to the canvas by the compositor. That is what removes edge aliasing and texture shimmer. There is no learned upscaler in the pipeline — nothing is inferred or hallucinated, the extra samples are real rendered pixels. MSAA is left on from context creation (R3F builds the renderer once, so it cannot follow a runtime change without discarding the loaded model), and orbiting falls back to native dpr until the camera settles.

Exported stills inherit the active tier's resolution, capped at 3840px wide by the JS encode path.

## Lighting settings

Two controls, both live. `Shadow` writes `key.shadow.intensity`, so 0 lifts the contact shadow off surfaces without recompiling shaders. `Reflection` writes `scene.environmentIntensity`, which scales every reflection off drei's generated environment in one assignment rather than walking each material's `envMapIntensity`.

The key light's shadow camera is orthographic and refits to the loaded model's bounds once it settles, so the contact shadow is not clipped and texel density stays high. The map is 2048, or 4096 at the 8K tier.

## Cinematic stills

Loading a model automatically plans and renders a short shot list. The planner probes candidate camera points inside the model's bounding box and keeps the ones where most rays immediately hit geometry, which is what separates an interior (a house, a room, a cabin) from a free-standing object. Interiors get the camera inside the space at eye height with a wide lens; the rest of the shots are exterior orbits on golden-angle azimuths at varying heights, so successive angles are far apart instead of small visible steps.

The shot count (3, 4, 5, 6, 8) and the format (WebP or JPEG) are both selectable. PNG is not offered. Each thumbnail downloads individually, or use `Download all`.

Stills are 1600x900 and are read back with `gl.readPixels` from the default framebuffer immediately after an offscreen-camera `render()`. Three.js only applies tone mapping and the sRGB transfer when the render target is the canvas, so a `WebGLRenderTarget` grab would come back linear and blown out.

## Renderer

The production default is high-performance WebGL2 through Three.js/R3F. This is deliberate: it has the broadest stable compatibility with GLTF loaders, Drei controls/environment helpers, and `canvas.captureStream()` recording. Three.js WebGPU can be introduced as an opt-in renderer later without changing the asset/runtime architecture.
