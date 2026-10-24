/**
 * Procedural stand-ins for the jam's edge dressing, and the loader that swaps
 * in authored GLBs when they exist.
 *
 * The Unreal run authors matching Blender meshes and exports them to
 * `static/models/flow-fest-sim/jam/<kind>.glb` (origin on the ground, front
 * +X, metres, Y up). Until a file is there, the kind is built here from three
 * primitives with the same origin, facing and scale, so placements made for
 * one read correctly with the other.
 *
 * Every kind is a list of parts. A part is one geometry and one material; the
 * set renders each part as one InstancedMesh, so a hundred chairs are a
 * handful of draw calls. `tinted` parts take the per-instance fabric colour.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type JamMeshKind =
  | "camp-chair"
  | "folding-wagon"
  | "inflatable-couch"
  | "fuel-can"
  | "cooler"
  | "led-lantern"
  | "blanket"
  | "yoga-mat"
  | "safety-towel"
  | "rope-post"
  | "led-vision-club"
  | "lighting-flame-stand"
  | "funnel-stake"
  | "dj-table"
  | "pa-speaker"
  | "string-bulb";

export interface JamMeshPart {
  geometry: BufferGeometry;
  material: Material;
  /** Takes the per-instance fabric colour. */
  tinted: boolean;
  /**
   * Self-lit: the instance colour is the light it gives off, and may go above 1
   * so bloom picks it up. Never a real light.
   */
  glow?: boolean;
}

export interface JamMeshSet {
  kind: JamMeshKind;
  source: "glb" | "procedural";
  parts: JamMeshPart[];
}

/**
 * Fabric a camping-goods aisle sells, worn by a few seasons of sun: navy,
 * forest, rust, faded red, teal, charcoal. Mid-value on purpose so the
 * moon-lit night keeps them as shapes rather than black holes or glare.
 */
export const JAM_FABRIC_PALETTE = ["#34466b", "#3f5e45", "#a5582f", "#9c3b36", "#2f7470", "#4a4a4f"];
/** Blankets and mats run brighter and more varied: tapestries, rugs, foam. */
export const JAM_BLANKET_PALETTE = ["#8a4d6b", "#c08a3e", "#4e6f8f", "#7a3e2e", "#5b7d55", "#b5a58a"];

const m = new Matrix4();
const e = new Euler();

function placed(geometry: BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
  m.makeRotationFromEuler(e.set(rx, ry, rz));
  geometry.applyMatrix4(m);
  geometry.translate(x, y, z);
  return geometry;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const normalised = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of normalised) {
    if (g.getAttribute("uv")) continue;
    g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
  }
  const merged = mergeGeometries(normalised, false);
  if (!merged) throw new Error("Jam mesh parts did not merge");
  merged.computeVertexNormals();
  return merged;
}

const fabric = (roughness = 0.92) => new MeshStandardMaterial({ color: "#ffffff", roughness, metalness: 0 });
const frameMetal = () => new MeshStandardMaterial({ color: "#2a2b2e", roughness: 0.55, metalness: 0.6 });

function tube(length: number, radius: number): BufferGeometry {
  return new CylinderGeometry(radius, radius, length, 6, 1);
}

/** A quad camp chair facing +X: sling seat, reclined back, fabric arms, X-braced legs. */
/** Top of the camp chair's seat cloth above the ground, m; seated figures rest on it. */
export const CAMP_CHAIR_SEAT_TOP = 0.435;

