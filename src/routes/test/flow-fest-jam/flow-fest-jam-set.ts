/**
 * Builds the jam's fixed set from the shared layout: the rope and the light it
 * throws on the grass, the entrance posts, the safety stations and the edge
 * dressing. Everything sits on the sampled ground. The returned handle owns
 * the objects and exposes the few values that change per frame (rope glow and
 * drift, flame flicker).
 */

import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Points,
  ShaderMaterial,
  CylinderGeometry,
  TubeGeometry,
  Vector3,
  type Material,
} from "three";
import type {
  FlowFestJamLayout,
  JamDressingKind,
  JamPoint,
} from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
import {
  JAM_BLANKET_PALETTE,
  JAM_FABRIC_PALETTE,
  jamFabricColor,
  loadJamMesh,
  type JamMeshKind,
  type JamMeshSet,
} from "./flow-fest-jam-meshes";

export type SampleGround = (x: number, z: number) => number;

interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  colour: Color;
  /** Extra local transform applied before the placement (towel over a chair back). */
  local?: Matrix4;
  /** What the self-lit parts give off, when it differs from the fabric colour. */
  glowColour?: Color;
}

export interface JamFlame {
  x: number;
  y: number;
  z: number;
  phase: number;
  /** Flame height in metres; the point sprite is this tall. */
  size?: number;
}

export interface JamSetHandle {
  root: Group;
  /** The lighting flame inside the gap: the one real flame at the circle besides the props. */
  lightingFlame: { x: number; y: number; z: number };
  /** The booth speakers, for the beat's positional sound. */
  speakers: { x: number; y: number; z: number }[];
  /** Where the DJ stands behind the table, facing the circle. */
  dj: { x: number; y: number; z: number; yaw: number };
  lanterns: { x: number; y: number; z: number }[];
  meshSources: Record<string, "glb" | "procedural">;
  update(input: JamSetUpdate): void;
  dispose(): void;
}

const DRESSING_MESH: Record<JamDressingKind, JamMeshKind> = {
  chair: "camp-chair",
  wagon: "folding-wagon",
  blanket: "blanket",
  "yoga-mat": "yoga-mat",
  couch: "inflatable-couch",
  cooler: "cooler",
  lantern: "led-lantern",
};

const ROPE_LIFT = 0.018;

function createRopeUniforms() {
  return {
    uGlow: { value: 0 },
    uTime: { value: 0 },
    uDrift: { value: 90 },
    uColA: { value: new Color(1, 0.78, 0.52) },
    uColB: { value: new Color(1, 0.52, 0.34) },
  };
}
type RopeUniforms = ReturnType<typeof createRopeUniforms>;

function yawMatrix(p: Placement, out: Matrix4, scratch: Matrix4): Matrix4 {
  // Layout yaw turns +x toward +z; three's rotation.y turns +x toward -z.
  out.makeRotationY(-p.yaw).setPosition(p.x, p.y, p.z);
  if (p.local) out.multiply(scratch.copy(p.local));
  return out;
}

