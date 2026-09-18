import {
  CylinderGeometry,
  Euler,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type Material,
} from "three";
import {
  bullnosePlate,
  revolvedProfile,
  roundedCylinder,
  type ProfileStop,
} from "./worker-prop-geometry";
import {
  buildBuugengShape,
  buildEightringsShape,
  buildFanShape,
  buildTriquetraShape,
  EIGHTRINGS_STOCK_WIDTH,
  FAN_FRAME_WIDTH,
  GENG_BLADE_WIDTH,
  TRIQUETRA_RIBBON_WIDTH,
} from "./worker-prop-plate-shapes";
import {
  getClubMaterials,
  getFrameMaterials,
  getHoopMaterials,
  getPlateMaterials,
  getTorchMaterials,
  PROP_PALETTES,
  TRAIL_GEOMETRY,
  type ClubMaterials,
  type TorchMaterials,
} from "./worker-prop-materials";
import type {
  CanonicalWorkerPropType,
  WorkerPropFactoryOptions,
  WorkerPropVisual,
} from "./worker-prop-factory-types";
import { CANONICAL_PROP_TYPE } from "./worker-prop-factory-types";

const BIG_SCALE = 1.4;
const HORIZONTAL_QUATERNION = new Quaternion().setFromEuler(
  new Euler(0, 0, Math.PI / 2)
);

export const PROCEDURAL_WORKER_PROP_TYPES = [
  CANONICAL_PROP_TYPE.CLUB,
  CANONICAL_PROP_TYPE.BIGCLUB,
  CANONICAL_PROP_TYPE.FAN,
  CANONICAL_PROP_TYPE.BIGFAN,
  CANONICAL_PROP_TYPE.TRIAD,
  CANONICAL_PROP_TYPE.BIGTRIAD,
  CANONICAL_PROP_TYPE.MINIHOOP,
  CANONICAL_PROP_TYPE.BIGHOOP,
  CANONICAL_PROP_TYPE.TRIANGLE,
  CANONICAL_PROP_TYPE.FRACTALGENG,
  CANONICAL_PROP_TYPE.TRIQUETRA,
  CANONICAL_PROP_TYPE.TRIQUETRA2,
  CANONICAL_PROP_TYPE.EIGHTRINGS,
  CANONICAL_PROP_TYPE.BIGEIGHTRINGS,
  CANONICAL_PROP_TYPE.CONTACTBALL,
  CANONICAL_PROP_TYPE.BIGCONTACTBALL,
  CANONICAL_PROP_TYPE.QUIAD,
  CANONICAL_PROP_TYPE.TORCH,
  CANONICAL_PROP_TYPE.BIGTORCH,
  CANONICAL_PROP_TYPE.POI,
] as const;

const PROCEDURAL_WORKER_PROP_TYPE_SET = new Set<CanonicalWorkerPropType>(
  PROCEDURAL_WORKER_PROP_TYPES
);

function mesh(
  geometry: BufferGeometry,
  material: Material | Material[],
  layer: number
): Mesh {
  const result = new Mesh(geometry, material);
  result.layers.set(layer);
  return result;
}

function createVisual(
  options: WorkerPropFactoryOptions,
  body: Group,
  trailMaterial: MeshBasicMaterial
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const root = new Group();
  root.name = `worker-prop-${options.propType}`;
  root.layers.set(layer);
  body.name = `worker-prop-${options.propType}-rotated-body`;
  body.layers.set(layer);
  root.add(body);

  const indicator = mesh(TRAIL_GEOMETRY, trailMaterial, layer);
  indicator.name = `worker-prop-${options.propType}-trail-indicator`;
  root.add(indicator);

  const finalQuaternion = new Quaternion();
  return {
    root,
    source: "procedural",
    setState(state) {
      finalQuaternion.copy(state.worldRotation).multiply(HORIZONTAL_QUATERNION);
      body.quaternion.copy(finalQuaternion);
    },
    dispose() {
      root.removeFromParent();
      root.clear();
    },
  };
}

