import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImportedTerrainDataV2 } from "#lib/shared/3d/procedural-engine/generation/real-terrain-zone.js";
import { parseFlowFestRuntimeContract } from "../../src/routes/test/flow-fest-graybox/flow-fest-runtime-contract";
import { deriveFlowFestForestEcology } from "../../src/routes/test/flow-fest-sim/flow-fest-forest-ecology";
import {
  distanceToFlowFestPolygon,
  distanceToFlowFestPolyline,
  FLOW_FEST_CAMPGROUND_LOOP,
  FLOW_FEST_DECORATED_PATHWAY,
  FLOW_FEST_PATHWAY_HALF_WIDTH_METERS,
  FLOW_FEST_TREELINE_DEPTH_METERS,
  insideFlowFestFireField,
  insideFlowFestPolygon,
} from "../../src/routes/test/flow-fest-sim/flow-fest-site-geometry";
import { FLOW_FEST_SITE_TREE_LAYOUT } from "../../src/routes/test/flow-fest-sim/flow-fest-site-tree-layout";
import {
  flowFestTreeFamiliesForRole,
  flowFestTreeFamiliesForSpecies,
} from "../../src/routes/test/flow-fest-sim/flow-fest-tree-species";

/**
 * Ground truth Austen gave in the 2026-09-03 site-labeling interview, recorded
 * in `docs/superpowers/specs/flow-fest-sim/site-labels-interview.md`.
 *
 * The two largest open spaces on the property are genuinely bare. Both read as
 * grass in the LiDAR canopy raster today, so placement already honours them —
 * these assertions exist so that a later canopy, infill, or layout change
 * cannot plant a tree in the fire field or inside the campground loop without
 * failing loudly. They are site facts, not implementation details.
 */

const root = process.cwd();

function readTypedArray<T extends Float32Array | Uint16Array>(
  path: string,
  make: (buffer: ArrayBuffer) => T
): T {
  const bytes = readFileSync(resolve(root, path));
  return make(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
  );
}

function loadSite() {
  const contract = parseFlowFestRuntimeContract(
    JSON.parse(
      readFileSync(
        resolve(root, "static/data/flow-fest-sim/gate2-runtime-contract.json"),
        "utf8"
      )
    )
  );
  const heights = readTypedArray(
    "static/data/flow-fest-sim/terrain-height.f32",
    (buffer) => new Float32Array(buffer)
  );
  const offsets = readTypedArray(
    "static/data/flow-fest-sim/surface-offset.u16",
    (buffer) => new Uint16Array(buffer)
  );
  const terrain: ImportedTerrainDataV2 = {
    version: 2,
    name: "Flow Fest Sim Earth site",
    sourceManifestPath: "/data/flow-fest-sim/terrain.manifest.json",
    worldBounds: { minX: -512, maxX: 512, minZ: -512, maxZ: 512 },
    heightmap: {
      width: 1025,
      height: 1025,
      minElevation: 270.7053527832031,
      maxElevation: 298.4906005859375,
      verticalOriginMeters: 270,
      verticalScale: 1,
      heights,
    },
    boundary: [
      { worldX: -512, worldZ: -512 },
      { worldX: 512, worldZ: -512 },
      { worldX: 512, worldZ: 512 },
      { worldX: -512, worldZ: 512 },
    ],
    geoReference: {
      projectedCrs: {
        authority: "EPSG",
        code: 26916,
        name: "NAD83 / UTM zone 16N",
      },
      requestedAnchorWgs84: { latitude: 39.589617, longitude: -84.785764 },
      resolvedOriginWgs84: {
        latitude: 39.589613265369856,
        longitude: -84.78576527257212,
      },
      originProjectedMeters: { easting: 690142, northing: 4384552 },
      axes: { x: "east", y: "up", z: "south" },
      verticalDatum: "NAVD88",
    },
  };
  return {
    contract,
    terrain,
    canopy: { offsetsCentimeters: offsets, width: 1025, height: 1025 },
  };
}

/**
 * The site polygons live in `flow-fest-site-geometry.ts` so the tree layout and
 * these assertions read the same traced shapes.
 */

