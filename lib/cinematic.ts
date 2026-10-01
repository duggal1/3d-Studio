import * as THREE from "three";

export type ShotKind = "interior" | "exterior";

export interface CinematicShot {
  label: string;
  kind: ShotKind;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

interface InteriorPoint {
  position: THREE.Vector3;
  // Unit vector toward the most open direction from this point, i.e. the axis
  // that shows the most of the space. Aiming down it is what turns a camera
  // dropped into a tunnel into a composed shot rather than a wall of brick.
  view: THREE.Vector3;
  // Distance along `view` to the first hit, used to frame the shot.
  reach: number;
}

// A point counts as inside an enclosed space when rays fired in most
// directions immediately hit geometry. This is the only signal that separates
// "a room I can walk into" from "a free-standing object", and it is the single
// most important input to the whole planner.
const ENCLOSURE_DIRECTIONS = 24;
const ENCLOSURE_THRESHOLD = 0.7;

// A grid this dense finds walkable space in a room whose usable volume is a
// small fraction of its bounding box. 12 z samples caught the middle of a long
// corridor; 8 put the camera in solid geometry often enough to matter.
const GRID_X = 5;
const GRID_Y = 3;
const GRID_Z = 9;

const MIN_INTERIOR_POINTS = 3;
const MAX_INTERIOR_POINTS = 6;
const INTERIOR_FOV = 62;
const EYE_HEIGHT_RATIO = 0.58;

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
const UP = new THREE.Vector3(0, 1, 0);

interface RayProbe {
  hits: number;
  bestDirection: THREE.Vector3;
  bestReach: number;
  // Shortest ray in the set. Small means the point is buried in geometry even
  // if most directions technically hit something.
  minReach: number;
}

/**
 * Fires the shared ray set from one point and reports how enclosed it is, the
 * most open direction (for aiming), and how much clearance it has in every
 * direction (for rejecting points buried in a wall).
 */
function probe(
  group: THREE.Object3D,
  point: THREE.Vector3,
  range: number,
): RayProbe {
  let hits = 0;
  let bestReach = -1;
  let minReach = Number.POSITIVE_INFINITY;
  let bestDirection = RAY_DIRECTIONS[0];

  for (const direction of RAY_DIRECTIONS) {
    raycaster.set(point, direction);
    raycaster.near = 0;
    raycaster.far = range;
    const intersections = raycaster.intersectObject(group, true);

    if (intersections.length > 0) {
      hits += 1;
      const reach = intersections[0].distance;
      if (reach < minReach) minReach = reach;
      if (reach > bestReach) {
        bestReach = reach;
        bestDirection = direction;
      }
    }
  }

  return {
    hits: hits / RAY_DIRECTIONS.length,
    bestDirection,
    // No hit at all means open sky; treat the full range as the reach so an
    // outdoor point does not collapse to a zero-length shot.
    bestReach: bestReach < 0 ? range : bestReach,
    minReach: Number.isFinite(minReach) ? minReach : range,
  };
}

function findInteriorPoints(
  group: THREE.Object3D,
  bounds: THREE.Box3,
): InteriorPoint[] {
  const size = bounds.getSize(new THREE.Vector3());
  const range = size.length() * 2;
  // A tenth of the longest axis. Tight enough to keep several cameras in one
  // corridor, loose enough that they do not collapse onto the same spot.
  const minSeparation = Math.max(size.x, size.y, size.z) * 0.1;
  // The floor, the ceiling, and the masonry around it all sit inside the
  // bounding box, and a point buried in any of them still registers as
  // "enclosed" because most rays do hit something. The test that separates
  // them is proportional clearance: a real room has open air in *every*
  // direction, a point in a wall has a ray of near-zero length. Referenced to
  // the box diagonal rather than the smallest axis, because a long corridor's
  // useful clearance is a fraction of its length, not of its ceiling height.
  // A point is usable when the shortest of the 24 rays still crosses a real
  // gap. Expressed as a fraction of the box diagonal: generous enough that a
  // narrow corridor's usable air passes, tight enough that a point sitting in
  // a wall (where the shortest ray is ~0) does not.
  const minClearance = Math.max(range * 0.004, 0.0005);
  const found: InteriorPoint[] = [];

  for (const yStep of [0.5, 0.4, 0.6]) {
    for (let zStep = 0; zStep < GRID_Z; zStep += 1) {
      for (let xStep = 0; xStep < GRID_X; xStep += 1) {
        if (found.length >= MAX_INTERIOR_POINTS) return found;

        // The cross-section is sampled much tighter than the length. A room's
        // usable air is a small fraction of its footprint once walls and
        // masonry are counted, and sampling the full width parks the camera
        // inside the wall it was meant to shoot from.
        const candidate = new THREE.Vector3(
          bounds.min.x + size.x * (0.5 + (xStep / (GRID_X - 1) - 0.5) * 0.82),
          bounds.min.y + size.y * yStep,
          bounds.min.z + size.z * (0.5 + (zStep / (GRID_Z - 1) - 0.5) * 0.55),
        );

        if (found.some((entry) => entry.position.distanceTo(candidate) < minSeparation)) {
          continue;
        }

        const result = probe(group, candidate, range);
        if (result.hits < ENCLOSURE_THRESHOLD) continue;
        if (result.minReach < minClearance) continue;

        found.push({
          position: candidate,
          view: result.bestDirection.clone(),
          reach: result.bestReach,
        });
      }
    }
  }

  return found;
}

function interiorShot(index: number, points: InteriorPoint[], bounds: THREE.Box3): CinematicShot {
  const size = bounds.getSize(new THREE.Vector3());
  const point = points[index % points.length];

  // Every shot gets its own lens and its own framing distance, cycled across
  // the set. A run of identical positions and fovs reads as one frame repeated,
  // not as coverage of a space.
  const framing = [0.55, 0.32, 0.75, 0.44, 0.62, 0.38][index % 6];
  const reach = point.reach;

  // The camera never travels back along the view axis. On a short axis that
  // step crosses the wall behind the lens and the shot renders from inside the
  // masonry. Offsetting sideways instead keeps the camera in open air while
  // still giving each shot its own angle.
  const position = point.position.clone()
    .addScaledVector(UP, [0, 0.06, -0.1, 0.14, 0.02, 0.1][index % 6])
    .addScaledVector(point.view, -Math.min(reach * 0.06, 0.4));
  const target = point.position.clone().addScaledVector(point.view, reach * framing);

  // Alternating wide and tight lenses. A long lens down a corridor compresses
  // the arches; a wide one holds the room.
  const fov = index % 2 === 0
    ? INTERIOR_FOV
    : Math.round(INTERIOR_FOV * 0.66);

  return {
    label: points.length === 1 ? "Interior" : `Interior ${(index % points.length) + 1}`,
    kind: "interior",
    position,
    target,
    fov,
  };
}

function exteriorShot(index: number, bounds: THREE.Box3, aspect: number): CinematicShot {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(40);

  // The bounding sphere, not the longest axis. A long flat model (a tunnel, a
  // bridge, a ship) has a huge axis and a modest radius; framing off the axis
  // is what parks the camera kilometres away from a sliver of geometry.
  const radius = Math.max(size.length() * 0.5, 0.001);
  const fit = radius / Math.sin(Math.min(verticalFov, Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.5))) / 2);

  // Golden-angle azimuths keep successive shots far apart on the orbit
  // instead of walking in small visible steps.
  const azimuth = 0.9 + index * 2.399;
  const elevation = [-0.05, 0.16, 0.42, 0.62][index % 4];
  const distance = fit * [1.15, 0.9, 1.3, 1.02][index % 4];
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

