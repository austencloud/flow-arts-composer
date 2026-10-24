/**
 * Middle Earth's structures for the jam slice, as light procedural stand-ins.
 *
 * The browser has never built these; Unreal has authored meshes for them in
 * `FlowFestStructures.h`, and this file copies that table (centre, compass
 * bearing, footprint, base rule, colour) so both engines put the stage, the
 * tents and the archway in the same place. The shapes are simple on purpose:
 * at night they are silhouettes against the rope light and the moon, and in
 * the golden-hour opening they read as canopies and a stage, not as props.
 *
 * Everything merges into two draw calls, fabric and hard surfaces, with the
 * colour carried per vertex.
 */

import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { JamPoint } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
import type { SampleGround } from "./flow-fest-jam-set";

/** The old circle centre the Unreal table turns the stage and workshops toward. */
const STRUCTURE_FACING_CENTRE: JamPoint = { x: 90.5, z: -119.5 };

const WHITE = "#e8e6df";
const NAVY = "#2f3f66";
const SAND = "#c9b68a";
const RUST = "#a34a2a";
const TEAL = "#2f7d78";

function bearingToward(from: JamPoint, to: JamPoint): number {
  const deg = (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Compass bearing to the jam layout's yaw (0 faces +x, turning toward +z). */
function yawFromBearing(bearing: number): number {
  return ((bearing - 90) * Math.PI) / 180;
}

const m = new Matrix4();
const e = new Euler();
const c = new Color();

/** Local piece geometry, placed and painted. */
function part(geometry: BufferGeometry, colour: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  m.makeRotationFromEuler(e.set(rx, ry, rz));
  g.applyMatrix4(m);
  g.translate(x, y, z);
  c.set(colour);
  const count = g.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(colours, 3));
  if (!g.getAttribute("uv")) g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  return g;
}

interface Piece {
  fabric: BufferGeometry[];
  hard: BufferGeometry[];
}

const post = (h: number, r = 0.04) => new CylinderGeometry(r, r, h, 6);

/**
 * A peaked pop-up or marquee roof: four-sided pyramid over a rectangle, with a
 * valance band at the eave and a leg at each corner (plus mid-side legs on big
 * spans). Depth is along the front (+X), width across.
 */
function peakedTent(depth: number, width: number, eave: number, rise: number, colour: string, legsPerSide = 2, centrePole = false): Piece {
  const fabric: BufferGeometry[] = [];
  const hard: BufferGeometry[] = [];
  const roof = new ConeGeometry(Math.SQRT1_2, 1, 4, 1, true);
  roof.rotateY(Math.PI / 4);
  roof.scale(depth, rise, width);
  fabric.push(part(roof, colour, 0, eave + rise / 2, 0));
  const drop = 0.24;
  fabric.push(part(new BoxGeometry(depth, drop, 0.01), colour, 0, eave - drop / 2, width / 2));
  fabric.push(part(new BoxGeometry(depth, drop, 0.01), colour, 0, eave - drop / 2, -width / 2));
  fabric.push(part(new BoxGeometry(0.01, drop, width), colour, depth / 2, eave - drop / 2, 0));
  fabric.push(part(new BoxGeometry(0.01, drop, width), colour, -depth / 2, eave - drop / 2, 0));
  const legRadius = depth > 5 ? 0.05 : 0.025;
  for (let i = 0; i < legsPerSide; i++) {
    const t = legsPerSide === 1 ? 0 : i / (legsPerSide - 1) - 0.5;
    for (const sz of [-1, 1]) hard.push(part(post(eave, legRadius), "#9a9ca0", t * depth * 0.98, eave / 2, sz * width * 0.49));
    for (const sx of [-1, 1]) hard.push(part(post(eave, legRadius), "#9a9ca0", sx * depth * 0.49, eave / 2, t * width * 0.98));
  }
  if (centrePole) hard.push(part(post(eave + rise, 0.08), "#8a7a62", 0, (eave + rise) / 2, 0));
  return { fabric, hard };
}

function stage(): Piece {
  // The deck sits a metre back of the origin (the Unreal footprint offset) and
  // stands a metre off the grass; a teal roof on four posts, a back wall.
  const fabric: BufferGeometry[] = [];
  const hard: BufferGeometry[] = [];
  const depth = 8.4;
  const width = 10.2;
  const x0 = -1.2;
  hard.push(part(new BoxGeometry(depth, 0.12, width), "#6a5a48", x0, 0.98, 0));
  hard.push(part(new BoxGeometry(depth, 0.92, width - 0.2), "#2a2622", x0, 0.46, 0));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) hard.push(part(new BoxGeometry(0.2, 5.6, 0.2), "#3a3632", x0 + sx * (depth / 2 - 0.2), 2.8, sz * (width / 2 - 0.2)));
  hard.push(part(new BoxGeometry(0.2, 4.5, width - 0.4), "#26282a", x0 - depth / 2 + 0.2, 3.3, 0));
  fabric.push(part(new BoxGeometry(depth + 0.8, 0.2, width + 0.6), TEAL, x0, 5.7, 0, 0, 0, -0.06));
  // Steps down the front on the right as you face it.
  for (let i = 0; i < 4; i++) hard.push(part(new BoxGeometry(0.32, 0.25 * (i + 1), 1.2), "#5a4c3e", x0 + depth / 2 + 1.1 - i * 0.32, 0.125 * (i + 1), width / 2 - 1));
  return { fabric, hard };
}

