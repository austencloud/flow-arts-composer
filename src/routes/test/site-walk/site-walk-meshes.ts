/**
 * The site's shapes as plain meshes at true size.
 *
 * Takes the world `site-walk-plan.ts` reads and returns one group: ground,
 * the lot, asphalt, fences, the canopy and its banner panel, the guest area,
 * the stage's edge, the rope and the rest. Everything of one material merges
 * into one mesh. The canopy's roof is the jam's own `peakedTent`; nothing here
 * redraws a tent. No plan or banner data lives in this file: sizes come from
 * `SITE_SIZES`, shapes from the world, and the banner picture is handed in.
 */

import type {
  Material} from "three";
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  LinearSRGBColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildProceduralJamMesh, type JamMeshKind } from "../flow-fest-jam/flow-fest-jam-meshes";
import { peakedTent } from "../flow-fest-jam/flow-fest-jam-structures";
import { AROUND_TILE, grassTexture, mulchTexture, slabTexture, wallTexture } from "./site-walk-around-textures";
import { WALL_TILE } from "./site-walk-buildings";
import { floorAlong, siteFloor, type SiteFloor } from "./site-walk-floor";
import { drape, groundPatch, liftOnto, raisedGeometry, risenBounds } from "./site-walk-raised";
import { drawnStreets, fenceHeightOf, ironFence, type SiteSurroundings } from "./site-walk-around";
import { ironFenceParts } from "./site-walk-furniture";
import { LAYER, bar3, closedRing, flat, poleParts, post, recolour, run, sheet, strip, tube, wireSpan } from "./site-walk-mesh-parts";
import { SITE_SIZES, along, type Pt, type SiteWalkWorld } from "./site-walk-plan";
import { TILE, asphaltMaps, chainLinkTexture, dirtMaps, gravelMaps, paverMaps, type SurfaceMaps } from "./site-walk-textures";

/** The photographed packed ground the jam family already ships, used outside the lot. */
const GROUND_PHOTO = {
  albedo: "/textures/autumn-floor/packed-albedo.jpg",
  normal: "/textures/autumn-floor/normal.png",
  roughness: "/textures/autumn-floor/roughness.png",
} as const;

/** The plain dark of the banner panel before a picture is chosen. */
const BANNER_BLANK = "#14161b";
const GROUND_RADIUS = 1500;
/** Metres one repeat of the chain-link picture covers (four diamonds across). */
const CHAIN_LINK_TILE = 0.26;
/** How finely flat things are split to follow the lawn's heights: two grid steps of a foot. */
const DRAPE_STEP = 0.6;

/**
 * A hanging fabric wall from a to b, y0 to y1. It bellies out a few centimetres
 * along `normal` at mid span and mid height, and its top edge dips between the
 * legs by `sagTop`, the way a pop-up's side cloth hangs.
 */
