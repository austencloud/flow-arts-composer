// src/lib/features/fuse/domain/fuse-tnd-rule.dataframe.test.ts
/**
 * Every rule the TnD picker resolves is pointwise on the follower hand, so it
 * must yield its mode on every shift beat, whatever the driver arc is. This
 * reads the production dataframes so the claim cannot drift from the data
 * the generator draws from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deriveTnD } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HORIZONTAL_MIRROR_LOCATION_MAP,
  VERTICAL_MIRROR_LOCATION_MAP,
} from "$lib/shared/create/domain/strict-loop-placement-maps";
import { rotateLocation } from "$lib/shared/create/services/rotation-helpers";
import type { FuseRule } from "./fuse-rule";
import {
  FUSE_TND_MODES,
  resolveFuseRule,
  type FuseTnDSelection,
} from "./fuse-tnd-rule";

const GRIDS = ["DiamondPictographDataframe.csv", "BoxPictographDataframe.csv"];

interface Arc {
  motionType: string;
  start: GridLocation;
  end: GridLocation;
}

function loadLeftArcs(file: string): Arc[] {
  const csv = readFileSync(
    path.resolve(process.cwd(), "static/data/pictographs", file),
    "utf8"
  );
  return csv
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.split(",").map((s) => s.trim()))
    .filter((c) => c.length >= 13 && c[0])
    .map((c) => ({
      motionType: c[5]!,
      start: c[7] as GridLocation,
      end: c[8] as GridLocation,
    }))
    .filter((a) => a.motionType === "pro" || a.motionType === "anti");
}

/** Apply the rule's location map the way applyDriverRule does: rotate, then reflect. */
function mapLocation(loc: GridLocation, rule: FuseRule): GridLocation {
  let out = rotateLocation(loc, rule.rotationSteps) as GridLocation;
  if (rule.reflect === "mirror") out = VERTICAL_MIRROR_LOCATION_MAP[out] as GridLocation;
  if (rule.reflect === "flip") out = HORIZONTAL_MIRROR_LOCATION_MAP[out] as GridLocation;
  return out;
}

describe("every TnD rule pins its mode on every shift arc", () => {
  it.each(GRIDS)("%s", (file) => {
    const arcs = loadLeftArcs(file);
    expect(arcs.length).toBeGreaterThan(0);

    for (const mode of FUSE_TND_MODES) {
      for (const quarterOffset of ["cw", "ccw"] as const) {
        const selection: FuseTnDSelection = {
          mode,
          quarterOffset,
          invert: false,
          rewind: false,
        };
        const rule = resolveFuseRule(selection);
        const seen = new Set<string>();
        for (const arc of arcs) {
          const result = deriveTnD(
            arc.start,
            arc.end,
            mapLocation(arc.start, rule),
            mapLocation(arc.end, rule)
          );
          seen.add(String(result.tndMode));
        }
        expect([...seen], `${mode} ${quarterOffset}`).toEqual([mode]);
      }
    }
  });
});