interface ClubBand {
  id: "knob" | "handle" | "marker" | "body" | "cap";
  stops: readonly ProfileStop[];
}

const CLUB_BANDS: readonly ClubBand[] = [
  {
    id: "knob",
    stops: [
      { at: -0.01657, radius: 0.00528 },
      { at: -0.01631, radius: 0.00771 },
      { at: -0.01593, radius: 0.00922 },
      { at: -0.0153, radius: 0.01071 },
      { at: -0.01416, radius: 0.01239 },
      { at: -0.01251, radius: 0.01389 },
      { at: -0.01061, radius: 0.015 },
      { at: -0.00832, radius: 0.01586 },
      { at: -0.00578, radius: 0.01643 },
      { at: -0.0021, radius: 0.01681 },
      { at: 0.00322, radius: 0.01689 },
      { at: 0.0064, radius: 0.01667 },
      { at: 0.00893, radius: 0.01618 },
      { at: 0.01147, radius: 0.01525 },
      { at: 0.01325, radius: 0.01413 },
      { at: 0.01464, radius: 0.01264 },
      { at: 0.01578, radius: 0.01054 },
    ],
  },
  {
    id: "handle",
    stops: [
      { at: 0.01578, radius: 0.01054 },
      { at: 0.20216, radius: 0.01054 },
      { at: 0.20343, radius: 0.01077 },
    ],
  },
  {
    id: "marker",
    stops: [
      { at: 0.20343, radius: 0.01077 },
      { at: 0.21743, radius: 0.01381 },
    ],
  },
  {
    id: "body",
    stops: [
      { at: 0.21743, radius: 0.01381 },
      { at: 0.25122, radius: 0.02098 },
      { at: 0.283, radius: 0.02749 },
      { at: 0.30934, radius: 0.03262 },
      { at: 0.33013, radius: 0.03637 },
      { at: 0.34416, radius: 0.03857 },
      { at: 0.35277, radius: 0.03959 },
      { at: 0.35608, radius: 0.03979 },
      { at: 0.3721, radius: 0.04 },
      { at: 0.38176, radius: 0.03987 },
      { at: 0.3901, radius: 0.03948 },
      { at: 0.39884, radius: 0.03872 },
      { at: 0.40718, radius: 0.0377 },
      { at: 0.49787, radius: 0.01457 },
      { at: 0.49986, radius: 0.01406 },
      { at: 0.49999, radius: 0.01388 },
    ],
  },
  {
    id: "cap",
    stops: [
      { at: 0.49999, radius: 0.01388 },
      { at: 0.50092, radius: 0.01203 },
      { at: 0.50184, radius: 0.00929 },
      { at: 0.50303, radius: 0.00442 },
      { at: 0.50343, radius: 0.00108 },
    ],
  },
];

const clubGeometries = new Map<
  number,
  readonly [ClubBand["id"], BufferGeometry][]
>();

function clubMaterial(id: ClubBand["id"], materials: ClubMaterials): Material {
  if (id === "handle") return materials.handle;
  if (id === "marker") return materials.marker;
  if (id === "body") return materials.body;
  return materials.knob;
}

function createClub(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  let geometries = clubGeometries.get(scale);
  if (!geometries) {
    geometries = CLUB_BANDS.map(
      (band) =>
        [
          band.id,
          revolvedProfile(
            band.stops.map((stop) => ({
              at: stop.at * scale,
              radius: stop.radius * scale,
            })),
            32
          ),
        ] as const
    );
    clubGeometries.set(scale, geometries);
  }
  const materials = getClubMaterials(options.color);
  const body = new Group();
  for (const [id, geometry] of geometries) {
    body.add(mesh(geometry, clubMaterial(id, materials), layer));
  }
  return createVisual(options, body, materials.trail);
}

