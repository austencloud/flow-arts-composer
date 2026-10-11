/**
 * Repro: /q scan cells render EMPTY (grid + letter only, no arrows/props) for
 * script-imported sequences viewed with ?bp=poi.
 *
 * Drives the DATA layer of the cell render (pictographPreparer.prepareSingle),
 * the exact call preview-cell-renderer.ts makes after a cloud (403) miss.
 * Mocks assetFetch to read the real static/ assets off disk so prop + arrow
 * SVGs and placement JSON resolve.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const staticDir = path.join(projectRoot, "static");

// assetFetch is the single fetch seam every static loader uses (prop svg, arrow
// svg, placement json). Serve from disk.
vi.mock("#lib/shared/net/asset-fetch.js", () => ({
  assetFetch: async (url: string) => {
    const rel = url.split("?")[0]!.replace(/^\//, "");
    const filePath = path.join(staticDir, rel);
    if (!fs.existsSync(filePath)) {
      return new Response("not found", { status: 404 });
    }
    const body = fs.readFileSync(filePath, "utf-8");
    const ct = filePath.endsWith(".json") ? "application/json" : "image/svg+xml";
    return new Response(body, { status: 200, headers: { "content-type": ct } });
  },
}));

// arrow-svg-loader + split manifest use the GLOBAL fetch (not assetFetch).
// Serve /images/... and /data/... off disk so arrow SVGs resolve.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (url.startsWith("/")) {
    const rel = url.split("?")[0]!.replace(/^\//, "");
    const filePath = path.join(staticDir, rel);
    if (!fs.existsSync(filePath)) {
      return new Response("not found", { status: 404 });
    }
    const body = fs.readFileSync(filePath, "utf-8");
    const ct = filePath.endsWith(".json") ? "application/json" : "image/svg+xml";
    return new Response(body, { status: 200, headers: { "content-type": ct } });
  }
  return realFetch(input, init);
}) as typeof fetch;

import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  MotionType,
  RotationDirection,
  Orientation,
  HandSide,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

// Motions shaped like a decoded /q sequence: EMPTY ({}) placement data, as
// sequence-encoder.ts emits (arrowPlacementData/propPlacementData = {}).
function decodedMotion(color: HandSide, over: Record<string, unknown>) {
  return {
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    turns: 1,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    isVisible: true,
    color,
    // Faithful to shortcode-stored / script-imported motions: NO propType,
    // arrowLocation, arrowPlacementData, or propPlacementData (all undefined).
    ...over,
  };
}

// Mirrors sequence-hydrator.ensureMotionPlacement: a lean motion is re-run
// through createMotionData, which fills the default placement objects.
function normalize(m: Record<string, unknown>) {
  return createMotionData(m as never);
}

function pictograph(normalized: boolean): PictographData {
  const left = decodedMotion(HandSide.LEFT, {
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
  });
  const right = decodedMotion(HandSide.RIGHT, {
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
  });
  return {
    letter: "A",
    gridMode: "diamond",
    motions: {
      left: normalized ? normalize(left) : left,
      right: normalized ? normalize(right) : right,
    },
  } as unknown as PictographData;
}

async function assetsFor(normalized: boolean, prop: PropType) {
  pictographPreparer.clearCache();
  const prepared = await pictographPreparer.prepareSingle(
    pictograph(normalized),
    { themeMode: "light", leftPropType: prop, rightPropType: prop }
  );
  const p = (prepared as unknown as { _prepared: any })._prepared;
  return {
    props: Object.keys(p.propAssets),
    arrows: Object.keys(p.arrowAssets),
  };
}

describe("scan cell prepare from lean (shortcode-resolved) motions", () => {
  beforeAll(() => {
    pictographPreparer.clearCache();
  });

  // The bug: motions stored without arrowPlacementData/propPlacementData
  // (undefined) trip the render guards → grid + letter only, no arrows/props.
  it("BUG REPRO — lean motions drop BOTH arrows and props (staff)", async () => {
    const { props, arrows } = await assetsFor(false, PropType.STAFF);
    expect(props).toEqual([]);
    expect(arrows).toEqual([]);
  });

  it("BUG REPRO — lean motions drop BOTH arrows and props (poi)", async () => {
    const { props, arrows } = await assetsFor(false, PropType.POI);
    expect(props).toEqual([]);
    expect(arrows).toEqual([]);
  });

  // The fix: hydrator normalizes each motion via createMotionData, restoring
  // the placement invariant → arrows + props render for any prop.
  it("FIX — normalized motions render prop + arrow assets (staff)", async () => {
    const { props, arrows } = await assetsFor(true, PropType.STAFF);
    expect(props).toEqual(expect.arrayContaining(["left", "right"]));
    expect(arrows).toEqual(expect.arrayContaining(["left", "right"]));
  });

  it("FIX — normalized motions render prop + arrow assets (poi)", async () => {
    const { props, arrows } = await assetsFor(true, PropType.POI);
    expect(props).toEqual(expect.arrayContaining(["left", "right"]));
    expect(arrows).toEqual(expect.arrayContaining(["left", "right"]));
  });
});
