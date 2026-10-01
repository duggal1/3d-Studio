import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AssetMetadata, LocalAssetBundle } from "@/types/studio";

function collectTextures(material: THREE.Material, target: Set<string>): void {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) target.add(value.uuid);
  }
}

export function buildMetadata(gltf: GLTF, asset: LocalAssetBundle): AssetMetadata {
  const materials = new Set<string>();
  const textures = new Set<string>();
  let nodes = 0;
  let meshes = 0;
  let skinnedMeshes = 0;
  let vertices = 0;
  let triangles = 0;

  gltf.scene.traverse((object) => {
    nodes += 1;

    if (!(object instanceof THREE.Mesh)) return;
    meshes += 1;
    if (object instanceof THREE.SkinnedMesh) skinnedMeshes += 1;

    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;

    if (position) vertices += position.count * instanceCount;
    const triangleCount = geometry.index
      ? geometry.index.count / 3
      : position
        ? position.count / 3
        : 0;
    triangles += Math.floor(triangleCount * instanceCount);

    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of meshMaterials) {
      materials.add(material.uuid);
      collectTextures(material, textures);
    }
  });

  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  const size = bounds.getSize(new THREE.Vector3());

  return {
    fileName: asset.entry.name,
    format: asset.format === "glb" ? "GLB" : "GLTF",
    fileSize: asset.entry.size,
    sourceFiles: asset.files.length,
    gltfVersion: String(gltf.asset?.version ?? "2.0"),
    generator: gltf.asset?.generator,
    scenes: gltf.scenes.length,
    nodes,
    meshes,
    skinnedMeshes,
    vertices,
    triangles,
    materials: materials.size,
    textures: textures.size,
    cameras: gltf.cameras.length,
    animations: gltf.animations.length,
    bounds: [size.x, size.y, size.z],
  };
}

export function disposeScene(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;

    object.geometry?.dispose();
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    for (const material of meshMaterials) {
      materials.add(material);
      const record = material as unknown as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) {
    const data = texture.source?.data as { close?: () => void } | undefined;
    if (typeof data?.close === "function") data.close();
    texture.dispose();
  }

  for (const material of materials) material.dispose();
}