const plateGeometries = new Map<string, BufferGeometry>();

function createPlate(
  options: WorkerPropFactoryOptions,
  key: string,
  geometry: () => BufferGeometry
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  let plate = plateGeometries.get(key);
  if (!plate) {
    plate = geometry();
    plateGeometries.set(key, plate);
  }
  const materials = getPlateMaterials(options.color);
  const body = new Group();
  body.add(mesh(plate, [materials.face, materials.edge], layer));
  return createVisual(options, body, materials.trail);
}

function createFan(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const length = options.length * scale;
  const depth = options.thickness * scale * 1.4;
  return createPlate(options, `fan:${length}:${depth}`, () =>
    bullnosePlate(
      buildFanShape(length),
      depth,
      length * (FAN_FRAME_WIDTH / 6.8)
    )
  );
}

function createGeng(options: WorkerPropFactoryOptions): WorkerPropVisual {
  const length = options.length;
  const depth = options.thickness * 1.4;
  return createPlate(options, `buugeng:${length}:${depth}`, () =>
    bullnosePlate(
      buildBuugengShape(length),
      depth,
      length * (GENG_BLADE_WIDTH / 6.8)
    )
  );
}

function createTriquetra(
  options: WorkerPropFactoryOptions,
  variant: "triquetra" | "triquetra2"
): WorkerPropVisual {
  const length = options.length;
  const depth = options.thickness * 1.4;
  return createPlate(options, `${variant}:${length}:${depth}`, () =>
    bullnosePlate(
      buildTriquetraShape(length, variant),
      depth,
      length * (TRIQUETRA_RIBBON_WIDTH / 6.8)
    )
  );
}

function createEightrings(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const length = options.length * scale;
  const depth = options.thickness * scale * 1.4;
  return createPlate(options, `eightrings:${length}:${depth}`, () =>
    bullnosePlate(
      buildEightringsShape(length),
      depth,
      length * (EIGHTRINGS_STOCK_WIDTH / 6.8),
      24
    )
  );
}

// Mirrors hoop-geometry.ts and triangle-geometry.ts in @austencloud/scene-3d,
// which restate scripts/hoop-family-stations.json in metres.
// tests/unit/worker-renderer/worker-hoop-family.test.ts pins the built
// geometry to the generated station module.
const HOOP_OUTER_DIAMETER = 0.4699;
const HOOP_TUBE_RADIUS = 0.015875 / 2;
const HOOP_CENTERLINE_RADIUS = HOOP_OUTER_DIAMETER / 2 - HOOP_TUBE_RADIUS;
const HOOP_HARDWARE_RADIUS = HOOP_TUBE_RADIUS * 1.3;
const HOOP_JOIN_TAPE = 0.045;
const HOOP_GRIP_TAPE = 0.15;
const HOOP_BUTTON_RADIUS = 0.003;

interface HoopGeometries {
  ring: TorusGeometry;
  joinTape: TorusGeometry;
  gripTape: TorusGeometry;
  button: SphereGeometry;
}
const hoopGeometries = new Map<number, HoopGeometries>();

function hoopBand(scale: number, length: number): TorusGeometry {
  const arc = length / HOOP_CENTERLINE_RADIUS;
  return new TorusGeometry(
    HOOP_CENTERLINE_RADIUS * scale,
    HOOP_HARDWARE_RADIUS * scale,
    12,
    Math.max(8, Math.round((128 * arc) / (2 * Math.PI))),
    arc
  );
}

function getHoopGeometries(scale: number): HoopGeometries {
  let geometry = hoopGeometries.get(scale);
  if (!geometry) {
    geometry = {
      ring: new TorusGeometry(
        HOOP_CENTERLINE_RADIUS * scale,
        HOOP_TUBE_RADIUS * scale,
        20,
        128
      ),
      joinTape: hoopBand(scale, HOOP_JOIN_TAPE),
      gripTape: hoopBand(scale, HOOP_GRIP_TAPE),
      button: new SphereGeometry(HOOP_BUTTON_RADIUS * scale, 12, 8),
    };
    hoopGeometries.set(scale, geometry);
  }
  return geometry;
}

