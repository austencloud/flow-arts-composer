/**
 * The surroundings as meshes: roads, walks and ground patches, buildings,
 * trees, railings, poles and wires, street lamps and parked cars.
 *
 * Takes a `SiteSurroundings` and returns one group. Everything of one material
 * merges into one mesh (about forty draws in all, whatever the size of the
 * neighbourhood), every surface has a faint light of its own so nothing falls to
 * black at night, and `setLight` turns on what a real street turns on at dusk:
 * lit windows, lamps, a drawn pool of light under each lamp, and at most four
 * real, unshadowed point lights for the lamps nearest the lot. Nothing here casts
 * a light's shadow or changes the sun's shadow box.
 */

import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  type BufferGeometry,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SURROUND_SIZES, type PatchSurface, type SiteSurroundings, type WallKind } from "./site-walk-around";
import {
  AROUND_TILE,
  grassTexture,
  mulchTexture,
  poolTexture,
  shingleTexture,
  slabTexture,
  walkTexture,
  wallTexture,
} from "./site-walk-around-textures";
import { MeshBuilder, offsetLine, stripBetween } from "./site-walk-around-geometry";
import { buildingGeometries } from "./site-walk-buildings";
import { carParts, ironFenceParts, lampPostParts, poolSquare, streetLightHead, streetLightParts } from "./site-walk-furniture";
import { LAYER, flat, poleParts, wireSpan } from "./site-walk-mesh-parts";
import type { Pt, SiteWalkWorld } from "./site-walk-plan";
import { floorAlong, siteFloor, type SiteFloor } from "./site-walk-floor";
import { drape, liftOnto, risenBounds } from "./site-walk-raised";
import { asphaltMaps, paverMaps, TILE } from "./site-walk-textures";
import { bareTreeGeometry, evergreenGeometry } from "./site-walk-trees";

export type AroundLight = "day" | "dusk" | "night";

export interface AroundMeshes {
  root: Group;
  /** Day: nothing lit. Dusk and Night: lit windows, lamps on, pools of light, and a few real lights. */
  setLight(light: AroundLight): void;
  /** What was built, for budgets and tests. */
  stats: { meshes: number; triangles: number };
  dispose(): void;
}

/** The most real lights the surroundings add, all without shadows. */
export const MAX_AROUND_LIGHTS = 4;

/** Heights of the flat layers the surroundings add, a few centimetres apart so none fights another. */
const FLAT = {
  patch: LAYER.street + 0.01,
  walk: LAYER.street + 0.012,
  paint: LAYER.street + 0.006,
  pool: 0.05,
} as const;

interface Slot {
  material: MeshStandardMaterial;
  parts: BufferGeometry[];
  cast: boolean;
  receive: boolean;
}

const hexLinear = (hex: string) => new Color(hex);