function foodPavilion(): Piece {
  const fabric: BufferGeometry[] = [];
  const hard: BufferGeometry[] = [];
  const depth = 9.6;
  const width = 13.6;
  hard.push(part(new BoxGeometry(depth, 0.5, width), "#8c877e", 0, -0.1, 0));
  for (const sx of [-1, 1]) for (const t of [-0.5, 0, 0.5]) hard.push(part(post(3, 0.09), "#6b5a44", sx * (depth / 2 - 0.2), 1.5, t * (width - 0.4)));
  // A gable roof: two pitched planes running across the width.
  const pitch = 0.42;
  const half = depth / 2 / Math.cos(pitch) + 0.4;
  for (const sx of [-1, 1]) fabric.push(part(new BoxGeometry(half, 0.08, width + 0.8), "#5a4234", (sx * depth) / 4, 3 + (Math.tan(pitch) * depth) / 4, 0, 0, 0, -sx * pitch));
  hard.push(part(new BoxGeometry(1, 1, 8), "#5a4c3e", 1.5, 0.5, 0));
  return { fabric, hard };
}

function foodBooth(colour: string): Piece {
  const hard: BufferGeometry[] = [part(new BoxGeometry(4.5, 2.6, 5.6), colour, 0.74, 1.3, -0.51)];
  hard.push(part(new BoxGeometry(0.05, 1, 3.2), "#1a1a1a", 0.74 + 2.25, 1.45, -0.51));
  const fabric = [part(new BoxGeometry(1.2, 0.05, 3.8), WHITE, 0.74 + 2.75, 2.35, -0.51, 0, 0, -0.25)];
  return { fabric, hard };
}

function archway(): Piece {
  // Two posts across the walk with a hoop of bent conduit over them, wrapped in
  // fabric strips. The walk goes through along +X.
  const hard: BufferGeometry[] = [];
  const fabric: BufferGeometry[] = [];
  for (const sz of [-1, 1]) hard.push(part(new BoxGeometry(0.12, 2.4, 0.12), "#6b5a44", 0, 1.2, sz * 1.8));
  const arc = new TorusGeometry(1.8, 0.05, 6, 24, Math.PI);
  // The torus is drawn in its own XY plane; a quarter turn about Y stands it
  // across the walk, from one post to the other.
  hard.push(part(arc, "#7a6a52", 0, 2.4, 0, 0, Math.PI / 2));
  const strips = ["#c9a24a", "#8a4d6b", "#2f7d78", "#a5582f", "#e8e6df"];
  for (let i = 0; i < 11; i++) {
    const a = (i / 10) * Math.PI;
    const x = Math.cos(a) * 1.8;
    const y = 2.4 + Math.sin(a) * 1.8;
    const len = 0.5 + ((i * 37) % 5) * 0.12;
    fabric.push(part(new BoxGeometry(0.01, len, 0.09), strips[i % strips.length]!, 0.02, y - len / 2 - 0.05, x));
  }
  return { fabric, hard };
}

function toiletRow(): Piece {
  const hard: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const z = -2.025 + i * 1.35;
    hard.push(part(new BoxGeometry(1.5, 2.25, 1.28), i % 2 ? "#3e6a8a" : "#2f5d7c", 0, 1.125, z));
    hard.push(part(new BoxGeometry(1.6, 0.12, 1.32), "#d8d8d4", 0, 2.31, z));
  }
  return { fabric: [], hard };
}

function showerTrailer(): Piece {
  const hard = [
    part(new BoxGeometry(3.0, 2.3, 7.4), "#d6d4cc", 0.22, 1.55, 0.71),
    part(new BoxGeometry(2.6, 0.5, 1.2), "#1a1a1a", 0.22, 0.25, 0.71),
    part(new BoxGeometry(0.4, 0.15, 3.4), "#6a6a6a", 1.9, 0.6, 0.71),
  ];
  return { fabric: [], hard };
}

function dipStation(): Piece {
  const tent = peakedTent(3.2, 3.2, 2.05, 0.7, NAVY, 2);
  tent.hard.push(part(new BoxGeometry(0.7, 0.72, 2.2), "#5a5a5c", 0.4, 0.36, 0));
  for (const z of [-0.6, 0.6]) tent.hard.push(part(new CylinderGeometry(0.26, 0.22, 0.24, 14), "#9ea2a6", 0.4, 0.84, z));
  return tent;
}

