import * as THREE from "three";

export type ShotKind = "interior" | "exterior";

export interface CinematicShot {
  label: string;
  kind: ShotKind;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

// A point counts as inside an enclosed space (a room, a car cabin, a corridor)
// when rays fired in most directions immediately hit geometry. Rooms are the
// only place worth walking the camera into, so this is the whole test.
const ENCLOSURE_DIRECTIONS = 14;
const ENCLOSURE_THRESHOLD = 0.72;
const INTERIOR_FOV = 68;
const MAX_INTERIOR_POINTS = 4;

const EXTERIOR_LABELS = [
  "Establishing",
  "Low hero",
  "Three-quarter",
  "High angle",
  "Detail push",
  "Wide drift",
];

function buildDirections(count: number): THREE.Vector3[] {
  const directions: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index += 1) {
    const y = 1 - (index / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * index;
    directions.push(new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius));
  }

  return directions;
}

const RAY_DIRECTIONS = buildDirections(ENCLOSURE_DIRECTIONS);
const raycaster = new THREE.Raycaster();

function enclosureRatio(group: THREE.Object3D, point: THREE.Vector3, range: number): number {
  let hits = 0;

  for (const direction of RAY_DIRECTIONS) {
    raycaster.set(point, direction);
    raycaster.near = 0;
    raycaster.far = range;
    if (raycaster.intersectObject(group, true).length > 0) hits += 1;
  }

  return hits / RAY_DIRECTIONS.length;
}

function candidatePoints(bounds: THREE.Box3): THREE.Vector3[] {
  const size = bounds.getSize(new THREE.Vector3());
  const points: THREE.Vector3[] = [];

  for (const height of [0.5, 0.34, 0.66]) {
    for (const x of [0.28, 0.62]) {
      for (const z of [0.62, 0.28]) {
        points.push(new THREE.Vector3(
          bounds.min.x + size.x * x,
          bounds.min.y + size.y * height,
          bounds.min.z + size.z * z,
        ));
      }
    }
  }

  return points;
}

function findInteriorPoints(group: THREE.Object3D, bounds: THREE.Box3): THREE.Vector3[] {
  const size = bounds.getSize(new THREE.Vector3());
  const range = size.length() * 2;
  const minSeparation = Math.max(size.x, size.y, size.z) * 0.22;
  const found: THREE.Vector3[] = [];

  for (const candidate of candidatePoints(bounds)) {
    if (found.length >= MAX_INTERIOR_POINTS) break;
    if (found.some((point) => point.distanceTo(candidate) < minSeparation)) continue;
    if (enclosureRatio(group, candidate, range) < ENCLOSURE_THRESHOLD) continue;
    found.push(candidate);
  }

  return found;
}

function exteriorShot(index: number, bounds: THREE.Box3, aspect: number): CinematicShot {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const verticalFov = THREE.MathUtils.degToRad(40);
  const fit = Math.max(
    maxDim / (2 * Math.tan(verticalFov / 2)),
    maxDim / (2 * Math.tan(verticalFov / 2) * Math.max(aspect, 0.5)),
  );

  // Golden-angle azimuths keep successive shots far apart on the orbit
  // instead of walking in small visible steps.
  const azimuth = 0.9 + index * 2.399;
  const elevation = [-0.05, 0.16, 0.42, 0.62][index % 4];
  const distance = fit * [1.05, 0.82, 1.2, 0.95][index % 4];
  const horizontal = Math.cos(elevation) * distance;
  const position = new THREE.Vector3(
    center.x + Math.cos(azimuth) * horizontal,
    center.y + Math.sin(elevation) * distance + size.y * 0.08,
    center.z + Math.sin(azimuth) * horizontal,
  );

  return {
    label: EXTERIOR_LABELS[index % EXTERIOR_LABELS.length],
    kind: "exterior",
    position,
    target: center.clone().setY(center.y + size.y * 0.05),
    fov: index % 2 === 0 ? 40 : 32,
  };
}

function interiorShot(
  index: number,
  points: THREE.Vector3[],
  bounds: THREE.Box3,
): CinematicShot {
  const size = bounds.getSize(new THREE.Vector3());
  const position = points[index % points.length].clone();
  const anchor = points[(index + 1) % points.length];
  const target = anchor.clone();

  // When only one interior point survives, aim across the room instead.
  if (points.length === 1 || position.distanceTo(anchor) < size.length() * 0.1) {
    const center = bounds.getCenter(new THREE.Vector3());
    target.set(
      center.x,
      bounds.min.y + size.y * 0.5,
      center.z,
    );
  }

  return {
    label: points.length === 1 ? "Interior" : `Interior ${(index % points.length) + 1}`,
    kind: "interior",
    position,
    target,
    fov: INTERIOR_FOV,
  };
}

export function planCinematicShots(
  group: THREE.Object3D,
  bounds: THREE.Box3,
  count: number,
  aspect: number,
): CinematicShot[] {
  const total = Math.max(1, Math.round(count));
  const interiorPoints = findInteriorPoints(group, bounds);
  const interiorCount = interiorPoints.length === 0
    ? 0
    : Math.min(interiorPoints.length, Math.max(1, Math.round(total * 0.6)));

  const shots: CinematicShot[] = [];

  for (let index = 0; index < interiorCount; index += 1) {
    shots.push(interiorShot(index, interiorPoints, bounds));
  }

  for (let index = shots.length; index < total; index += 1) {
    shots.push(exteriorShot(index - interiorCount, bounds, aspect));
  }

  return shots;
}