function createHoop(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const geometry = getHoopGeometries(scale);
  const materials = getHoopMaterials(options.color);
  const body = new Group();
  const lift = HOOP_CENTERLINE_RADIUS * scale;

  const ring = mesh(geometry.ring, materials.tube, layer);
  ring.position.y = lift;
  body.add(ring);

  // Join tape at the far rim (angle pi/2), the push button on top of it.
  const joinTape = mesh(geometry.joinTape, materials.hardware, layer);
  joinTape.position.y = lift;
  joinTape.rotation.z =
    Math.PI / 2 - HOOP_JOIN_TAPE / HOOP_CENTERLINE_RADIUS / 2;
  body.add(joinTape);

  const button = mesh(geometry.button, materials.hardware, layer);
  button.position.y = 2 * lift + HOOP_HARDWARE_RADIUS * scale;
  body.add(button);

  // Grip wrap centred on the hand (angle -pi/2).
  const gripTape = mesh(geometry.gripTape, materials.hardware, layer);
  gripTape.position.y = lift;
  gripTape.rotation.z =
    -Math.PI / 2 - HOOP_GRIP_TAPE / HOOP_CENTERLINE_RADIUS / 2;
  body.add(gripTape);

  return createVisual(options, body, materials.trail);
}

const TRIANGLE_SIDE_CHORD = 0.5588;
const TRIANGLE_SAGITTA = 0.02235;
const TRIANGLE_BOW_RADIUS =
  (TRIANGLE_SIDE_CHORD * TRIANGLE_SIDE_CHORD) / (8 * TRIANGLE_SAGITTA) +
  TRIANGLE_SAGITTA / 2;
const TRIANGLE_ARC_ANGLE =
  2 * Math.asin(TRIANGLE_SIDE_CHORD / (2 * TRIANGLE_BOW_RADIUS));
const TRIANGLE_HEIGHT = (TRIANGLE_SIDE_CHORD * Math.sqrt(3)) / 2;
const TRIANGLE_ELBOW_LEG_ANGLE = 0.05 / TRIANGLE_BOW_RADIUS;

interface TriangleGeometries {
  side: TorusGeometry;
  leg: TorusGeometry;
  vertex: SphereGeometry;
}
let triangleGeometries: TriangleGeometries | null = null;

function getTriangleGeometries(): TriangleGeometries {
  if (!triangleGeometries) {
    triangleGeometries = {
      side: new TorusGeometry(
        TRIANGLE_BOW_RADIUS,
        HOOP_TUBE_RADIUS,
        20,
        96,
        TRIANGLE_ARC_ANGLE
      ),
      leg: new TorusGeometry(
        TRIANGLE_BOW_RADIUS,
        HOOP_HARDWARE_RADIUS,
        12,
        8,
        TRIANGLE_ELBOW_LEG_ANGLE
      ),
      vertex: new SphereGeometry(HOOP_HARDWARE_RADIUS, 16, 12),
    };
  }
  return triangleGeometries;
}

// Both grips wind counter-clockwise, matching triangle-geometry.ts.
function triangleVertices(grip: "corner" | "side"): [number, number][] {
  const half = TRIANGLE_SIDE_CHORD / 2;
  return grip === "side"
    ? [
        [-half, TRIANGLE_SAGITTA],
        [half, TRIANGLE_SAGITTA],
        [0, TRIANGLE_SAGITTA + TRIANGLE_HEIGHT],
      ]
    : [
        [0, 0],
        [half, TRIANGLE_HEIGHT],
        [-half, TRIANGLE_HEIGHT],
      ];
}

