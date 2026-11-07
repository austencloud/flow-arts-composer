import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FlowerStyle } from "@tka/shape-domain";
import {
  flowerPetalAnchor,
  flowerPetalMarks,
} from "@tka/shape-engine/services/flower-petal-anchor.js";
import { loadShapeMatrix } from "@tka/shape-engine/services/shape-matrix-flowers.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// Real data: the checked-in base-word snapshot and the diamond dataframe,
// served from static/ exactly as the app fetches them.
const STATIC = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(STATIC, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

describe("the real poi flowers' petal direction", () => {
  // Checked by eye against the drill: Austen names pro-2-out-diamond box mode.
  it.each<[string, FlowerStyle, string]>([
    ["pro-2-out-diamond", "pro", "diagonal"],
    ["pro-2-in-diamond", "pro", "cardinal"],
    ["pro-2-out-box", "pro", "cardinal"],
    ["anti-1-out-diamond", "anti", "cardinal"],
    ["anti-1-in-diamond", "anti", "diagonal"],
  ])("%s is %s, %s", async (key, style, expected) => {
    const data = await loadShapeMatrix(PropType.POI);
    expect(flowerPetalAnchor(data.left.get(key)?.left ?? [], style)).toBe(
      expected
    );
    // Both hands share one locus, so the answer can't depend on the hand.
    expect(flowerPetalAnchor(data.right.get(key)?.right ?? [], style)).toBe(
      expected
    );
  });

  it("names every 4-petal poi flower", async () => {
    const data = await loadShapeMatrix(PropType.POI);
    const fourPetal = data.axis.filter(
      (flower) => flower.style !== "float" && flower.petals === 4
    );
    expect(fourPetal.length).toBeGreaterThan(0);
    for (const flower of fourPetal) {
      if (flower.style === "float") continue;
      const key = `${flower.style}-${flower.turns}-${flower.ori}-${flower.grid}`;
      const paths = data.left.get(key)?.left ?? [];
      expect(flowerPetalAnchor(paths, flower.style), key).not.toBeNull();
    }
  });

  it.each<[string, FlowerStyle]>([
    ["pro-2-out-diamond", "pro"],
    ["anti-1-in-diamond", "anti"],
  ])("%s marks its four petals on the diagonals", async (key, style) => {
    const data = await loadShapeMatrix(PropType.POI);
    const marks = flowerPetalMarks(data.left.get(key)?.left ?? [], style, 4)!;
    expect(marks.angles).toHaveLength(4);
    [-135, -45, 45, 135].forEach((angle, index) =>
      expect(marks.angles[index]).toBeCloseTo(angle, 0)
    );
  });

  it("marks one point per petal on every poi flower", async () => {
    const data = await loadShapeMatrix(PropType.POI);
    for (const flower of data.axis) {
      if (flower.style === "float" || flower.petals === 0) continue;
      const key = `${flower.style}-${flower.turns}-${flower.ori}-${flower.grid}`;
      const marks = flowerPetalMarks(
        data.left.get(key)?.left ?? [],
        flower.style,
        flower.petals
      );
      expect(marks?.angles, key).toHaveLength(flower.petals);
    }
  });
});