function campChair(): JamMeshPart[] {
  const frame: BufferGeometry[] = [];
  for (const [x, z] of [
    [0.24, 0.26],
    [0.24, -0.26],
    [-0.22, 0.26],
    [-0.22, -0.26],
  ] as const) {
    frame.push(placed(tube(0.46, 0.011), x, 0.23, z));
    frame.push(placed(tube(0.26, 0.011), x, 0.59, z));
  }
  // Cross braces under the seat and behind the back.
  frame.push(placed(tube(0.62, 0.008), 0.24, 0.24, 0, 0.72, 0, 0));
  frame.push(placed(tube(0.62, 0.008), -0.22, 0.24, 0, -0.72, 0, 0));
  frame.push(placed(tube(0.6, 0.009), -0.27, 0.72, 0, Math.PI / 2, 0, 0));
  const cloth: BufferGeometry[] = [
    placed(new BoxGeometry(0.48, 0.03, 0.5), 0.01, CAMP_CHAIR_SEAT_TOP - 0.015, 0),
    placed(new BoxGeometry(0.03, 0.58, 0.52), -0.28, 0.72, 0, 0, 0, 0.2),
    placed(new BoxGeometry(0.44, 0.025, 0.07), 0.01, 0.62, 0.27),
    placed(new BoxGeometry(0.44, 0.025, 0.07), 0.01, 0.62, -0.27),
  ];
  return [
    { geometry: merge(frame), material: frameMetal(), tinted: false },
    { geometry: merge(cloth), material: fabric(), tinted: true },
  ];
}

/** A folding wagon, long axis on X, handle toward +X, props sticking out of the tub. */
function foldingWagon(): JamMeshPart[] {
  const tub: BufferGeometry[] = [
    placed(new BoxGeometry(0.92, 0.02, 0.5), 0, 0.2, 0),
    placed(new BoxGeometry(0.92, 0.36, 0.02), 0, 0.38, 0.25),
    placed(new BoxGeometry(0.92, 0.36, 0.02), 0, 0.38, -0.25),
    placed(new BoxGeometry(0.02, 0.36, 0.5), 0.46, 0.38, 0),
    placed(new BoxGeometry(0.02, 0.36, 0.5), -0.46, 0.38, 0),
  ];
  const dark: BufferGeometry[] = [];
  for (const [x, z] of [
    [0.36, 0.25],
    [0.36, -0.25],
    [-0.36, 0.25],
    [-0.36, -0.25],
  ] as const) {
    dark.push(placed(new CylinderGeometry(0.1, 0.1, 0.06, 12), x, 0.1, z, Math.PI / 2, 0, 0));
  }
  dark.push(placed(tube(0.7, 0.012), 0.75, 0.32, 0, 0, 0, Math.PI / 2 - 0.5));
  dark.push(placed(tube(0.18, 0.012), 1.04, 0.5, 0, Math.PI / 2, 0, 0));
  // The cargo: a hoop on end, two staffs leaning out, a poi bag.
  const cargo: BufferGeometry[] = [
    placed(new TorusGeometry(0.42, 0.012, 5, 28), -0.15, 0.62, 0.08, 0, 0.4, 0),
    placed(tube(1.25, 0.012), 0.12, 0.72, -0.08, 0.35, 0, -0.42),
    placed(tube(1.25, 0.012), 0.2, 0.7, -0.14, 0.42, 0, -0.38),
    placed(new SphereGeometry(0.06, 8, 6), 0.42, 1.2, -0.3),
    placed(new SphereGeometry(0.06, 8, 6), 0.52, 1.16, -0.38),
    placed(new BoxGeometry(0.3, 0.18, 0.22), -0.25, 0.42, -0.1),
  ];
  return [
    { geometry: merge(tub), material: fabric(), tinted: true },
    { geometry: merge(dark), material: frameMetal(), tinted: false },
    { geometry: merge(cargo), material: new MeshStandardMaterial({ color: "#8a7a62", roughness: 0.8 }), tinted: false },
  ];
}

/** An air lounger: two fat tubes side by side, the head end bent up. Long axis on X. */
function inflatableCouch(): JamMeshPart[] {
  const parts: BufferGeometry[] = [];
  for (const z of [-0.26, 0.26]) {
    parts.push(placed(new CylinderGeometry(0.26, 0.26, 1.5, 14, 1), 0.2, 0.25, z, 0, 0, Math.PI / 2));
    parts.push(placed(new SphereGeometry(0.26, 14, 10), 0.95, 0.25, z));
    parts.push(placed(new CylinderGeometry(0.26, 0.26, 0.55, 14, 1), -0.62, 0.42, z, 0, 0, Math.PI / 2 - 0.85));
    parts.push(placed(new SphereGeometry(0.26, 14, 10), -0.78, 0.62, z));
  }
  return [{ geometry: merge(parts), material: fabric(0.45), tinted: true }];
}