interface Placement {
  build: () => Piece;
  at: JamPoint;
  bearing: number;
  /** Footprint for the base rule, depth along the front and width across. */
  size: [number, number];
  base: "lowest" | "highest" | "centre";
}

function placements(): Placement[] {
  const facing = (p: JamPoint) => bearingToward(p, STRUCTURE_FACING_CENTRE);
  const workshops: JamPoint[] = [
    { x: 72, z: -134 },
    { x: 106, z: -131 },
    { x: 61, z: -110 },
    { x: 110, z: -89 },
  ];
  const stageAt = { x: 126.8, z: -98.6 };
  return [
    { build: stage, at: stageAt, bearing: facing(stageAt), size: [10.6, 10.2], base: "lowest" },
    { build: () => peakedTent(13.4, 13.4, 3.1, 3.6, WHITE, 3, true), at: { x: 93.6, z: -88.9 }, bearing: 180, size: [13.4, 13.4], base: "lowest" },
    { build: foodPavilion, at: { x: 55.9, z: -96.4 }, bearing: 90, size: [9.6, 13.6], base: "highest" },
    { build: () => foodBooth(RUST), at: { x: 52.5, z: -85 }, bearing: 0, size: [4.5, 5.6], base: "highest" },
    { build: () => foodBooth(TEAL), at: { x: 58.5, z: -85 }, bearing: 0, size: [4.5, 5.6], base: "highest" },
    { build: () => peakedTent(3.2, 3.2, 2.05, 0.7, NAVY), at: { x: 125.5, z: -128.4 }, bearing: 270, size: [3.2, 3.2], base: "lowest" },
    { build: () => peakedTent(3.2, 3.2, 2.05, 0.7, WHITE), at: { x: 125.5, z: -117.6 }, bearing: 270, size: [3.2, 3.2], base: "lowest" },
    { build: dipStation, at: { x: 68.5, z: -144 }, bearing: 153.4, size: [5, 5], base: "centre" },
    { build: archway, at: { x: 77.9, z: -138 }, bearing: 141.8, size: [0.8, 3.8], base: "lowest" },
    ...workshops.map(
      (at, i): Placement => ({ build: () => peakedTent(6.4, 8.2, 2.3, 1.1, i % 2 ? SAND : WHITE, 3), at, bearing: facing(at), size: [6.4, 8.2], base: "lowest" }),
    ),
    { build: toiletRow, at: { x: 66, z: -99 }, bearing: 90, size: [1.6, 5.4], base: "highest" },
    { build: showerTrailer, at: { x: 70, z: -104.2 }, bearing: 90, size: [3.2, 7.6], base: "highest" },
  ];
}

function baseHeight(p: Placement, ground: SampleGround): number {
  const yaw = yawFromBearing(p.bearing);
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const heights: number[] = [ground(p.at.x, p.at.z)];
  if (p.base === "centre") return heights[0]!;
  for (const [a, r] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ] as const) {
    const ahead = (a * p.size[0]) / 2;
    const right = (r * p.size[1]) / 2;
    heights.push(ground(p.at.x + ahead * cos - right * sin, p.at.z + ahead * sin + right * cos));
  }
  return p.base === "lowest" ? Math.min(...heights) : Math.max(...heights);
}

export interface JamStructuresHandle {
  root: Group;
  dispose(): void;
}

export function buildJamStructures(ground: SampleGround): JamStructuresHandle {
  const fabric: BufferGeometry[] = [];
  const hard: BufferGeometry[] = [];
  const world = new Matrix4();
  for (const p of placements()) {
    const piece = p.build();
    // Layout yaw turns +x toward +z; three's rotation.y turns +x toward -z.
    world.makeRotationY(-yawFromBearing(p.bearing)).setPosition(p.at.x, baseHeight(p, ground), p.at.z);
    for (const g of piece.fabric) fabric.push(g.applyMatrix4(world));
    for (const g of piece.hard) hard.push(g.applyMatrix4(world));
  }
  const root = new Group();
  root.name = "FFJ_MiddleEarthStructures";
  const fabricGeometry = mergeGeometries(fabric, false)!;
  fabricGeometry.computeVertexNormals();
  const hardGeometry = mergeGeometries(hard, false)!;
  hardGeometry.computeVertexNormals();
  const fabricMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide });
  const hardMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  const fabricMesh = new Mesh(fabricGeometry, fabricMaterial);
  const hardMesh = new Mesh(hardGeometry, hardMaterial);
  fabricMesh.name = "FFJ_StructureFabric";
  hardMesh.name = "FFJ_StructureHard";
  for (const mesh of [fabricMesh, hardMesh]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return {
    root,
    dispose() {
      fabricGeometry.dispose();
      hardGeometry.dispose();
      fabricMaterial.dispose();
      hardMaterial.dispose();
    },
  };
}