function createTriangle(options: WorkerPropFactoryOptions): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const grip = options.build.triangleGrip === "side" ? "side" : "corner";
  const geometry = getTriangleGeometries();
  const materials = getHoopMaterials(options.color);
  const body = new Group();

  const vertices = triangleVertices(grip);
  const cx = (vertices[0]![0] + vertices[1]![0] + vertices[2]![0]) / 3;
  const cy = (vertices[0]![1] + vertices[1]![1] + vertices[2]![1]) / 3;
  const inset = TRIANGLE_BOW_RADIUS - TRIANGLE_SAGITTA;

  for (let i = 0; i < 3; i += 1) {
    const [px, py] = vertices[i]!;
    const [qx, qy] = vertices[(i + 1) % 3]!;
    const mx = (px + qx) / 2;
    const my = (py + qy) / 2;
    const nx = mx - cx;
    const ny = my - cy;
    const len = Math.hypot(nx, ny);
    const ox = mx - (nx / len) * inset;
    const oy = my - (ny / len) * inset;
    const start = Math.atan2(ny, nx) - TRIANGLE_ARC_ANGLE / 2;

    const side = mesh(geometry.side, materials.tube, layer);
    side.position.set(ox, oy, 0);
    side.rotation.z = start;
    body.add(side);

    for (const angle of [
      start,
      start + TRIANGLE_ARC_ANGLE - TRIANGLE_ELBOW_LEG_ANGLE,
    ]) {
      const leg = mesh(geometry.leg, materials.hardware, layer);
      leg.position.set(ox, oy, 0);
      leg.rotation.z = angle;
      body.add(leg);
    }
  }
  for (const [vx, vy] of vertices) {
    const vertex = mesh(geometry.vertex, materials.hardware, layer);
    vertex.position.set(vx, vy, 0);
    body.add(vertex);
  }
  return createVisual(options, body, materials.trail);
}

interface TriadSection {
  from: number;
  to: number;
  radius: number;
  radiusEnd?: number;
}

interface TriadFrame {
  hubArm: TriadSection;
  innerCollar: TriadSection;
  spine: TriadSection;
  outerCollar?: TriadSection;
  tip: TriadSection;
  ringRadius: number;
  ringTube: number;
  fillet: number;
}

const TRIAD_FRAMES: Record<"fire" | "day", TriadFrame> = {
  fire: {
    hubArm: { from: 0.095, to: 0.26, radius: 0.03, radiusEnd: 0.022 },
    innerCollar: { from: 0.24, to: 0.36, radius: 0.02 },
    spine: { from: 0.24, to: 0.92, radius: 0.013 },
    tip: { from: 0.9, to: 1.104, radius: 0.048 },
    ringRadius: 0.085,
    ringTube: 0.016,
    fillet: 0.014,
  },
  day: {
    hubArm: { from: 0.128, to: 0.34, radius: 0.052, radiusEnd: 0.04 },
    innerCollar: { from: 0.32, to: 0.39, radius: 0.032 },
    spine: { from: 0.33, to: 0.85, radius: 0.026 },
    outerCollar: { from: 0.79, to: 0.86, radius: 0.032 },
    tip: { from: 0.85, to: 1.104, radius: 0.05, radiusEnd: 0.068 },
    ringRadius: 0.108,
    ringTube: 0.03,
    fillet: 0.016,
  },
};

interface TriadParts {
  hubArm: readonly [BufferGeometry, number];
  innerCollar: readonly [BufferGeometry, number];
  spine: readonly [BufferGeometry, number];
  outerCollar?: readonly [BufferGeometry, number];
  tip: readonly [BufferGeometry, number];
  ring: TorusGeometry;
}

const triadParts = new Map<string, TriadParts>();

function turnedPart(
  section: TriadSection,
  arm: number,
  fillet: number
): readonly [BufferGeometry, number] {
  return [
    roundedCylinder({
      length: (section.to - section.from) * arm,
      radius: section.radius * arm,
      radiusEnd: section.radiusEnd ? section.radiusEnd * arm : undefined,
      fillet: fillet * arm,
    }),
    ((section.from + section.to) / 2) * arm,
  ];
}