function fuelCan(): JamMeshPart[] {
  const body = [placed(new BoxGeometry(0.2, 0.3, 0.14), 0, 0.15, 0)];
  const cap = [placed(new CylinderGeometry(0.025, 0.025, 0.05, 8), 0.06, 0.32, 0), placed(new BoxGeometry(0.08, 0.025, 0.03), -0.04, 0.32, 0)];
  return [
    { geometry: merge(body), material: new MeshStandardMaterial({ color: "#a8281f", roughness: 0.5, metalness: 0.2 }), tinted: false },
    { geometry: merge(cap), material: frameMetal(), tinted: false },
  ];
}

function cooler(): JamMeshPart[] {
  return [
    { geometry: merge([placed(new BoxGeometry(0.6, 0.32, 0.4), 0, 0.16, 0)]), material: fabric(0.5), tinted: true },
    {
      geometry: merge([placed(new BoxGeometry(0.62, 0.07, 0.42), 0, 0.355, 0), placed(new BoxGeometry(0.2, 0.02, 0.03), 0, 0.4, 0)]),
      material: new MeshStandardMaterial({ color: "#e4e2da", roughness: 0.6 }),
      tinted: false,
    },
  ];
}

/** A small battery lantern. The globe glows (it carries emissive), but it is never a light. */
function ledLantern(): JamMeshPart[] {
  const shell = [
    placed(new CylinderGeometry(0.06, 0.07, 0.03, 10), 0, 0.015, 0),
    placed(new CylinderGeometry(0.05, 0.05, 0.02, 10), 0, 0.19, 0),
    placed(new TorusGeometry(0.035, 0.005, 4, 12), 0, 0.22, 0, Math.PI / 2, 0, 0),
  ];
  const globe = [placed(new CylinderGeometry(0.048, 0.048, 0.15, 12), 0, 0.105, 0)];
  return [
    { geometry: merge(shell), material: frameMetal(), tinted: false },
    {
      geometry: merge(globe),
      material: new MeshStandardMaterial({ color: "#fff1d2", emissive: "#ffc27a", emissiveIntensity: 2.2, roughness: 0.3, toneMapped: false }),
      tinted: false,
    },
  ];
}

/** A rumpled ground cloth. Long axis on X. */
function rumpled(width: number, depth: number, thickness: number, wrinkle: number, seed: number): BufferGeometry {
  const g = new PlaneGeometry(width, depth, 14, 10);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const edge = Math.min(1, (width / 2 - Math.abs(x)) / 0.2, (depth / 2 - Math.abs(z)) / 0.2);
    const y = thickness + wrinkle * Math.max(0, Math.sin(x * 5.1 + seed) * Math.cos(z * 4.3 + seed * 2) + 0.4) * Math.max(0.2, edge);
    p.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}

function blanket(): JamMeshPart[] {
  return [{ geometry: rumpled(1.8, 1.4, 0.012, 0.025, 1.7), material: fabric(0.98), tinted: true }];
}

function yogaMat(): JamMeshPart[] {
  return [{ geometry: merge([placed(new BoxGeometry(1.83, 0.006, 0.61), 0, 0.003, 0)]), material: fabric(0.7), tinted: true }];
}

/** A folded wet towel on the ground. The set drapes the same mesh over a chair back by rotation. */
function safetyTowel(): JamMeshPart[] {
  return [{ geometry: rumpled(0.62, 0.42, 0.03, 0.015, 3.1), material: new MeshStandardMaterial({ color: "#d8d2c4", roughness: 1 }), tinted: true }];
}

