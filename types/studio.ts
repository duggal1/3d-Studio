export type LoopMode = "once" | "repeat" | "pingpong";

// Resolution tiers are supersampling budgets: 2k/4k/8k of rendered pixels,
// downsampled to the canvas by the compositor. See lib/render-scale.ts.
export type RenderQuality = "2k" | "4k" | "8k";

/** Actual draw-buffer state after every hardware and browser clamp. */
export interface RenderBuffer {
  dpr: number;
  bufferWidth: number;
  bufferHeight: number;
  clamped: boolean;
}

export interface RenderSettings {
  // 0 lifts the shadow contribution off surfaces entirely, 1 is full density.
  shadow: number;
  // Drives scene.environmentIntensity, so it scales every reflection off the
  // generated environment without touching material envMapIntensity.
  reflection: number;
}

// PNG is intentionally absent: a lit 3D still is roughly 8x heavier lossless
// for no visible gain.
export type StillFormat = "webp" | "jpeg";

export interface StillShot {
  index: number;
  label: string;
  kind: "interior" | "exterior";
  blob: Blob;
  width: number;
  height: number;
}

export interface ShotPreview {
  index: number;
  label: string;
  kind: "interior" | "exterior";
  url: string;
}

export interface AnimationInfo {
  index: number;
  name: string;
  duration: number;
  tracks: number;
}

export interface AssetMetadata {
  fileName: string;
  format: "GLB" | "GLTF";
  fileSize: number;
  sourceFiles: number;
  gltfVersion: string;
  generator?: string;
  scenes: number;
  nodes: number;
  meshes: number;
  skinnedMeshes: number;
  vertices: number;
  triangles: number;
  materials: number;
  textures: number;
  cameras: number;
  animations: number;
  bounds: [number, number, number];
}

export interface PlaybackSnapshot {
  selectedIndex: number;
  isPlaying: boolean;
  progress: number;
}

export interface LocalAssetBundle {
  id: string;
  entry: File;
  files: File[];
  format: "glb" | "gltf";
  resolveUrl: (url: string) => string;
  release: () => void;
}

export interface AnimationRuntimeHandle {
  play: (index?: number) => void;
  pause: () => void;
  stop: () => void;
  restart: () => void;
  seek: (progress: number) => void;
  setSpeed: (speed: number) => void;
  setLoop: (mode: LoopMode) => void;
  playAll: () => Promise<void>;
  cancelSequence: () => void;
  shoot: (count: number, format: StillFormat, quality: number) => Promise<StillShot[]>;
}