function getTriadParts(arm: number, variant: "fire" | "day"): TriadParts {
  const key = `${arm}:${variant}`;
  const cached = triadParts.get(key);
  if (cached) return cached;
  const frame = TRIAD_FRAMES[variant];
  const value = {
    hubArm: turnedPart(frame.hubArm, arm, frame.fillet),
    innerCollar: turnedPart(frame.innerCollar, arm, frame.fillet * 0.5),
    spine: turnedPart(frame.spine, arm, frame.fillet * 0.3),
    outerCollar: frame.outerCollar
      ? turnedPart(frame.outerCollar, arm, frame.fillet * 0.5)
      : undefined,
    tip: turnedPart(frame.tip, arm, frame.fillet),
    ring: new TorusGeometry(
      frame.ringRadius * arm,
      frame.ringTube * arm,
      12,
      28
    ),
  };
  triadParts.set(key, value);
  return value;
}

function addPositionedMesh(
  parent: Group,
  part: readonly [BufferGeometry, number],
  material: Material,
  layer: number
): void {
  const value = mesh(part[0], material, layer);
  value.position.y = part[1];
  parent.add(value);
}

function createTriad(
  options: WorkerPropFactoryOptions,
  arms: 3 | 4,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const variant = options.build.finish;
  const armRatio = arms === 3 ? 0.44707 : 0.43202;
  const parts = getTriadParts(armRatio * options.length * scale, variant);
  const materials = getFrameMaterials(options.color, variant);
  const body = new Group();

  for (let index = 0; index < arms; index += 1) {
    const arm = new Group();
    arm.rotation.z = (index * 2 * Math.PI) / arms;
    arm.layers.set(layer);
    addPositionedMesh(arm, parts.hubArm, materials.hub, layer);
    addPositionedMesh(arm, parts.innerCollar, materials.collar, layer);
    addPositionedMesh(arm, parts.spine, materials.spine, layer);
    if (parts.outerCollar) {
      addPositionedMesh(arm, parts.outerCollar, materials.collar, layer);
    }
    addPositionedMesh(arm, parts.tip, materials.tip, layer);
    body.add(arm);
  }
  body.add(mesh(parts.ring, materials.ring, layer));
  return createVisual(options, body, materials.trail);
}

function createContactBall(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  // Ball3D halves an explicit thickness before deriving its radius.
  const radius = (options.thickness / 2) * 4 * scale;
  const body = new Group();
  body.add(
    mesh(
      new SphereGeometry(radius, 32, 32),
      new MeshStandardMaterial({
        color: PROP_PALETTES[options.color].main,
        roughness: 0.1,
        metalness: 0.3,
        opacity: 0.85,
        transparent: true,
      }),
      layer
    )
  );
  return createVisual(
    options,
    body,
    new MeshBasicMaterial({
      color: PROP_PALETTES[options.color].main,
      opacity: 0.3,
      transparent: true,
    })
  );
}

interface TorchBand {
  id: "pommel" | "grip" | "band" | "flare" | "ferrule" | "shaft" | "wick";
  stops: readonly ProfileStop[];
}