function ropePost(): JamMeshPart[] {
  return [
    {
      geometry: merge([placed(new CylinderGeometry(0.025, 0.03, 0.9, 7), 0, 0.45, 0), placed(new CylinderGeometry(0.035, 0.035, 0.04, 7), 0, 0.91, 0)]),
      material: new MeshStandardMaterial({ color: "#6b5a44", roughness: 0.95 }),
      tinted: false,
    },
  ];
}

/** A self-lit material: white, so the instance colour alone sets what it glows. */
const selfLit = (opacity = 1) =>
  new MeshBasicMaterial({ color: "#ffffff", toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });

/**
 * An LED vision club, 52 cm, standing on its knob: origin at the knob, body
 * up +Y. The body is a frosted shell with the light inside it, so it is drawn
 * as a glowing core under a pale shell; the handle is matte black rubber with
 * a fat knob and a strip of grip tape where the hand sits.
 */
function ledVisionClub(): JamMeshPart[] {
  // Lathe profile, radius by height: knob, thin neck, the long swell of the body, a domed top.
  const shell: Vector2[] = [];
  const core: Vector2[] = [];
  const profile: [number, number][] = [
    [0.0, 0.17],
    [0.024, 0.19],
    [0.034, 0.24],
    [0.041, 0.3],
    [0.044, 0.36],
    [0.043, 0.42],
    [0.038, 0.47],
    [0.026, 0.505],
    [0.0, 0.52],
  ];
  for (const [r, y] of profile) {
    shell.push(new Vector2(r, y));
    core.push(new Vector2(r * 0.72, y - 0.004));
  }
  const handle = [
    placed(new CylinderGeometry(0.0125, 0.016, 0.16, 10), 0, 0.095, 0),
    placed(new SphereGeometry(0.024, 12, 8), 0, 0.018, 0),
    placed(new CylinderGeometry(0.024, 0.024, 0.014, 12), 0, 0.03, 0),
    // The end cap that keeps the light from shining down the handle.
    placed(new CylinderGeometry(0.022, 0.017, 0.016, 12), 0, 0.172, 0),
  ];
  const tape = [placed(new CylinderGeometry(0.0165, 0.0165, 0.05, 10, 1, true), 0, 0.12, 0)];
  return [
    { geometry: merge(handle), material: new MeshStandardMaterial({ color: "#121214", roughness: 0.85 }), tinted: false },
    { geometry: merge(tape), material: new MeshStandardMaterial({ color: "#3a3a40", roughness: 0.6, metalness: 0.2 }), tinted: false },
    { geometry: new LatheGeometry(core, 16), material: selfLit(), tinted: true, glow: true },
    {
      geometry: new LatheGeometry(shell, 20),
      material: new MeshStandardMaterial({ color: "#f2f4f6", roughness: 0.35, transparent: true, opacity: 0.38, depthWrite: false }),
      tinted: false,
    },
  ];
}

/** The lighting flame: a steel bowl on a short tripod, the flame drawn by the set. */
function lightingFlameStand(): JamMeshPart[] {
  const steel: BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    steel.push(placed(tube(0.92, 0.011), Math.cos(a) * 0.12, 0.44, Math.sin(a) * 0.12, Math.sin(a) * 0.26, 0, -Math.cos(a) * 0.26));
  }
  steel.push(placed(new CylinderGeometry(0.11, 0.07, 0.07, 14, 1, true), 0, 0.9, 0));
  steel.push(placed(new CylinderGeometry(0.07, 0.07, 0.01, 14), 0, 0.865, 0));
  // The wick bundle inside the bowl.
  const wick = [placed(new CylinderGeometry(0.05, 0.05, 0.04, 10), 0, 0.89, 0)];
  return [
    { geometry: merge(steel), material: new MeshStandardMaterial({ color: "#3a3836", roughness: 0.45, metalness: 0.8 }), tinted: false },
    { geometry: merge(wick), material: new MeshStandardMaterial({ color: "#1a1410", roughness: 1 }), tinted: false },
  ];
}