function cloth(a: Pt, b: Pt, normal: Pt, y0: number, y1: number, full: number, sagTop: number, bulge: number): BufferGeometry | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const cols = Math.max(4, Math.round(length / 0.4));
  const rows = 3;
  const position: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const top = y1 - (y1 === full ? sagTop * Math.sin(Math.PI * u) : 0);
      const y = y0 + (top - y0) * (r / rows);
      const out = bulge * Math.sin(Math.PI * u) * Math.sin(Math.PI * Math.min(1, Math.max(0, y / full)));
      position.push(a.x + (b.x - a.x) * u + normal.x * out, y, a.z + (b.z - a.z) * u + normal.z * out);
      uv.push(u, r / rows);
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      index.push(i, i + 1, i + cols + 2, i, i + cols + 2, i + cols + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the build

interface Bucket {
  material: Material;
  geometries: BufferGeometry[];
  cast: boolean;
  receive: boolean;
  renderOrder: number;
}

export interface SiteWalkMeshes {
  root: Group;
  /** Put a picture on the banner panel, or null for the plain dark panel. The caller owns the texture. */
  setBannerImage(texture: Texture | null): void;
  dispose(): void;
}

export function buildSiteWalkMeshes(
  world: SiteWalkWorld,
  around: SiteSurroundings | null = null,
  floor: SiteFloor = siteFloor(world, around),
): SiteWalkMeshes {
  const buckets: Bucket[] = [];
  const materials: Material[] = [];
  const bucket = (
    colour: string,
    opts: {
      roughness?: number;
      opacity?: number;
      emissive?: string;
      emissiveIntensity?: number;
      cast?: boolean;
      receive?: boolean;
      flat?: boolean;
      renderOrder?: number;
      maps?: SurfaceMaps;
      normalScale?: number;
    } = {},
  ): Bucket => {
    const material = new MeshStandardMaterial({
      color: new Color(colour),
      roughness: opts.roughness ?? 0.92,
      metalness: 0,
      transparent: opts.opacity !== undefined,
      opacity: opts.opacity ?? 1,
      depthWrite: opts.opacity === undefined,
      emissive: new Color(opts.emissive ?? "#000000"),
      emissiveIntensity: opts.emissiveIntensity ?? 0,
      side: DoubleSide,
      polygonOffset: !!opts.flat,
      polygonOffsetFactor: opts.flat ? -1 : 0,
      polygonOffsetUnits: opts.flat ? -1 : 0,
      map: opts.maps?.albedo ?? null,
      roughnessMap: opts.maps?.roughness ?? null,
      // The zone's night glow carries the surface's own grain, not a flat sheet.
      emissiveMap: opts.maps?.albedo ?? null,
    });
    materials.push(material);
    const b: Bucket = {
      material,
      geometries: [],
      cast: opts.cast ?? false,
      receive: opts.receive ?? true,
      renderOrder: opts.renderOrder ?? 0,
    };
    buckets.push(b);
    return b;
  };
  const add = (b: Bucket, g: BufferGeometry | null) => {
    if (g) b.geometries.push(g);
  };
  /** Geometries already standing on the floor, which the lawn's heights must not lift again. */
  const onFloor = new Set<BufferGeometry>();
  const addOnFloor = (b: Bucket, g: BufferGeometry | null) => {
    if (g) onFloor.add(g);
    add(b, g);
  };

  // Every flat zone has its own value and a faint light of its own colour, so
  // none of them falls to black at night: the outside ground is the darkest,
  // then the lot (packed gravel), the guest area (a warm tint over the lot), the
  // patio (pavers) and the street (worn asphalt with a kerb and an edge line).
  // The glow carries each surface's own grain through `emissiveMap`.
  // A surroundings file with a lawn replaces the packed ground, and its photographs, with grass.
  const lawn = around?.ground.base === "grass";
  const dirt = dirtMaps();
  const ground = lawn
    ? bucket("#ffffff", {
        flat: true,
        emissive: "#3c4430",
        emissiveIntensity: 0.14,
        maps: { albedo: grassTexture() },
        roughness: 1,
      })
    : bucket("#9a9588", {
        flat: true,
        emissive: "#3a4033",
        emissiveIntensity: 0.1,
        maps: dirt,
        roughness: 1,
      });
  const groundTile = lawn ? AROUND_TILE.grass : TILE.dirt;
  // Fully matte: a rough map at a grazing sun reads as water, so the ground has none.
  (ground.material as MeshStandardMaterial).roughnessMap = null;
  const groundPlane = new PlaneGeometry(GROUND_RADIUS * 2, GROUND_RADIUS * 2);
  groundPlane.rotateX(-Math.PI / 2);
  groundPlane.translate((world.bounds.minX + world.bounds.maxX) / 2, LAYER.ground, (world.bounds.minZ + world.bounds.maxZ) / 2);
  {
    // World-metre UVs over the plane, so the ground tiles at one size however far it runs.
    const position = groundPlane.getAttribute("position");
    const uv = groundPlane.getAttribute("uv");
    for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / groundTile, position.getZ(i) / groundTile);
  }
  onFloor.add(groundPlane);
  add(ground, groundPlane);
  // Where the lawn rises, its own heights over the flat plane.
  addOnFloor(ground, groundPatch(floor, LAYER.ground + 0.004, groundTile));

  // Outside the lot the photographed ground replaces the drawn dirt once it arrives; the drawn dirt holds until then.
  let disposedMeshes = false;
  const photos: Texture[] = [];
  if (!lawn) {
    const loader = new TextureLoader();
    const groundMaterial = ground.material as MeshStandardMaterial;
    const load = (url: string, colour: boolean, apply: (t: Texture) => void) =>
      loader.load(
        url,
        (t) => {
          if (disposedMeshes) {
            t.dispose();
            return;
          }
          t.wrapS = t.wrapT = RepeatWrapping;
          t.colorSpace = colour ? SRGBColorSpace : LinearSRGBColorSpace;
          t.anisotropy = 8;
          photos.push(t);
          apply(t);
          groundMaterial.needsUpdate = true;
        },
        undefined,
        () => {},
      );
    load(GROUND_PHOTO.albedo, true, (t) => {
      groundMaterial.map = t;
      groundMaterial.emissiveMap = t;
    });
    load(GROUND_PHOTO.normal, false, (t) => {
      groundMaterial.normalMap = t;
      groundMaterial.normalScale.set(0.8, 0.8);
    });
  }

  if (world.lot) {
    if (around?.ground.lot === "mulch") {
      add(
        bucket("#ffffff", {
          flat: true,
          emissive: "#5a3626",
          emissiveIntensity: 0.2,
          maps: { albedo: mulchTexture() },
        }),
        flat(world.lot, LAYER.lot, AROUND_TILE.mulch),
      );
    } else
      add(
        bucket("#ffffff", {
          flat: true,
          emissive: "#8c8269",
          emissiveIntensity: 0.16,
          maps: gravelMaps(),
        }),
        flat(world.lot, LAYER.lot, TILE.gravel),
      );
  }

  const asphalt = bucket("#c8ccd4", {
    roughness: 0.96,
    flat: true,
    emissive: "#2c3442",
    emissiveIntensity: 0.2,
    maps: asphaltMaps(),
  });
  const kerb = bucket("#a3a8b0", {
    roughness: 0.85,
    emissive: "#a3adbd",
    emissiveIntensity: 0.14,
    flat: true,
    cast: true,
  });
  const paint = bucket("#ece6cf", {
    roughness: 0.7,
    flat: true,
    emissive: "#ece6cf",
    emissiveIntensity: 0.22,
  });
  for (const street of drawnStreets(world, around)) {
    for (const quad of street.quads) {
      add(asphalt, flat(quad, LAYER.street, TILE.asphalt));
      if (quad.length === 4) {
        // The first edge of a full strip is the street line itself: a low kerb on it, a painted line a step in.
        add(kerb, run(quad[0]!, quad[1]!, LAYER.street, LAYER.street + 0.1, 0.16));
        const inward = {
          x: quad[3]!.x - quad[0]!.x,
          z: quad[3]!.z - quad[0]!.z,
        };
        const width = Math.hypot(inward.x, inward.z) || 1;
        const step = {
          x: (inward.x / width) * 0.45,
          z: (inward.z / width) * 0.45,
        };
        add(
          paint,
          run(
            { x: quad[0]!.x + step.x, z: quad[0]!.z + step.z },
            { x: quad[1]!.x + step.x, z: quad[1]!.z + step.z },
            LAYER.street + 0.004,
            LAYER.street + 0.012,
            0.1,
          ),
        );
      }
    }
  }

  // A thin, dim outline so the borders show from eye level; far below the stage edge's glow.
  const outline = bucket("#f0d49a", {
    flat: true,
    emissive: "#f0d49a",
    emissiveIntensity: 0.3,
  });
  const outlineArea = (ring: readonly Pt[]) => {
    const closed = closedRing(ring);
    for (let i = 0; i + 1 < closed.length; i++) add(outline, run(closed[i]!, closed[i + 1]!, LAYER.area + 0.005, LAYER.area + 0.02, 0.06));
  };
  const concretePatio = around?.ground.patio === "concrete";
  const patio = concretePatio
    ? bucket("#ffffff", {
        flat: true,
        emissive: "#b4b0a6",
        emissiveIntensity: 0.18,
        maps: { albedo: slabTexture() },
      })
    : bucket("#ffffff", {
        flat: true,
        emissive: "#d8cfbd",
        emissiveIntensity: 0.15,
        maps: paverMaps(),
      });
  for (const [index, area] of world.patios.entries()) {
    // A raised patio is a block of its own below.
    if (floor.hidden.patios.has(index)) continue;
    add(patio, flat(area, LAYER.area, concretePatio ? AROUND_TILE.slab : TILE.pavers));
    outlineArea(area);
  }
  // Raised areas: solid stone blocks, the top and the faces down to the ground in the stone photograph.
  addOnFloor(
    bucket("#ffffff", {
      cast: true,
      emissive: "#ffffff",
      emissiveIntensity: 0.1,
      maps: { albedo: wallTexture("stone") },
    }),
    raisedGeometry(floor, WALL_TILE.stone),
  );
  if (world.guestArea) {
    // A faint warm tint over the lot's own surface; the outline marks the edge.
    add(
      bucket("#d9953a", {
        opacity: 0.08,
        flat: true,
        emissive: "#d9953a",
        emissiveIntensity: 0.1,
      }),
      flat(world.guestArea, LAYER.area),
    );
    outlineArea(world.guestArea);
  }

  // The stage is marked ground, not a platform: a dark floor with a bright edge that still reads at night.
  if (world.stage) {
    // The stage has no riser: its floor is the lot surface with a slight warm tint inside the edge line.
    add(
      bucket("#fff0cf", {
        flat: true,
        emissive: "#b8a982",
        emissiveIntensity: 0.3,
        maps: gravelMaps(),
      }),
      flat(world.stage, LAYER.stage, TILE.gravel),
    );
    // A laid line of warm light on the ground: a bright core strip and a wider dim strip beside it, so it
    // stays the brightest thing on the ground without a blown-out glow.
    const core = bucket("#ffe3a0", {
      emissive: "#ffb347",
      emissiveIntensity: 1.15,
      flat: true,
    });
    const halo = bucket("#c8873a", {
      emissive: "#ff8a2a",
      emissiveIntensity: 0.3,
      flat: true,
    });
    const ring = closedRing(world.stage);
    for (let i = 0; i + 1 < ring.length; i++) {
      add(core, strip(ring[i]!, ring[i + 1]!, 0.1, LAYER.edge));
      add(halo, strip(ring[i]!, ring[i + 1]!, 0.5, LAYER.edge - 0.01));
    }
  }

  // Chain-link fence: six-foot posts with caps, a top rail and a low tension
  // wire, and between them a diamond wire mesh you can see through. The mesh is
  // a tiling picture drawn once; it is not alpha-tested but alpha-to-coverage,
  // so at distance the wire thins to a faint haze with the render target's
  // multisampling instead of flickering in and out.
  const mesh = bucket("#c9ced4", { roughness: 0.45, receive: false });
  {
    const m = mesh.material as MeshStandardMaterial;
    m.metalness = 0.55;
    m.map = chainLinkTexture();
    m.alphaToCoverage = true;
  }
  const metal = bucket("#8a9096", { roughness: 0.5, cast: true });
  const fenceHeight = fenceHeightOf(around);
  const iron = ironFence(around);
  const ironMetal = iron
    ? bucket("#16181c", {
        roughness: 0.55,
        cast: true,
        emissive: "#0b0c0e",
        emissiveIntensity: 0.3,
      })
    : null;
  for (const [index, line] of world.fences.entries()) {
    if (floor.hidden.fences.has(index)) continue;
    const h = fenceHeight;
    if (ironMetal) {
      const base = floorAlong(floor, line, SITE_SIZES.fencePostSpacing);
      for (const g of ironFenceParts(line, h, null)) addOnFloor(ironMetal, liftOnto(g, base.at));
      continue;
    }
    for (let i = 0; i + 1 < line.length; i++) {
      add(mesh, sheet(line[i]!, line[i + 1]!, 0.05, h - 0.04, CHAIN_LINK_TILE));
      add(metal, tube(line[i]!, line[i + 1]!, h - 0.03, 0.022));
      add(metal, tube(line[i]!, line[i + 1]!, 0.07, 0.008));
    }
    for (const p of along(line, SITE_SIZES.fencePostSpacing)) {
      add(metal, post(p, h, 0.04));
      const cap = new CylinderGeometry(0.052, 0.052, 0.045, 8);
      cap.translate(p.x, h + 0.0225, p.z);
      add(metal, cap);
    }
  }

  // The show's edge: the jam's rope post every ten feet, with a cream rope hung between them that sags a hand's width.
  const rope = bucket("#d8d6cc", {
    roughness: 0.6,
    emissive: "#ff9a4a",
    emissiveIntensity: 0.12,
    cast: true,
  });
  const ropePost = bucket("#6b5a44", { cast: true, roughness: 0.95 });
  const postPart = buildProceduralJamMesh("rope-post").parts[0]!;
  const ROPE_AT = 0.86;
  for (const line of world.perimeters) {
    const posts = along(line, SITE_SIZES.ropePostSpacing);
    for (const p of posts) add(ropePost, postPart.geometry.clone().translate(p.x, 0, p.z));
    for (let i = 0; i + 1 < posts.length; i++) {
      const a = posts[i]!;
      const b = posts[i + 1]!;
      const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 0.4));
      const pts: Vector3[] = [];
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        pts.push(new Vector3(a.x + (b.x - a.x) * t, ROPE_AT - 0.07 * 4 * t * (1 - t), a.z + (b.z - a.z) * t));
      }
      add(rope, new TubeGeometry(new CatmullRomCurve3(pts), steps * 2, 0.014, 5, false));
    }
  }
  postPart.geometry.dispose();
  postPart.material.dispose();

  // Hazards.
  const pole = bucket("#5a4733", { cast: true, roughness: 0.95 });
  const insulator = bucket("#7b4b30", { cast: true, roughness: 0.3 });
  const wire = bucket("#26272b", {
    cast: true,
    receive: false,
    roughness: 0.6,
  });
  // Which way the wires run at each pole, so its crossarm sits across them.
  const wireDirection = (p: Pt): Pt => {
    let best: { d: number; dir: Pt } = { d: Infinity, dir: { x: 1, z: 0 } };
    for (const line of world.wires) {
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i]!;
        const b = line[i + 1]!;
        const length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 1e-6) continue;
        for (const end of [a, b]) {
          const d = Math.hypot(end.x - p.x, end.z - p.z);
          if (d < best.d)
            best = {
              d,
              dir: { x: (b.x - a.x) / length, z: (b.z - a.z) / length },
            };
        }
      }
    }
    return best.dir;
  };
  for (const p of world.poles) {
    const parts = poleParts(p, wireDirection(p), SITE_SIZES.poleHeight, SITE_SIZES.wiresHeight);
    for (const g of parts.wood) add(pole, g);
    for (const g of parts.insulators) add(insulator, g);
  }
  // Three wires per span, hung from the insulator tops, sagging gently between spans.
  for (const line of world.wires) {
    for (let i = 0; i + 1 < line.length; i++) for (const g of wireSpan(line[i]!, line[i + 1]!, SITE_SIZES.wiresHeight)) add(wire, g);
  }
  const flame = bucket("#f2e3b3", {
    emissive: "#ffcf6a",
    emissiveIntensity: 0.9,
  });
  for (const p of world.candles) add(flame, post(p, SITE_SIZES.candleHeight, 0.05));

  // The safety station: a square of red matting so it reads from across the lot, with an
  // extinguisher on it (the jam's fuel can and folded towel are stood beside it below).
  const mat = bucket("#a8241a", {
    roughness: 0.85,
    emissive: "#6a1610",
    emissiveIntensity: 0.22,
    flat: true,
  });
  const extRed = bucket("#c4261c", { roughness: 0.4, cast: true });
  const extBlack = bucket("#121214", { roughness: 0.5, cast: true });
  for (const p of world.safeties) {
    const h = SITE_SIZES.safetySize / 2;
    add(
      mat,
      flat(
        [
          { x: p.x - h, z: p.z - h },
          { x: p.x + h, z: p.z - h },
          { x: p.x + h, z: p.z + h },
          { x: p.x - h, z: p.z + h },
        ],
        LAYER.area,
      ),
    );
    const body = new CylinderGeometry(0.07, 0.07, 0.42, 14);
    body.translate(p.x + h * 0.55, 0.03 + 0.21, p.z - h * 0.5);
    add(extRed, body);
    const neck = new CylinderGeometry(0.03, 0.04, 0.05, 10);
    neck.translate(p.x + h * 0.55, 0.03 + 0.445, p.z - h * 0.5);
    add(extBlack, neck);
    const top = new CylinderGeometry(0.045, 0.035, 0.06, 10);
    top.translate(p.x + h * 0.55, 0.03 + 0.5, p.z - h * 0.5);
    add(extBlack, top);
    const hose = new CylinderGeometry(0.012, 0.012, 0.3, 6);
    hose.rotateZ(0.5);
    hose.translate(p.x + h * 0.55 + 0.1, 0.03 + 0.3, p.z - h * 0.5);
    add(extBlack, hose);
  }

  // Plain blocks.
  const block = bucket("#8b857a", { cast: true });
  for (const [index, ring] of world.buildings.entries()) {
    if (floor.hidden.buildings.has(index)) continue;
    const closed = closedRing(ring);
    for (let i = 0; i + 1 < closed.length; i++) add(block, run(closed[i]!, closed[i + 1]!, 0, SITE_SIZES.buildingHeight, 0.12));
    add(block, flat(ring, SITE_SIZES.buildingHeight));
  }
  const crate = bucket("#a8a49a", { cast: true });
  for (const [index, rect] of world.boxes.entries()) {
    if (floor.hidden.boxes.has(index)) continue;
    const g = new BoxGeometry(rect.w, SITE_SIZES.boxHeight, rect.d);
    g.rotateY(-rect.turn);
    g.translate(rect.centre.x, SITE_SIZES.boxHeight / 2, rect.centre.z);
    add(crate, g);
  }
  const doorMark = bucket("#6b4f2a", { flat: true });
  for (const p of world.doors) {
    const s = SITE_SIZES.doorSize / 2;
    add(
      doorMark,
      flat(
        [
          { x: p.x - s, z: p.z - s },
          { x: p.x + s, z: p.z - s },
          { x: p.x + s, z: p.z + s },
          { x: p.x - s, z: p.z + s },
        ],
        LAYER.area,
      ),
    );
  }

  // Canopies: a frame with feet, the jam's peaked roof with its valance, and
  // sagging fabric walls with a darker hem on the closed sides.
  const wallCloth = bucket("#3a3d47", {
    cast: true,
    roughness: 0.95,
    emissive: "#20222a",
    emissiveIntensity: 0.5,
  });
  const hemCloth = bucket("#17181d", {
    cast: true,
    roughness: 0.95,
    emissive: "#0c0c10",
    emissiveIntensity: 0.4,
  });
  const frameMetal = bucket("#b4b7bd", { cast: true, roughness: 0.45 });
  const feet = bucket("#26272b", { cast: true, roughness: 0.6 });
  const HEM = 0.28;
  const tentFabric: BufferGeometry[] = [];
  const tentHard: BufferGeometry[] = [];
  const world4 = new Matrix4();
  const eave = SITE_SIZES.eaveHeight;
  for (const canopy of world.canopies) {
    for (const wall of canopy.walls) {
      if (wall.open) continue;
      add(wallCloth, cloth(wall.a, wall.b, wall.normal, HEM, eave, eave, 0.07, 0.03));
      add(hemCloth, cloth(wall.a, wall.b, wall.normal, 0, HEM, eave, 0, 0.03));
    }
    const piece = peakedTent(canopy.w, canopy.d, eave, SITE_SIZES.roofRise, "#2b2e37", 2);
    // Roof panels are a shade darker than the walls; the valance band at the eave is lighter, so the eave line reads.
    piece.fabric.forEach((g, i) => recolour(g, i === 0 ? "#2b2e37" : "#555966"));
    world4.makeRotationY(-canopy.turn).setPosition(canopy.centre.x, 0, canopy.centre.z);
    for (const g of piece.fabric) tentFabric.push(g.applyMatrix4(world4));
    for (const g of piece.hard) tentHard.push(g.applyMatrix4(world4));
    // Feet under the four legs, eave rails between their tops, and hip bars up to the peak.
    const at = (x: number, y: number, z: number) => new Vector3(x, y, z).applyMatrix4(world4);
    const legs = [
      [0.49, 0.49],
      [0.49, -0.49],
      [-0.49, -0.49],
      [-0.49, 0.49],
    ] as const;
    const tops = legs.map(([sx, sz]) => at(sx * canopy.w, eave, sz * canopy.d));
    const peak = at(0, eave + SITE_SIZES.roofRise, 0);
    legs.forEach(([sx, sz], i) => {
      const foot = new BoxGeometry(0.16, 0.025, 0.16);
      foot.rotateY(-canopy.turn);
      const base = at(sx * canopy.w, 0.0125, sz * canopy.d);
      foot.translate(base.x, base.y, base.z);
      add(feet, foot);
      add(frameMetal, bar3(tops[i]!, tops[(i + 1) % 4]!, 0.018));
      add(frameMetal, bar3(new Vector3(tops[i]!.x, 0.03, tops[i]!.z), tops[i]!, 0.032));
      add(frameMetal, bar3(tops[i]!, peak, 0.012));
    });
  }

  // The banner panel: 8 x 4 ft, outside the closed wall that faces the stage.
  let bannerMaterial: MeshStandardMaterial | null = null;
  let bannerGeometry: PlaneGeometry | null = null;
  let bannerMesh: Mesh | null = null;
  const first = world.canopies[0];
  const bannerWall = first?.walls.find((wall) => wall.side === first.bannerSide);
  if (first && bannerWall) {
    const wallLength = Math.hypot(bannerWall.b.x - bannerWall.a.x, bannerWall.b.z - bannerWall.a.z);
    // A wall shorter than the panel gets a smaller panel of the same proportions.
    const fit = Math.min(1, Math.max(0.1, (wallLength - 0.1) / SITE_SIZES.bannerWidth));
    bannerGeometry = new PlaneGeometry(SITE_SIZES.bannerWidth * fit, SITE_SIZES.bannerHeight * fit);
    bannerMaterial = new MeshStandardMaterial({
      color: new Color(BANNER_BLANK),
      roughness: 0.8,
      metalness: 0,
      side: DoubleSide,
    });
    bannerMesh = new Mesh(bannerGeometry, bannerMaterial);
    bannerMesh.name = "SiteWalk_Banner";
    const mid = {
      x: (bannerWall.a.x + bannerWall.b.x) / 2,
      z: (bannerWall.a.z + bannerWall.b.z) / 2,
    };
    bannerMesh.position.set(mid.x + bannerWall.normal.x * 0.04, SITE_SIZES.bannerCentreHeight, mid.z + bannerWall.normal.z * 0.04);
    // A plane faces +z; turn it to face out of the wall.
    bannerMesh.rotation.y = Math.atan2(bannerWall.normal.x, bannerWall.normal.z);
    bannerMesh.castShadow = false;
    bannerMesh.receiveShadow = true;
    // Four ties at the corners hold the panel to the wall.
    const len = wallLength || 1;
    const tangent = {
      x: (bannerWall.b.x - bannerWall.a.x) / len,
      z: (bannerWall.b.z - bannerWall.a.z) / len,
    };
    const halfW = (SITE_SIZES.bannerWidth * fit) / 2;
    const halfH = (SITE_SIZES.bannerHeight * fit) / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const tie = new BoxGeometry(0.05, 0.05, 0.06);
        tie.rotateY(Math.atan2(bannerWall.normal.x, bannerWall.normal.z));
        tie.translate(
          mid.x + tangent.x * halfW * sx + bannerWall.normal.x * 0.025,
          SITE_SIZES.bannerCentreHeight + halfH * sy,
          mid.z + tangent.z * halfW * sx + bannerWall.normal.z * 0.025,
        );
        add(feet, tie);
      }
    }
  }

  // Inside each canopy, against the wall opposite the open side: a folding table
  // with a lantern on it, a cooler and fuel cans. All from the jam's own mesh set.
  const props = new Group();
  props.name = "SiteWalk_CanopyProps";
  const propParts: Array<{ geometry: BufferGeometry; material: Material }> = [];
  const prop = (kind: JamMeshKind, x: number, z: number, yaw: number, y = 0, tint?: string) => {
    for (const part of buildProceduralJamMesh(kind).parts) {
      const material = part.material.clone() as MeshStandardMaterial;
      if (part.tinted && tint && !part.glow) material.color.set(tint);
      const mesh = new Mesh(part.geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.castShadow = !part.glow;
      mesh.receiveShadow = true;
      props.add(mesh);
      propParts.push({ geometry: part.geometry, material });
      part.material.dispose();
    }
  };
  for (const p of world.safeties) {
    const h = SITE_SIZES.safetySize / 2;
    prop("fuel-can", p.x - h * 0.5, p.z + h * 0.35, 0.3, LAYER.area);
    prop("safety-towel", p.x - h * 0.15, p.z - h * 0.45, 0.2, LAYER.area);
  }
  for (const canopy of world.canopies) {
    const open = canopy.walls.find((w) => w.open);
    if (!open) continue;
    const n = open.normal;
    const t = { x: -n.z, z: n.x };
    const span = Math.hypot(open.b.x - open.a.x, open.b.z - open.a.z);
    const reach = Math.hypot((open.a.x + open.b.x) / 2 - canopy.centre.x, (open.a.z + open.b.z) / 2 - canopy.centre.z);
    if (span < 2.4 || reach < 1.6) continue;
    const back = reach - 0.7;
    const spot = (along: number, across: number) => ({
      x: canopy.centre.x - n.x * along + t.x * across,
      z: canopy.centre.z - n.z * along + t.z * across,
    });
    // The jam's table has its front on +X; a turn about Y of atan2(-z, x) sends +X to the open side.
    const yaw = Math.atan2(-n.z, n.x);
    const table = spot(back, 0);
    prop("dj-table", table.x, table.z, yaw, 0, "#cfc8b6");
    prop("led-lantern", table.x, table.z, yaw, 0.78);
    const room = span / 2 - 0.35;
    if (room > 1.3) {
      const cooler = spot(back, Math.min(room, 1.45));
      prop("cooler", cooler.x, cooler.z, yaw, 0, "#2f5a7a");
      const cans = [spot(back + 0.1, -Math.min(room, 1.3)), spot(back - 0.15, -Math.min(room, 1.3) + 0.28)];
      cans.forEach((c, i) => prop("fuel-can", c.x, c.z, yaw + 0.4 * i, 0));
    }
    // A dim warm light so the canopy reads at night; the lantern is its source.
    const glow = new PointLight(0xffc27a, 1.6, 6, 2);
    glow.position.set(table.x, 1.05, table.z);
    glow.castShadow = false;
    props.add(glow);
  }

  // ---------------------------------------------------------------- assemble
  const root = new Group();
  root.name = "SiteWalk_Site";
  const owned: BufferGeometry[] = [];
  // The lawn's own heights: everything on the ground is laid over them, split
  // fine where the lawn rises so flat things follow it, not cut through it.
  const risen = risenBounds(floor);
  const groundAt = floor.groundAt;
  if (risen) {
    for (const b of buckets) {
      b.geometries = b.geometries.map((g) => {
        if (!onFloor.has(g)) return drape(g, groundAt, DRAPE_STEP, risen);
        if (!g.index) return g;
        const plain = g.toNonIndexed();
        g.dispose();
        return plain;
      });
    }
    for (const list of [tentFabric, tentHard]) for (const g of list) liftOnto(g, groundAt);
    for (const child of props.children) child.position.y += groundAt({ x: child.position.x, z: child.position.z });
    if (bannerMesh) bannerMesh.position.y += groundAt({ x: bannerMesh.position.x, z: bannerMesh.position.z });
  }
  for (const b of buckets) {
    if (!b.geometries.length) continue;
    const merged = mergeGeometries(b.geometries, false);
    for (const g of b.geometries) g.dispose();
    if (!merged) continue;
    owned.push(merged);
    const mesh = new Mesh(merged, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.renderOrder;
    root.add(mesh);
  }

  const tentFabricMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    side: DoubleSide,
    emissive: new Color("#22242b"),
    emissiveIntensity: 0.5,
  });
  const tentHardMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.1,
  });
  materials.push(tentFabricMaterial, tentHardMaterial);
  for (const [list, material] of [
    [tentFabric, tentFabricMaterial],
    [tentHard, tentHardMaterial],
  ] as const) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    merged.computeVertexNormals();
    owned.push(merged);
    const mesh = new Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  if (bannerMesh) root.add(bannerMesh);
  if (props.children.length) root.add(props);

  return {
    root,
    setBannerImage(texture) {
      if (!bannerMaterial) return;
      bannerMaterial.map = texture;
      // The picture lights itself softly, so it reads in the dusk and at night.
      bannerMaterial.emissiveMap = texture;
      bannerMaterial.emissive.set(texture ? "#ffffff" : "#000000");
      bannerMaterial.emissiveIntensity = texture ? 0.5 : 0;
      bannerMaterial.color.set(texture ? "#ffffff" : BANNER_BLANK);
      bannerMaterial.needsUpdate = true;
    },
    dispose() {
      disposedMeshes = true;
      for (const t of photos) t.dispose();
      for (const g of owned) g.dispose();
      for (const m of materials) m.dispose();
      for (const part of propParts) {
        part.geometry.dispose();
        part.material.dispose();
      }
      bannerGeometry?.dispose();
      bannerMaterial?.dispose();
    },
  };
}
