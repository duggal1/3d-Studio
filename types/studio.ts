export type LoopMode = "once" | "repeat" | "pingpong";

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
}
