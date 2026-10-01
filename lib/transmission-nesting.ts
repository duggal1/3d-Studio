import * as THREE from "three";

/**
 * Nested-transmission repair (e.g. red wine inside a wine glass).
 *
 * three.js renders transmissive materials (`transmission > 0`) by sampling
 * a transmission framebuffer that contains opaque + transparent objects but
 * explicitly EXCLUDES other transmissive objects. So a transmissive liquid
 * seen through transmissive glass is invisible: every view ray to the wine
 * passes through the glass, and the glass samples a buffer the wine was
 * never drawn into.
 *
 * Fix: detect transmissive meshes strictly contained inside another
 * transmissive mesh and convert the inner ones to classic alpha blending,
 * which IS included in the transmission buffer and therefore shows through
 * the outer glass. Colour/opacity come from a Beer-Lambert approximation of
 * the material's own attenuation parameters, so red wine stays red.
 *
 * Trade-off: an inner transmissive object loses true refraction and becomes
 * an attenuating transparent surface. That is strictly better than invisible.
 */

interface TransmissiveEntry {
  mesh: THREE.Mesh;
  slot: number; // index into mesh.material (or -1 for single material)
  material: THREE.MeshPhysicalMaterial;
  box: THREE.Box3;
  diagonal: number;
  volume: number;
}

function isTransmissivePhysical(
  material: unknown,
): material is THREE.MeshPhysicalMaterial {
  return (
    material instanceof THREE.MeshPhysicalMaterial &&
    material.transmission > 0
  );
}

function collectTransmissiveMeshes(root: THREE.Object3D): TransmissiveEntry[] {
  root.updateWorldMatrix(true, true);

  const entries: TransmissiveEntry[] = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (let slot = 0; slot < materials.length; slot += 1) {
      const material = materials[slot];
      if (!isTransmissivePhysical(material)) continue;
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) continue;
      const size = box.getSize(new THREE.Vector3());
      entries.push({
        mesh: object,
        slot: Array.isArray(object.material) ? slot : -1,
        material,
        box,
        diagonal: size.length(),
        volume: size.x * size.y * size.z,
      });
    }
  });
  return entries;
}

/** True when `inner` sits strictly inside `outer` (with tolerance). */
function isStrictlyInside(inner: TransmissiveEntry, outer: TransmissiveEntry): boolean {
  if (inner === outer) return false;
  // Must be meaningfully smaller, otherwise adjacent/coplanar siblings match.
  if (!(outer.volume > inner.volume * 1.2)) return false;
  const tolerance = outer.diagonal * 0.02 + 1e-6;
  const expanded = outer.box.clone().expandByScalar(tolerance);
  return expanded.containsBox(inner.box);
}

function luminance(color: THREE.Color): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert an inner transmissive material to alpha blending using its own
 * attenuation (Beer-Lambert): transmittance T = C^(t/d), opacity = 1 - lum(T).
 * Falls back to a faint glass-like film when no attenuation data exists.
 */
function convertToAlphaBlend(
  material: THREE.MeshPhysicalMaterial,
  pathLength: number,
): void {
  const distance = material.attenuationDistance;
  let color = material.color.clone();
  let alpha = 0.3;

  if (Number.isFinite(distance) && distance > 0 && pathLength > 0) {
    const att = material.attenuationColor;
    const exponent = pathLength / distance;
    const transmitted = new THREE.Color(
      Math.pow(clamp01(att.r), exponent),
      Math.pow(clamp01(att.g), exponent),
      Math.pow(clamp01(att.b), exponent),
    );
    color = transmitted;
    alpha = 1 - luminance(transmitted);
  }

  material.color.copy(color);
  // Never fully clear: a nearly non-absorbing inner wall (plain glass)
  // still needs a faint visible film, otherwise it stays invisible.
  material.opacity = Math.min(1, Math.max(alpha, material.transparent ? material.opacity : 0.25));
  material.transparent = true;
  material.transmission = 0;
  material.needsUpdate = true;
}

/**
 * Walk `root`, convert nested transmissive materials to alpha blending.
 * Returns the number of converted material slots.
 */
export function resolveNestedTransmission(root: THREE.Object3D): number {
  const entries = collectTransmissiveMeshes(root);
  if (entries.length < 2) return 0;

  // Inner-first so a converted mesh leaves the transmissive set and deeper
  // nesting (glass -> wine -> ice) resolves against the remaining outer ones.
  const bySize = [...entries].sort((a, b) => a.volume - b.volume);
  const stillTransmissive = new Set(entries);
  let converted = 0;

  for (const inner of bySize) {
    if (!stillTransmissive.has(inner)) continue;

    const container = [...stillTransmissive].find(
      (outer) => outer.mesh !== inner.mesh && isStrictlyInside(inner, outer),
    );
    if (!container) continue;

    let material = inner.material;
    // Don't mutate a material instance the outer container also uses.
    const sharedWithOuter = [...stillTransmissive].some(
      (other) =>
        other !== inner &&
        other.material === material &&
        other.mesh !== inner.mesh,
    );
    if (sharedWithOuter) {
      material = material.clone();
      if (inner.slot >= 0 && Array.isArray(inner.mesh.material)) {
        const slots = [...inner.mesh.material];
        slots[inner.slot] = material;
        inner.mesh.material = slots;
      } else {
        inner.mesh.material = material;
      }
    }

    const thickness = material.thickness > 0 ? material.thickness : inner.diagonal * 0.5;
    convertToAlphaBlend(material, thickness);
    stillTransmissive.delete(inner);
    converted += 1;
  }

  return converted;
}