/** A short wooden stake for the funnel line, rope over its notch at 0.42 m. */
function funnelStake(): JamMeshPart[] {
  return [
    {
      geometry: merge([placed(new BoxGeometry(0.04, 0.5, 0.04), 0, 0.2, 0), placed(new CylinderGeometry(0.0, 0.028, 0.08, 4), 0, -0.07, 0, Math.PI, Math.PI / 4, 0)]),
      material: new MeshStandardMaterial({ color: "#8a7458", roughness: 0.95 }),
      tinted: false,
    },
  ];
}

/**
 * The DJ's folding table, 1.8 by 0.75 m, front (+X) to the circle and the DJ
 * behind it at -X. A cloth drops to the grass at the front and sides; two
 * decks and a mixer on top, a laptop on a stand with its lid toward the DJ.
 */
function djTable(): JamMeshPart[] {
  const cloth = [
    placed(new BoxGeometry(0.78, 0.02, 1.84), 0, 0.77, 0),
    placed(new BoxGeometry(0.01, 0.76, 1.84), 0.39, 0.39, 0),
    placed(new BoxGeometry(0.78, 0.76, 0.01), 0, 0.39, 0.92),
    placed(new BoxGeometry(0.78, 0.76, 0.01), 0, 0.39, -0.92),
  ];
  const gear: BufferGeometry[] = [
    placed(new BoxGeometry(0.36, 0.06, 0.34), -0.06, 0.81, 0.55),
    placed(new BoxGeometry(0.36, 0.06, 0.34), -0.06, 0.81, -0.55),
    placed(new BoxGeometry(0.34, 0.08, 0.3), -0.06, 0.82, 0),
    // Laptop stand and base.
    placed(new BoxGeometry(0.24, 0.12, 0.3), 0.22, 0.84, 0.0),
    placed(new BoxGeometry(0.24, 0.015, 0.33), 0.22, 0.91, 0.0, 0, 0, 0.12),
    placed(new BoxGeometry(0.01, 0.22, 0.33), 0.33, 1.02, 0.0, 0, 0, -0.18),
  ];
  const platters: BufferGeometry[] = [
    placed(new CylinderGeometry(0.11, 0.11, 0.01, 24), -0.08, 0.845, 0.55),
    placed(new CylinderGeometry(0.11, 0.11, 0.01, 24), -0.08, 0.845, -0.55),
  ];
  // The faint light off the decks' rings and the mixer's meters, and the laptop screen
  // facing the DJ: small, cool, and the only glow on the table.
  const lights = [
    placed(new TorusGeometry(0.115, 0.004, 4, 32), -0.08, 0.852, 0.55, Math.PI / 2, 0, 0),
    placed(new TorusGeometry(0.115, 0.004, 4, 32), -0.08, 0.852, -0.55, Math.PI / 2, 0, 0),
    placed(new BoxGeometry(0.2, 0.004, 0.02), -0.1, 0.862, 0.05),
    placed(new BoxGeometry(0.2, 0.004, 0.02), -0.1, 0.862, -0.05),
    placed(new BoxGeometry(0.004, 0.2, 0.3), 0.325, 1.02, 0.0, 0, 0, -0.18),
  ];
  return [
    { geometry: merge(cloth), material: fabric(0.95), tinted: true },
    { geometry: merge(gear), material: new MeshStandardMaterial({ color: "#1b1c20", roughness: 0.5, metalness: 0.3 }), tinted: false },
    { geometry: merge(platters), material: new MeshStandardMaterial({ color: "#0c0c0e", roughness: 0.3, metalness: 0.4 }), tinted: false },
    { geometry: merge(lights), material: selfLit(), tinted: true, glow: true },
  ];
}