export function buildAroundMeshes(around: SiteSurroundings, world: SiteWalkWorld, floor: SiteFloor = siteFloor(world, around)): AroundMeshes {
  const slots: Slot[] = [];
  const materials: MeshStandardMaterial[] = [];
  const slot = (
    colour: string,
    o: {
      map?: Texture | null;
      roughness?: number;
      metalness?: number;
      emissive?: string;
      glow?: number;
      glowMap?: boolean;
      vertexColors?: boolean;
      flat?: boolean;
      cast?: boolean;
      receive?: boolean;
    } = {},
  ): Slot => {
    const material = new MeshStandardMaterial({
      color: hexLinear(colour),
      map: o.map ?? null,
      roughness: o.roughness ?? 0.9,
      metalness: o.metalness ?? 0,
      emissive: new Color(o.emissive ?? "#000000"),
      emissiveIntensity: o.glow ?? 0,
      emissiveMap: o.glowMap ? (o.map ?? null) : null,
      vertexColors: o.vertexColors ?? false,
      side: DoubleSide,
      polygonOffset: !!o.flat,
      polygonOffsetFactor: o.flat ? -1 : 0,
      polygonOffsetUnits: o.flat ? -1 : 0,
    });
    materials.push(material);
    const s: Slot = {
      material,
      parts: [],
      cast: o.cast ?? false,
      receive: o.receive ?? true,
    };
    slots.push(s);
    return s;
  };
  const add = (s: Slot, g: BufferGeometry | null | undefined) => {
    if (g) s.parts.push(g.index ? g.toNonIndexed() : g);
  };
  const addAll = (s: Slot, list: readonly BufferGeometry[]) => list.forEach((g) => add(s, g));

  // ---------------------------------------------------------------- ground
  const asphalt = slot("#c8ccd4", {
    map: asphaltMaps().albedo,
    roughness: 0.96,
    emissive: "#2c3442",
    glow: 0.2,
    glowMap: true,
    flat: true,
  });
  const paint = slot("#ece6cf", {
    roughness: 0.7,
    emissive: "#ece6cf",
    glow: 0.22,
    flat: true,
  });
  const kerb = slot("#a3a8b0", {
    roughness: 0.85,
    emissive: "#a3adbd",
    glow: 0.14,
    cast: true,
  });
  const walk = slot("#ffffff", {
    map: walkTexture(),
    emissive: "#b9b5ab",
    glow: 0.18,
    glowMap: true,
    flat: true,
  });
  const surfaces: Record<PatchSurface, { s: Slot; tile: number }> = {
    asphalt: { s: asphalt, tile: TILE.asphalt },
    concrete: {
      s: slot("#ffffff", {
        map: slabTexture(),
        emissive: "#b4b0a6",
        glow: 0.18,
        glowMap: true,
        flat: true,
      }),
      tile: AROUND_TILE.slab,
    },
    grass: {
      s: slot("#ffffff", {
        map: grassTexture(),
        roughness: 1,
        emissive: "#3c4430",
        glow: 0.14,
        glowMap: true,
        flat: true,
      }),
      tile: AROUND_TILE.grass,
    },
    mulch: {
      s: slot("#ffffff", {
        map: mulchTexture(),
        emissive: "#5a3626",
        glow: 0.2,
        glowMap: true,
        flat: true,
      }),
      tile: AROUND_TILE.mulch,
    },
    pavers: {
      s: slot("#ffffff", {
        map: paverMaps().albedo,
        emissive: "#d8cfbd",
        glow: 0.15,
        glowMap: true,
        flat: true,
      }),
      tile: TILE.pavers,
    },
  };

  const kerbAlong = (line: readonly Pt[]) => {
    const b = new MeshBuilder();
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const c = line[i + 1]!;
      const length = Math.hypot(c.x - a.x, c.z - a.z);
      if (length < 1e-6) continue;
      b.obox(
        (a.x + c.x) / 2,
        (a.z + c.z) / 2,
        (c.x - a.x) / length,
        (c.z - a.z) / length,
        length / 2,
        SURROUND_SIZES.kerbWidth / 2,
        0,
        SURROUND_SIZES.kerbHeight,
      );
    }
    add(kerb, b.build());
  };

  for (const road of around.roads) {
    const half = road.width / 2;
    const left = offsetLine(road.points, half);
    const right = offsetLine(road.points, -half);
    const b = new MeshBuilder();
    stripBetween(left, right, LAYER.street, TILE.asphalt, b);
    add(asphalt, b.build());
    // A dashed centre line on a road wide enough to carry one.
    if (road.width > 4) {
      const dash = new MeshBuilder();
      let carried = 0;
      for (let i = 0; i + 1 < road.points.length; i++) {
        const a = road.points[i]!;
        const c = road.points[i + 1]!;
        const length = Math.hypot(c.x - a.x, c.z - a.z);
        if (length < 1e-6) continue;
        const ux = (c.x - a.x) / length;
        const uz = (c.z - a.z) / length;
        for (let d = (3 - (carried % 9)) % 9; d < length; d += 9) {
          const d0 = Math.max(0, d);
          const d1 = Math.min(length, d + 3);
          if (d1 <= d0) continue;
          const p0 = { x: a.x + ux * d0, z: a.z + uz * d0 };
          const p1 = { x: a.x + ux * d1, z: a.z + uz * d1 };
          dash.face(
            [
              [p0.x - uz * 0.06, FLAT.paint, p0.z + ux * 0.06],
              [p1.x - uz * 0.06, FLAT.paint, p1.z + ux * 0.06],
              [p1.x + uz * 0.06, FLAT.paint, p1.z - ux * 0.06],
              [p0.x + uz * 0.06, FLAT.paint, p0.z - ux * 0.06],
            ],
            [0, 1, 0],
          );
        }
        carried += length;
      }
      add(paint, dash.build());
    }
    const edge = SURROUND_SIZES.kerbWidth / 2;
    if (road.kerbs === "both" || road.kerbs === "left") kerbAlong(offsetLine(road.points, half + edge));
    if (road.kerbs === "both" || road.kerbs === "right") kerbAlong(offsetLine(road.points, -half - edge));
  }
  for (const w of around.walks) {
    const b = new MeshBuilder();
    stripBetween(offsetLine(w.points, w.width / 2), offsetLine(w.points, -w.width / 2), FLAT.walk, AROUND_TILE.walk, b);
    add(walk, b.build());
  }
  // Patches lie on the lawn, so they follow its heights where it rises.
  const risen = risenBounds(floor);
  const onLawn = (g: BufferGeometry | null) => (g && risen ? drape(g, floor.groundAt, 0.6, risen) : g);
  for (const patch of around.patches) {
    const { s, tile } = surfaces[patch.surface];
    add(s, onLawn(flat(patch.points, FLAT.patch, tile)));
  }
  for (const line of around.kerbs) kerbAlong(line);

  // ---------------------------------------------------------------- buildings
  const wallSlots = new Map<WallKind, Slot>();
  const wallSlot = (kind: WallKind) => {
    let s = wallSlots.get(kind);
    if (!s)
      wallSlots.set(
        kind,
        (s = slot("#ffffff", {
          map: wallTexture(kind),
          roughness: 0.92,
          emissive: "#ffffff",
          glow: 0.1,
          glowMap: true,
          cast: true,
        })),
      );
    return s;
  };
  const roof = slot("#ffffff", {
    map: shingleTexture(),
    vertexColors: true,
    roughness: 0.95,
    emissive: "#ffffff",
    glow: 0.05,
    glowMap: true,
    cast: true,
  });
  const roofTop = slot("#6a6a66", {
    roughness: 0.95,
    emissive: "#6a6a66",
    glow: 0.12,
    cast: true,
  });
  const fascia = slot("#2e2a28", {
    roughness: 0.8,
    emissive: "#2e2a28",
    glow: 0.25,
    cast: true,
  });
  const glassDark = slot("#27313c", {
    roughness: 0.2,
    metalness: 0.3,
    emissive: "#202c3a",
    glow: 0.4,
  });
  const glassLit = slot("#ffe2b0", {
    roughness: 0.3,
    emissive: "#ffb460",
    glow: 0.1,
  });
  const trim = slot("#e4e2da", {
    roughness: 0.7,
    emissive: "#e4e2da",
    glow: 0.18,
  });
  const door = slot("#4a2f22", {
    roughness: 0.7,
    emissive: "#4a2f22",
    glow: 0.3,
  });
  const garage = slot("#d6d4ce", {
    roughness: 0.7,
    emissive: "#d6d4ce",
    glow: 0.16,
  });
  const groove = slot("#454545", {
    roughness: 0.8,
    emissive: "#454545",
    glow: 0.2,
  });
  const emblem = slot("#b8995a", {
    roughness: 0.45,
    metalness: 0.5,
    emissive: "#b8995a",
    glow: 0.25,
  });
  for (const building of around.buildings) {
    const g = buildingGeometries(building, floor);
    for (const [kind, list] of Object.entries(g.walls) as [WallKind, BufferGeometry[]][]) addAll(wallSlot(kind), list);
    addAll(roof, g.roof);
    addAll(roofTop, g.roofTop);
    addAll(fascia, g.fascia);
    addAll(glassDark, g.glassDark);
    addAll(glassLit, g.glassLit);
    addAll(trim, g.trim);
    addAll(door, g.door);
    addAll(garage, g.garage);
    addAll(groove, g.groove);
    addAll(emblem, g.emblem);
  }

  // ---------------------------------------------------------------- trees
  const trees = slot("#ffffff", {
    vertexColors: true,
    roughness: 1,
    emissive: "#17190f",
    glow: 0.5,
    cast: true,
  });
  for (const tree of around.trees) add(trees, tree.kind === "evergreen" ? evergreenGeometry(tree) : bareTreeGeometry(tree));

  // ---------------------------------------------------------------- iron
  const iron = slot("#16181c", {
    roughness: 0.55,
    emissive: "#0b0c0e",
    glow: 0.3,
    cast: true,
  });
  // Railings stand on the floor, post by post, so one along a platform's edge runs down its steps.
  for (const r of floor.railings) {
    const base = floorAlong(floor, r.points, SURROUND_SIZES.ironPostSpacing);
    for (const g of ironFenceParts(r.points, r.height, r.stars, r.endPost)) add(iron, liftOnto(g, base.at));
  }

  // ---------------------------------------------------------------- poles, wires, lamps
  const wood = slot("#5a4733", {
    roughness: 0.95,
    cast: true,
    emissive: "#2a2118",
    glow: 0.3,
  });
  const insulator = slot("#7b4b30", {
    roughness: 0.3,
    cast: true,
    emissive: "#3a2216",
    glow: 0.3,
  });
  const wire = slot("#26272b", {
    roughness: 0.6,
    cast: false,
    receive: false,
    emissive: "#18181b",
    glow: 0.3,
  });
  const lampMetal = slot("#16181c", {
    roughness: 0.5,
    cast: true,
    emissive: "#0b0c0e",
    glow: 0.3,
  });
  const lampGlass = slot("#fff0d0", {
    roughness: 0.3,
    emissive: "#ffc27a",
    glow: 0.05,
  });
  const wireDirection = (p: Pt): Pt => {
    let best = { d: Infinity, dir: { x: 1, z: 0 } as Pt };
    for (const w of around.wires) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i]!;
        const c = w.points[i + 1]!;
        const length = Math.hypot(c.x - a.x, c.z - a.z);
        if (length < 1e-6) continue;
        for (const end of [a, c]) {
          const d = Math.hypot(end.x - p.x, end.z - p.z);
          if (d < best.d)
            best = {
              d,
              dir: { x: (c.x - a.x) / length, z: (c.z - a.z) / length },
            };
        }
      }
    }
    return best.dir;
  };
  /** Where a lamp's light sits, and how far its pool reaches. */
  const sources: { x: number; y: number; z: number; pool: number }[] = [];
  for (const pole of around.poles) {
    const parts = poleParts(pole.at, wireDirection(pole.at), pole.height, pole.height - SURROUND_SIZES.poleArmDrop);
    addAll(wood, parts.wood);
    addAll(insulator, parts.insulators);
    if (pole.lamp) {
      const light = streetLightParts(pole);
      addAll(lampMetal, light.metal);
      addAll(lampGlass, light.glass);
      const head = streetLightHead(pole);
      sources.push({ x: head.x, y: head.y, z: head.z, pool: 7 });
    }
  }
  for (const w of around.wires)
    for (let i = 0; i + 1 < w.points.length; i++) addAll(wire, wireSpan(w.points[i]!, w.points[i + 1]!, w.height));
  for (const lamp of around.lamps) {
    const parts = lampPostParts(lamp);
    addAll(lampMetal, parts.metal);
    addAll(lampGlass, parts.glass);
    sources.push({
      x: lamp.at.x,
      y: lamp.height - 0.4,
      z: lamp.at.z,
      pool: 4.2,
    });
  }

  // ---------------------------------------------------------------- cars
  const carBody = slot("#ffffff", {
    vertexColors: true,
    roughness: 0.35,
    metalness: 0.2,
    emissive: "#23272b",
    glow: 0.18,
    cast: true,
  });
  const carGlass = slot("#1c242c", {
    roughness: 0.1,
    metalness: 0.4,
    emissive: "#1d2833",
    glow: 0.35,
  });
  const tyre = slot("#17171a", {
    roughness: 0.9,
    emissive: "#101012",
    glow: 0.3,
    cast: true,
  });
  const headlamp = slot("#f4efe0", {
    roughness: 0.3,
    emissive: "#fff2cc",
    glow: 0.05,
  });
  const taillamp = slot("#8a1c18", {
    roughness: 0.4,
    emissive: "#ff2a20",
    glow: 0.12,
  });
  for (const car of around.cars) {
    const parts = carParts(car);
    addAll(carBody, parts.body);
    addAll(carGlass, parts.glass);
    addAll(tyre, parts.tyre);
    addAll(headlamp, parts.head);
    addAll(taillamp, parts.tail);
  }

  // ---------------------------------------------------------------- pools of light
  const poolMaterial = new MeshBasicMaterial({
    color: new Color("#ffbd6e"),
    map: poolTexture(),
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const poolGeometries = sources.map((s) => poolSquare(s.x, s.z, s.pool, FLAT.pool));

  // ---------------------------------------------------------------- assemble
  const root = new Group();
  root.name = "SiteWalk_Around";
  const owned: BufferGeometry[] = [];
  let triangles = 0;
  let meshes = 0;
  for (const s of slots) {
    if (!s.parts.length) continue;
    // A patch laid over the lawn's heights comes back unindexed; the rest of its slot follows suit to merge.
    if (s.parts.some((g) => !g.index) && s.parts.some((g) => g.index)) {
      s.parts = s.parts.map((g) => {
        if (!g.index) return g;
        const plain = g.toNonIndexed();
        g.dispose();
        return plain;
      });
    }
    const merged = mergeGeometries(s.parts, false);
    for (const g of s.parts) g.dispose();
    if (!merged) continue;
    owned.push(merged);
    const mesh = new Mesh(merged, s.material);
    mesh.castShadow = s.cast;
    mesh.receiveShadow = s.receive;
    root.add(mesh);
    meshes += 1;
    triangles += merged.index ? merged.index.count / 3 : merged.getAttribute("position").count / 3;
  }
  if (poolGeometries.length) {
    const merged = mergeGeometries(poolGeometries, false);
    for (const g of poolGeometries) g.dispose();
    if (merged) {
      owned.push(merged);
      const mesh = new Mesh(merged, poolMaterial);
      mesh.renderOrder = 3;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = false;
      root.add(mesh);
      meshes += 1;
      triangles += merged.getAttribute("position").count / 3;
    }
  }

  // The lamps nearest the lot get a real light; the rest keep their drawn pool.
  const centre = world.lot?.length
    ? {
        x: world.lot.reduce((s, p) => s + p.x, 0) / world.lot.length,
        z: world.lot.reduce((s, p) => s + p.z, 0) / world.lot.length,
      }
    : {
        x: (world.bounds.minX + world.bounds.maxX) / 2,
        z: (world.bounds.minZ + world.bounds.maxZ) / 2,
      };
  const nearest = [...sources]
    .sort((a, b) => Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z))
    .slice(0, MAX_AROUND_LIGHTS);
  const lights = nearest.map((s) => {
    const light = new PointLight(0xffc27a, 0, 16, 2);
    light.position.set(s.x, s.y, s.z);
    light.castShadow = false;
    light.visible = false;
    root.add(light);
    return light;
  });

  const GLOW = {
    day: { lit: 0.08, lamp: 0.05, head: 0.05, tail: 0.12, pool: 0, light: 0 },
    dusk: { lit: 1.1, lamp: 1.4, head: 0.2, tail: 0.2, pool: 0.32, light: 7 },
    night: {
      lit: 1.9,
      lamp: 2.4,
      head: 0.25,
      tail: 0.3,
      pool: 0.62,
      light: 12,
    },
  } as const;

  return {
    root,
    stats: { meshes, triangles },
    setLight(light) {
      const g = GLOW[light];
      glassLit.material.emissiveIntensity = g.lit;
      // By day a lit window is only glass; the warm tint comes up with the lights.
      glassLit.material.color.set(light === "day" ? "#27313c" : "#ffe2b0");
      lampGlass.material.emissiveIntensity = g.lamp;
      headlamp.material.emissiveIntensity = g.head;
      taillamp.material.emissiveIntensity = g.tail;
      poolMaterial.opacity = g.pool;
      for (const child of root.children) if (child instanceof Mesh && child.material === poolMaterial) child.visible = g.pool > 0;
      for (const l of lights) {
        l.intensity = g.light;
        l.visible = g.light > 0;
      }
    },
    dispose() {
      for (const geometry of owned) geometry.dispose();
      for (const m of materials) m.dispose();
      poolMaterial.dispose();
      for (const l of lights) l.dispose();
    },
  };
}