const TORCH_BANDS: readonly TorchBand[] = [
  {
    id: "pommel",
    stops: [
      { at: -0.01464, radius: 0 },
      { at: -0.01384, radius: 0.00781 },
      { at: -0.01187, radius: 0.01483 },
      { at: -0.0089, radius: 0.02027 },
      { at: -0.00593, radius: 0.02334 },
      { at: -0.00198, radius: 0.02522 },
      { at: 0.00198, radius: 0.02522 },
      { at: 0.00593, radius: 0.02364 },
      { at: 0.00989, radius: 0.02027 },
      { at: 0.01187, radius: 0.0175 },
      { at: 0.01384, radius: 0.01355 },
    ],
  },
  {
    id: "grip",
    stops: [
      { at: 0.01384, radius: 0.01355 },
      { at: 0.03659, radius: 0.01335 },
      { at: 0.10285, radius: 0.01375 },
      { at: 0.19976, radius: 0.01493 },
      { at: 0.24031, radius: 0.0177 },
      { at: 0.24426, radius: 0.01859 },
    ],
  },
  {
    id: "band",
    stops: [
      { at: 0.24426, radius: 0.01859 },
      { at: 0.26503, radius: 0.01998 },
    ],
  },
  {
    id: "flare",
    stops: [
      { at: 0.26503, radius: 0.01998 },
      { at: 0.26899, radius: 0.01968 },
      { at: 0.28184, radius: 0.02067 },
      { at: 0.33228, radius: 0.02779 },
      { at: 0.35107, radius: 0.02927 },
      { at: 0.35403, radius: 0.02878 },
    ],
  },
  {
    id: "ferrule",
    stops: [
      { at: 0.35403, radius: 0.02878 },
      { at: 0.357, radius: 0.02462 },
      { at: 0.35799, radius: 0.02275 },
      { at: 0.35898, radius: 0.01978 },
      { at: 0.35997, radius: 0.0101 },
    ],
  },
  {
    id: "shaft",
    stops: [
      { at: 0.35997, radius: 0.0101 },
      { at: 0.36096, radius: 0.0092 },
      { at: 0.52907, radius: 0.00939 },
      { at: 0.53006, radius: 0.01958 },
    ],
  },
  {
    id: "wick",
    stops: [
      { at: 0.53006, radius: 0.01958 },
      { at: 0.53303, radius: 0.02265 },
      { at: 0.53501, radius: 0.02344 },
      { at: 0.53797, radius: 0.02383 },
      { at: 0.58643, radius: 0.02383 },
      { at: 0.59237, radius: 0.02116 },
      { at: 0.59335, radius: 0.017 },
    ],
  },
];

const torchGeometries = new Map<
  number,
  readonly [TorchBand["id"], BufferGeometry][]
>();

function torchMaterial(
  id: TorchBand["id"],
  materials: TorchMaterials
): Material {
  if (id === "grip") return materials.grip;
  if (id === "flare") return materials.flare;
  if (id === "shaft") return materials.shaft;
  if (id === "wick") return materials.wick;
  return materials.hardware;
}

function createTorch(
  options: WorkerPropFactoryOptions,
  scale: number
): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const length = options.length * scale;
  let geometries = torchGeometries.get(length);
  if (!geometries) {
    geometries = TORCH_BANDS.map(
      (band) =>
        [
          band.id,
          revolvedProfile(
            band.stops.map((stop) => ({
              at: stop.at * length,
              radius: stop.radius * length,
            }))
          ),
        ] as const
    );
    torchGeometries.set(length, geometries);
  }
  const materials = getTorchMaterials(options.color);
  const body = new Group();
  for (const [id, geometry] of geometries) {
    body.add(mesh(geometry, torchMaterial(id, materials), layer));
  }
  return createVisual(options, body, materials.trail);
}