export function planCinematicShots(
  group: THREE.Object3D,
  bounds: THREE.Box3,
  count: number,
  aspect: number,
): CinematicShot[] {
  const total = Math.max(1, Math.round(count));
  const interior = findInteriorPoints(group, bounds);
  const size = bounds.getSize(new THREE.Vector3());
  const shots: CinematicShot[] = [];

  if (interior.length >= MIN_INTERIOR_POINTS) {
    // The geometry is a space, not an object. Every shot goes inside: an
    // exterior orbit of an enclosed model frames the walls from far away, which
    // is exactly the empty black frame this replaces.
    for (let index = 0; index < total; index += 1) {
      shots.push(interiorShot(index, interior, bounds));
    }
    return shots;
  }

  // A single stray enclosed point is not a room. Fall back to exteriors.
  if (interior.length > 0) {
    const eye = new THREE.Vector3(
      bounds.getCenter(new THREE.Vector3()).x,
      bounds.min.y + size.y * EYE_HEIGHT_RATIO,
      bounds.getCenter(new THREE.Vector3()).z,
    );
    shots.push({
      label: "Interior",
      kind: "interior",
      position: interior[0].position,
      target: eye,
      fov: INTERIOR_FOV,
    });
  }

  for (let index = shots.length; index < total; index += 1) {
    shots.push(exteriorShot(index - shots.length, bounds, aspect));
  }

  return shots;
}