function instance(set: JamMeshSet, placements: Placement[], name: string): Object3D[] {
  if (placements.length === 0) return [];
  const out: Object3D[] = [];
  const matrix = new Matrix4();
  const scratch = new Matrix4();
  set.parts.forEach((part, index) => {
    const mesh = new InstancedMesh(part.geometry, part.material, placements.length);
    mesh.name = `FFJ_${name}_${index}`;
    placements.forEach((p, i) => {
      mesh.setMatrixAt(i, yawMatrix(p, matrix, scratch));
      if (part.tinted) mesh.setColorAt(i, part.glow ? (p.glowColour ?? p.colour) : p.colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = !part.glow;
    mesh.receiveShadow = !part.glow;
    mesh.computeBoundingSphere();
    out.push(mesh);
  });
  return out;
}

/**
 * The rope as one tube with an emissive drift that travels slowly along it.
 * The glow is a shader term so a 150 m rope costs one draw call and no lights.
 */
function buildRope(points: Vector3[], uniforms: RopeUniforms, radius = 0.011) {
  const curve = new CatmullRomCurve3(points, false, "centripetal");
  const length = curve.getLength();
  const geometry = new TubeGeometry(curve, Math.ceil(length * 4), radius, 5, false);
  const material = new MeshStandardMaterial({ color: "#d8d6cc", roughness: 0.55, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uLength: { value: length } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vArc;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvArc = uv.x;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vArc;\nuniform float uGlow;\nuniform float uTime;\nuniform float uLength;\nuniform float uDrift;\nuniform vec3 uColA;\nuniform vec3 uColB;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float metres = vArc * uLength;
        // Two slow waves: the whole rope breathes toward amber over the drift period,
        // and a long band of it travels round the circle.
        float breathe = 0.5 + 0.5 * sin(6.2831 * uTime / uDrift);
        float band = 0.5 + 0.5 * sin(6.2831 * (metres / 38.0 - uTime / (uDrift * 0.5)));
        vec3 ropeLight = mix(uColA, uColB, clamp(0.35 * breathe + 0.65 * band * breathe + 0.15 * band, 0.0, 1.0));
        totalEmissiveRadiance += ropeLight * uGlow * 3.2;
        diffuseColor.rgb *= 1.0 - 0.85 * uGlow;`,
      );
  };
  material.customProgramCacheKey = () => "flow-fest-jam-rope";
  const mesh = new Mesh(geometry, material);
  mesh.name = "FFJ_Rope";
  mesh.castShadow = false;
  return { mesh, curve, length };
}


/**
 * The light the rope throws on the grass: a ribbon either side of it, bright
 * on the line and gone by 0.8 m, added on top of whatever is there. It reads
 * as the rope lighting the blades without paying for a single light.
 */
function buildRopeSpill(curve: CatmullRomCurve3, length: number, ground: SampleGround) {
  const samples = Math.ceil(length * 1.5);
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const half = 0.85;
  const tangent = new Vector3();
  const point = new Vector3();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent);
    const nx = -tangent.z;
    const nz = tangent.x;
    const nl = Math.hypot(nx, nz) || 1;
    for (const [offset, value] of [
      [-half, 0],
      [-half * 0.3, 0.45],
      [0, 1],
      [half * 0.3, 0.45],
      [half, 0],
    ] as const) {
      const x = point.x + (nx / nl) * offset;
      const z = point.z + (nz / nl) * offset;
      positions.push(x, ground(x, z) + 0.035, z);
      colours.push(value, value, value);
    }
    if (i < samples) {
      const a = i * 5;
      const b = (i + 1) * 5;
      for (let k = 0; k < 4; k++) indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  const material = new MeshBasicMaterial({
    vertexColors: true,
    color: "#000000",
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "FFJ_RopeSpill";
  mesh.renderOrder = 2;
  return { mesh, material };
}

/** Small fuel-can flames as one point cloud with a flickering teardrop shader. */
function buildFlames(flames: JamFlame[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(flames.flatMap((f) => [f.x, f.y, f.z]), 3));
  geometry.setAttribute("aPhase", new Float32BufferAttribute(flames.map((f) => f.phase), 1));
  geometry.setAttribute("aSize", new Float32BufferAttribute(flames.map((f) => f.size ?? 0.26), 1));
  const material = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 300 }, uLit: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSize;
      uniform float uTime;
      uniform float uScale;
      varying float vPhase;
      void main() {
        vPhase = aPhase;
        vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, aSize * 0.42, 0.0), 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * aSize / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLit;
      varying float vPhase;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        p.y = -p.y;
        float t = uTime * 7.0 + vPhase * 31.0;
        float sway = 0.12 * sin(t + p.y * 3.0) * (p.y + 1.0) * 0.5;
        float x = (p.x - sway) / (0.32 * (1.0 - smoothstep(-0.9, 0.95, p.y)) + 0.02);
        float flick = 0.85 + 0.15 * sin(t * 1.7) * sin(t * 0.63);
        float body = 1.0 - smoothstep(0.55, 1.0, abs(x));
        body *= smoothstep(-1.0, -0.75, p.y) * (1.0 - smoothstep(0.35 * flick, 0.95 * flick, p.y));
        float core = (1.0 - smoothstep(0.0, 0.5, abs(x))) * (1.0 - smoothstep(-0.6, 0.2, p.y));
        vec3 colour = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.8, 0.45), core);
        float a = body * uLit;
        if (a < 0.01) discard;
        gl_FragColor = vec4(colour * a * 2.6, a);
      }
    `,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new Points(geometry, material);
  points.name = "FFJ_Flames";
  points.frustumCulled = false;
  return { points, material };
}

export interface JamSetUpdate {
  elapsed: number;
  ropeGlow: number;
  ropeColour: [number, number, number];
  driftColour: [number, number, number];
  driftSeconds: number;
  /** Pixels per metre at one metre from the camera: drawing-buffer height over 2 tan(fov/2). */
  viewScale: number;
}

/** Sagging points between two hung anchors, a parabola under the straight line. */
function sagSpan(a: Vector3, b: Vector3, sag: number, step: number): Vector3[] {
  const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(2, Math.round(horizontal / step));
  const out: Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

/** Points every `spacing` metres along a ground polyline, ends included. */
function along(line: JamPoint[], spacing: number): JamPoint[] {
  const out: JamPoint[] = [line[0]!];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.round(length / spacing));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  return out;
}

const STAKE_ROPE_HEIGHT = 0.42;
const BOOTH_CLOTH = new Color("#23242b");
/** The decks' rings and the laptop: a cool, faint blue-white. */
const BOOTH_GLOW = new Color(0.55, 0.75, 1.0).multiplyScalar(1.6);
/** Warm incandescent-look bulbs, bright enough for bloom to make each one a point. */
const BULB_GLOW = new Color(1.0, 0.6, 0.26).multiplyScalar(3.2);

export async function buildJamSet(layout: FlowFestJamLayout, ground: SampleGround): Promise<JamSetHandle> {
  const root = new Group();
  root.name = "FFJ_Set";
  const disposables: { dispose(): void }[] = [];

  const kinds: JamMeshKind[] = [
    "camp-chair",
    "folding-wagon",
    "inflatable-couch",
    "cooler",
    "led-lantern",
    "blanket",
    "yoga-mat",
    "safety-towel",
    "rope-post",
    "lighting-flame-stand",
    "funnel-stake",
    "dj-table",
    "pa-speaker",
    "string-bulb",
  ];
  const sets = new Map<JamMeshKind, JamMeshSet>();
  await Promise.all(kinds.map(async (kind) => sets.set(kind, await loadJamMesh(kind))));
  const meshSources: Record<string, "glb" | "procedural"> = {};
  // Everything self-lit dims to nothing by day and comes up with the rope.
  const nightGlows: { material: Material; base: number }[] = [];
  for (const [kind, set] of sets) {
    meshSources[kind] = set.source;
    for (const part of set.parts) {
      disposables.push(part.geometry, part.material);
      if (part.glow) nightGlows.push({ material: part.material, base: 1 });
      const standard = part.material as MeshStandardMaterial;
      if (standard.isMeshStandardMaterial && standard.emissiveIntensity > 0 && standard.emissive.getHex() !== 0)
        nightGlows.push({ material: standard, base: standard.emissiveIntensity });
    }
  }

  // The rope, the light it throws on the grass, and the gap posts.
  const ropeUniforms = createRopeUniforms();
  const spills: MeshBasicMaterial[] = [];
  for (const line of layout.rope) {
    if (line.length < 2) continue;
    const rope = buildRope(
      line.map((p) => new Vector3(p.x, ground(p.x, p.z) + ROPE_LIFT, p.z)),
      ropeUniforms,
    );
    root.add(rope.mesh);
    disposables.push(rope.mesh.geometry, rope.mesh.material as Material);
    const spill = buildRopeSpill(rope.curve, rope.length, ground);
    root.add(spill.mesh);
    spills.push(spill.material);
    disposables.push(spill.mesh.geometry, spill.material);
  }

  const byMesh = new Map<JamMeshKind, Placement[]>();
  const push = (kind: JamMeshKind, p: Placement) => {
    const list = byMesh.get(kind) ?? [];
    list.push(p);
    byMesh.set(kind, list);
  };
  const plain = new Color();

  for (const post of layout.entrance.posts) {
    push("rope-post", { x: post.x, y: ground(post.x, post.z) - 0.25, z: post.z, yaw: 0, colour: plain });
  }

  // The funnel: two low lines on short stakes from the dip through the archway to the
  // gap posts. The same rope, faintly lit, so the way in reads at night without
  // competing with the circle.
  const funnelUniforms = createRopeUniforms();
  for (const line of layout.entrance.funnel) {
    const stakes = along(line, 2.2);
    const hung: Vector3[] = [];
    stakes.forEach((s, i) => {
      const y = ground(s.x, s.z);
      // The last point is the gap post; it carries the line itself.
      if (i < stakes.length - 1) push("funnel-stake", { x: s.x, y, z: s.z, yaw: 0, colour: plain });
      const top = new Vector3(s.x, y + STAKE_ROPE_HEIGHT, s.z);
      if (i === 0) hung.push(top);
      else hung.push(...sagSpan(hung[hung.length - 1]!, top, 0.06, 0.4).slice(1));
    });
    const funnel = buildRope(hung, funnelUniforms, 0.008);
    funnel.mesh.name = "FFJ_FunnelRope";
    root.add(funnel.mesh);
    disposables.push(funnel.mesh.geometry, funnel.mesh.material as Material);
  }

  // The lighting flame, 1.8 m inside the gap.
  const flamePoint = layout.entrance.flame;
  const flameGround = ground(flamePoint.x, flamePoint.z);
  push("lighting-flame-stand", { x: flamePoint.x, y: flameGround, z: flamePoint.z, yaw: 0, colour: plain });
  const lightingFlame = { x: flamePoint.x, y: flameGround + 0.92, z: flamePoint.z };

  // Safety stations: a chair facing in, a wet towel over its back or on the grass beside it.
  const towelBack = new Matrix4().makeRotationZ(Math.PI / 2 + 0.22).setPosition(-0.33, 0.66, 0);
  layout.stations.forEach((s, i) => {
    const y = ground(s.x, s.z);
    push("camp-chair", { x: s.x, y, z: s.z, yaw: s.yaw, colour: jamFabricColor(JAM_FABRIC_PALETTE, s.chairColour) });
    const towelColour = new Color(i % 3 === 0 ? "#c9c3b4" : i % 3 === 1 ? "#9a8f7c" : "#b8aa90");
    if (s.towel === "back") {
      push("safety-towel", { x: s.x, y, z: s.z, yaw: s.yaw, colour: towelColour, local: towelBack });
    } else {
      const tx = s.x + Math.cos(s.yaw + Math.PI / 2) * 0.55;
      const tz = s.z + Math.sin(s.yaw + Math.PI / 2) * 0.55;
      push("safety-towel", { x: tx, y: ground(tx, tz), z: tz, yaw: s.yaw + 0.3, colour: towelColour });
    }
  });

  const lanterns: { x: number; y: number; z: number }[] = [];
  for (const item of layout.dressing) {
    const kind = DRESSING_MESH[item.kind];
    const palette = item.kind === "blanket" || item.kind === "yoga-mat" ? JAM_BLANKET_PALETTE : JAM_FABRIC_PALETTE;
    const y = ground(item.x, item.z);
    push(kind, { x: item.x, y, z: item.z, yaw: item.yaw, colour: jamFabricColor(palette, item.colour) });
    if (item.kind === "lantern") lanterns.push({ x: item.x, y: y + 0.11, z: item.z });
  }

  // The DJ booth: table square to the circle, a speaker on a stand each side, toed in.
  const booth = layout.djBooth;
  const boothY = ground(booth.x, booth.z);
  push("dj-table", { x: booth.x, y: boothY, z: booth.z, yaw: booth.yaw, colour: BOOTH_CLOTH, glowColour: BOOTH_GLOW });
  const across = { x: -Math.sin(booth.yaw), z: Math.cos(booth.yaw) };
  const speakers: { x: number; y: number; z: number }[] = [];
  for (const side of [-1, 1]) {
    const sx = booth.x + across.x * side * (booth.width / 2 + 0.45) - Math.cos(booth.yaw) * 0.1;
    const sz = booth.z + across.z * side * (booth.width / 2 + 0.45) - Math.sin(booth.yaw) * 0.1;
    const sy = ground(sx, sz);
    push("pa-speaker", { x: sx, y: sy, z: sz, yaw: booth.yaw - side * 0.18, colour: plain });
    speakers.push({ x: sx, y: sy + 1.9, z: sz });
  }
  const djX = booth.x - Math.cos(booth.yaw) * 0.75;
  const djZ = booth.z - Math.sin(booth.yaw) * 0.75;
  const dj = { x: djX, y: ground(djX, djZ), z: djZ, yaw: booth.yaw };

  // String lights: bulbs every `bulbSpacing` along each sagging span, a thin dark wire,
  // and a slim pole at each anchor the runs hang from.
  const wire = new MeshStandardMaterial({ color: "#151515", roughness: 0.8 });
  disposables.push(wire);
  const poles = new Map<string, Vector3>();
  for (const run of layout.stringLights) {
    const anchors = run.anchors.map((a) => new Vector3(a.x, ground(a.x, a.z) + a.height, a.z));
    for (const a of anchors) poles.set(`${a.x.toFixed(2)},${a.z.toFixed(2)}`, a);
    const points: Vector3[] = [anchors[0]!];
    for (let i = 1; i < anchors.length; i++) points.push(...sagSpan(anchors[i - 1]!, anchors[i]!, run.sag, 0.25).slice(1));
    const curve = new CatmullRomCurve3(points, false, "centripetal");
    const length = curve.getLength();
    const tube = new TubeGeometry(curve, Math.ceil(length * 3), 0.004, 4, false);
    const wireMesh = new Mesh(tube, wire);
    wireMesh.name = `FFJ_StringWire_${run.id}`;
    root.add(wireMesh);
    disposables.push(tube);
    const count = Math.floor(length / run.bulbSpacing);
    const at = new Vector3();
    for (let i = 1; i < count; i++) {
      curve.getPointAt(i / count, at);
      push("string-bulb", { x: at.x, y: at.y, z: at.z, yaw: 0, colour: plain, glowColour: BULB_GLOW });
    }
  }
  const poleMaterial = new MeshStandardMaterial({ color: "#5a4a38", roughness: 0.9 });
  disposables.push(poleMaterial);
  for (const top of poles.values()) {
    const base = ground(top.x, top.z);
    const height = top.y - base + 0.12;
    const pole = new Mesh(new CylinderGeometry(0.03, 0.04, height, 6), poleMaterial);
    pole.position.set(top.x, base + height / 2, top.z);
    pole.castShadow = true;
    pole.name = "FFJ_StringPole";
    root.add(pole);
    disposables.push(pole.geometry);
  }

  for (const [kind, placements] of byMesh) {
    for (const object of instance(sets.get(kind)!, placements, kind)) root.add(object);
  }

  const flameCloud = buildFlames([{ ...lightingFlame, y: lightingFlame.y - 0.02, phase: 0.3, size: 0.5 }]);
  flameCloud.points.name = "FFJ_LightingFlame";
  root.add(flameCloud.points);
  disposables.push(flameCloud.points.geometry, flameCloud.material);

  const spillColour = new Color();
  const a = new Color();
  const b = new Color();

  return {
    root,
    lightingFlame,
    speakers,
    dj,
    lanterns,
    meshSources,
    update({ elapsed, ropeGlow, ropeColour, driftColour, driftSeconds, viewScale }: JamSetUpdate) {
      for (const uniforms of [ropeUniforms, funnelUniforms]) {
        uniforms.uTime.value = elapsed;
        uniforms.uDrift.value = driftSeconds;
        uniforms.uColA.value.setRGB(...ropeColour);
        uniforms.uColB.value.setRGB(...driftColour);
      }
      ropeUniforms.uGlow.value = ropeGlow;
      funnelUniforms.uGlow.value = ropeGlow * 0.22;
      const breathe = 0.5 + 0.5 * Math.sin((Math.PI * 2 * elapsed) / driftSeconds);
      a.setRGB(...ropeColour);
      b.setRGB(...driftColour);
      spillColour.copy(a).lerp(b, 0.45 * breathe);
      for (const spill of spills) {
        spill.color.copy(spillColour).multiplyScalar(ropeGlow * 0.32);
        spill.visible = ropeGlow > 0.01;
      }
      for (const glow of nightGlows) {
        const level = glow.base * Math.min(1, ropeGlow * 1.4);
        const basic = glow.material as MeshBasicMaterial;
        if (basic.isMeshBasicMaterial) basic.color.setScalar(Math.max(0.12, level));
        else (glow.material as MeshStandardMaterial).emissiveIntensity = level;
      }
      flameCloud.material.uniforms.uTime!.value = elapsed;
      flameCloud.material.uniforms.uScale!.value = viewScale;
      // The lighting flame burns all evening; by day it is a pale lick you barely see.
      flameCloud.material.uniforms.uLit!.value = 0.45 + 0.55 * Math.min(1, ropeGlow * 1.5);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