/** A PA top on a tripod stand, cabinet 0.55 m tall with its face on +X. */
function paSpeaker(): JamMeshPart[] {
  const stand: BufferGeometry[] = [placed(tube(1.25, 0.018), 0, 1.0, 0)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    stand.push(placed(tube(0.7, 0.012), Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24, Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75));
  }
  const cabinet = [placed(new BoxGeometry(0.34, 0.56, 0.36), -0.02, 1.9, 0)];
  const grille = [placed(new BoxGeometry(0.01, 0.5, 0.32), 0.155, 1.9, 0), placed(new CylinderGeometry(0.12, 0.12, 0.012, 20), 0.16, 1.82, 0, 0, 0, Math.PI / 2)];
  return [
    { geometry: merge(stand), material: frameMetal(), tinted: false },
    { geometry: merge(cabinet), material: new MeshStandardMaterial({ color: "#151517", roughness: 0.8 }), tinted: false },
    { geometry: merge(grille), material: new MeshStandardMaterial({ color: "#26272a", roughness: 0.55, metalness: 0.5 }), tinted: false },
  ];
}

/** One warm string-light bulb hanging under its socket; origin at the wire. */
function stringBulb(): JamMeshPart[] {
  return [
    { geometry: merge([placed(new CylinderGeometry(0.012, 0.012, 0.035, 8), 0, -0.018, 0)]), material: new MeshStandardMaterial({ color: "#151515", roughness: 0.7 }), tinted: false },
    { geometry: merge([placed(new SphereGeometry(0.024, 10, 8), 0, -0.058, 0)]), material: selfLit(), tinted: true, glow: true },
  ];
}

const BUILDERS: Record<JamMeshKind, () => JamMeshPart[]> = {
  "led-vision-club": ledVisionClub,
  "lighting-flame-stand": lightingFlameStand,
  "funnel-stake": funnelStake,
  "dj-table": djTable,
  "pa-speaker": paSpeaker,
  "string-bulb": stringBulb,
  "camp-chair": campChair,
  "folding-wagon": foldingWagon,
  "inflatable-couch": inflatableCouch,
  "fuel-can": fuelCan,
  cooler,
  "led-lantern": ledLantern,
  blanket,
  "yoga-mat": yogaMat,
  "safety-towel": safetyTowel,
  "rope-post": ropePost,
};

export const JAM_MESH_KINDS = Object.keys(BUILDERS) as JamMeshKind[];

export function buildProceduralJamMesh(kind: JamMeshKind): JamMeshSet {
  return { kind, source: "procedural", parts: BUILDERS[kind]() };
}

export function jamMeshUrl(kind: JamMeshKind): string {
  return `/models/flow-fest-sim/jam/${kind}.glb`;
}

/** Names a GLB material may carry to take the per-instance fabric colour. */
const TINT_NAME = /fabric|cloth|tint|colou?r/i;
/** Names that mark the light-carrying material (the vision club exports "led-body"). */
const GLOW_NAME = /led-body|bulb-glow|emissive-tint/i;

async function glbExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const type = response.headers.get("content-type") ?? "";
    // A missing static file can fall through to the app's HTML 404 page.
    return response.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

/**
 * The authored mesh when `static/models/flow-fest-sim/jam/<kind>.glb` exists,
 * the procedural one otherwise. Each GLB mesh becomes a part with its node
 * transform baked in; materials whose name says fabric take the instance
 * colour, everything else keeps its authored look.
 */
export async function loadJamMesh(kind: JamMeshKind): Promise<JamMeshSet> {
  const url = jamMeshUrl(kind);
  if (!(await glbExists(url))) return buildProceduralJamMesh(kind);
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const parts: JamMeshPart[] = [];
    gltf.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const material = materials[0]!;
      const name = material.name ?? "";
      if (GLOW_NAME.test(name)) parts.push({ geometry, material: selfLit(), tinted: true, glow: true });
      else parts.push({ geometry, material, tinted: TINT_NAME.test(name) });
    });
    if (parts.length === 0) return buildProceduralJamMesh(kind);
    return { kind, source: "glb", parts };
  } catch (error) {
    console.warn(`[flow-fest-jam] ${url} failed to load; using the procedural ${kind}`, error);
    return buildProceduralJamMesh(kind);
  }
}

export function jamFabricColor(palette: readonly string[], index: number, out = new Color()): Color {
  return out.set(palette[((index % palette.length) + palette.length) % palette.length]!);
}