describe("Flow Fest site ground truth", () => {
  const { contract, terrain, canopy } = loadSite();
  const ecology = deriveFlowFestForestEcology(contract, terrain, canopy, null, {
    speciesPlan: FLOW_FEST_SITE_TREE_LAYOUT,
  });

  it("leaves the Middle Earth fire field completely bare", () => {
    const intruders = ecology.trees.filter((tree) =>
      insideFlowFestFireField(tree.x, tree.z)
    );

    expect(
      intruders.map((tree) => `${tree.familyId} at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`)
    ).toEqual([]);
  });

  /**
   * Austen first called the inside of the loop "wide open, no trees", then
   * confirmed against the overlay that all twelve interior trees are real —
   * "I was speaking loosely. Those trees exist, you just don't get to camp
   * under them." So the interior carries a genuine stand around the main
   * building; what it does not carry is campable shade. The assertion holds
   * both halves: the stand exists, and the treeline dwarfs it.
   */
  it("keeps the loop interior overwhelmingly open", () => {
    const interior = ecology.trees.filter((tree) =>
      insideFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP)
    );
    const treeline = ecology.trees.filter(
      (tree) =>
        !insideFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) &&
        distanceToFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) <=
          FLOW_FEST_TREELINE_DEPTH_METERS
    );

    expect(interior.length).toBeGreaterThan(0);
    expect(interior.length).toBeLessThan(treeline.length / 4);
  });

  it("keeps a real treeline around the loop, which is where the shade comes from", () => {
    const treeline = ecology.trees.filter(
      (tree) =>
        !insideFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) &&
        distanceToFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) <=
          FLOW_FEST_TREELINE_DEPTH_METERS
    );

    expect(treeline.length).toBeGreaterThan(20);
    expect(
      Math.max(...treeline.map((tree) => tree.crownRadiusMeters))
    ).toBeGreaterThan(3);
  });

  /**
   * Austen on the campground treeline: "a dense wall of woods." Habitat
   * casting reads a woodland edge as a light gap and hands it the wide-crowned
   * open-grown forms, which is the opposite of a wall. The site layout
   * overrides that, and this holds it there.
   */
  it("builds the campground treeline out of closed-stand forms, not open-grown specimens", () => {
    const openGrown = new Set(
      flowFestTreeFamiliesForRole("open").filter(
        (familyId) =>
          !flowFestTreeFamiliesForSpecies("eastern-redcedar").includes(familyId)
      )
    );
    const treeline = ecology.trees.filter(
      (tree) =>
        !insideFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) &&
        distanceToFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) <=
          FLOW_FEST_TREELINE_DEPTH_METERS
    );

    expect(treeline.length).toBeGreaterThan(20);
    expect(
      treeline
        .filter((tree) => openGrown.has(tree.familyId))
        .map((tree) => `${tree.familyId} at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`)
    ).toEqual([]);
    expect(new Set(treeline.map((tree) => tree.familyId)).size).toBeGreaterThan(
      3
    );
  });

  /**
   * Austen on the decorated pathway: "dappled and patchy" — not a tunnel. The
   * layout cannot thin the stand, so it casts the narrowest crowns and keeps
   * out the two forms that would roof it: boxelder, the widest crown in the
   * catalog, and beech, whose signature is deep shade.
   */
  it("keeps the decorated pathway from being roofed over", () => {
    const roofing = new Set([
      ...flowFestTreeFamiliesForSpecies("boxelder"),
      ...flowFestTreeFamiliesForSpecies("american-beech"),
    ]);
    const corridor = ecology.trees.filter(
      (tree) =>
        !insideFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) &&
        distanceToFlowFestPolygon(tree.x, tree.z, FLOW_FEST_CAMPGROUND_LOOP) >
          FLOW_FEST_TREELINE_DEPTH_METERS &&
        distanceToFlowFestPolyline(
          tree.x,
          tree.z,
          FLOW_FEST_DECORATED_PATHWAY
        ) <= FLOW_FEST_PATHWAY_HALF_WIDTH_METERS
    );

    // The corridor's east half sits inside the treeline band, which owns it;
    // this is the stretch beyond, where the pathway is the only rule.
    expect(corridor.length).toBeGreaterThan(8);
    expect(
      corridor
        .filter((tree) => roofing.has(tree.familyId))
        .map((tree) => `${tree.familyId} at ${tree.x.toFixed(1)}, ${tree.z.toFixed(1)}`)
    ).toEqual([]);
  });
});