function createPoi(options: WorkerPropFactoryOptions): WorkerPropVisual {
  const layer = options.layer ?? 0;
  const totalLength = options.length * 0.65;
  const radius = options.thickness;
  const handleLength = totalLength * 0.08;
  const handleRadius = radius * 0.8;
  const leashLength = totalLength * 0.7;
  const leashRadius = radius * 0.15;
  const swivelRadius = radius * 0.4;
  const ballRadius = radius * 3.5;
  const body = new Group();

  const handle = mesh(
    new CylinderGeometry(handleRadius, handleRadius * 0.9, handleLength, 12),
    new MeshStandardMaterial({
      color: "#e8e8e8",
      roughness: 0.3,
      metalness: 0.1,
    }),
    layer
  );
  handle.position.y = -handleLength / 2;
  body.add(handle);

  const leash = mesh(
    new CylinderGeometry(leashRadius, leashRadius, leashLength, 8),
    new MeshStandardMaterial({
      color: "#444444",
      roughness: 0.9,
      metalness: 0,
    }),
    layer
  );
  leash.position.y = leashLength / 2;
  body.add(leash);

  const swivel = mesh(
    new SphereGeometry(swivelRadius, 10, 10),
    new MeshStandardMaterial({
      color: "#888888",
      roughness: 0.2,
      metalness: 0.7,
    }),
    layer
  );
  swivel.position.y = leashLength + swivelRadius;
  body.add(swivel);

  const ball = mesh(
    new SphereGeometry(ballRadius, 16, 16),
    new MeshStandardMaterial({
      color: PROP_PALETTES[options.color].main,
      roughness: 0.35,
      metalness: 0.15,
    }),
    layer
  );
  ball.position.y = leashLength + swivelRadius * 2 + ballRadius;
  body.add(ball);

  return createVisual(
    options,
    body,
    new MeshBasicMaterial({
      color: PROP_PALETTES[options.color].main,
      opacity: 0.3,
      transparent: true,
    })
  );
}

export function createProceduralWorkerProp(
  options: WorkerPropFactoryOptions
): WorkerPropVisual | null {
  if (
    !PROCEDURAL_WORKER_PROP_TYPE_SET.has(
      options.propType as CanonicalWorkerPropType
    )
  ) {
    return null;
  }

  switch (options.propType) {
    case CANONICAL_PROP_TYPE.CLUB:
      return createClub(options, 1);
    case CANONICAL_PROP_TYPE.BIGCLUB:
      return createClub(options, BIG_SCALE);
    case CANONICAL_PROP_TYPE.FAN:
      return options.build.fanBuild === "pictograph"
        ? createFan(options, 1)
        : null;
    case CANONICAL_PROP_TYPE.BIGFAN:
      return options.build.fanBuild === "pictograph"
        ? createFan(options, BIG_SCALE)
        : null;
    case CANONICAL_PROP_TYPE.TRIAD:
      return createTriad(options, 3, 1);
    case CANONICAL_PROP_TYPE.BIGTRIAD:
      return createTriad(options, 3, BIG_SCALE);
    case CANONICAL_PROP_TYPE.QUIAD:
      return createTriad(options, 4, 1);
    case CANONICAL_PROP_TYPE.MINIHOOP:
      return createHoop(options, 1);
    case CANONICAL_PROP_TYPE.BIGHOOP:
      return createHoop(options, BIG_SCALE);
    case CANONICAL_PROP_TYPE.TRIANGLE:
      return createTriangle(options);
    case CANONICAL_PROP_TYPE.FRACTALGENG:
      return createGeng(options);
    case CANONICAL_PROP_TYPE.TRIQUETRA:
      return createTriquetra(options, "triquetra");
    case CANONICAL_PROP_TYPE.TRIQUETRA2:
      return createTriquetra(options, "triquetra2");
    case CANONICAL_PROP_TYPE.EIGHTRINGS:
      return createEightrings(options, 1);
    case CANONICAL_PROP_TYPE.BIGEIGHTRINGS:
      return createEightrings(options, BIG_SCALE);
    case CANONICAL_PROP_TYPE.CONTACTBALL:
      return createContactBall(options, 1);
    case CANONICAL_PROP_TYPE.BIGCONTACTBALL:
      return createContactBall(options, BIG_SCALE);
    case CANONICAL_PROP_TYPE.TORCH:
      return createTorch(options, 1);
    case CANONICAL_PROP_TYPE.BIGTORCH:
      return createTorch(options, BIG_SCALE);
    case CANONICAL_PROP_TYPE.POI:
      return createPoi(options);
    default:
      return null;
  }
}
