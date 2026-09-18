import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  loadShapeMatrix,
  shapeMatrixTipPoint,
} from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
import { flowerKey } from "$lib/shared/shape-matrix/domain/flower-signature";
import { buildModeRealizationCandidates } from "$lib/shared/shape-matrix/services/build-mode-realizations";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

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

describe("shape matrix prop pair", () => {
  it("returns the single build for a prop and for an equal pair", async () => {
    const single = await loadShapeMatrix(PropType.STAFF);
    const equal = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.STAFF,
    });
    expect(equal).toBe(single);
    expect(single.props).toEqual({
      left: PropType.STAFF,
      right: PropType.STAFF,
    });
    expect(single.tips.left).toEqual(shapeMatrixTipPoint(PropType.STAFF));
    expect(single.tips.right).toEqual(single.tips.left);
    expect(single.reach).toEqual({
      left: single.clubTipDx,
      right: single.clubTipDx,
    });
  });

  it("composes a mixed pair from each hand's own single build", async () => {
    const staff = await loadShapeMatrix(PropType.STAFF);
    const fan = await loadShapeMatrix(PropType.FAN);
    const mixed = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.FAN,
    });
    expect(mixed.props).toEqual({ left: PropType.STAFF, right: PropType.FAN });
    expect(mixed.left).toBe(staff.left);
    expect(mixed.right).toBe(fan.right);
    expect(mixed.tips).toEqual({
      left: staff.tips.left,
      right: fan.tips.right,
    });
    expect(mixed.reach).toEqual({
      left: staff.clubTipDx,
      right: fan.clubTipDx,
    });
    expect(mixed.clubTipDx).toBe(Math.max(staff.clubTipDx, fan.clubTipDx));
    expect(mixed.geometryKey).toBe(staff.geometryKey);
  });

  it("finds exact realizations for a mixed pair through per-hand tips", async () => {
    const data = await loadShapeMatrix({
      left: PropType.STAFF,
      right: PropType.BIGSTAFF,
    });
    const find = (key: string) => data.axis.find((f) => flowerKey(f) === key);
    const left = find("pro-0-in-diamond");
    const right = find("anti-0-out-diamond");
    if (!left || !right) throw new Error("Missing level-two flowers");
    const overlay = {
      left: data.left.get(flowerKey(left))?.left ?? [],
      right: data.right.get(flowerKey(right))?.right ?? [],
      tips: data.tips,
      clubTipDx: data.clubTipDx,
    };
    const candidates = await buildModeRealizationCandidates(
      { left, right },
      overlay,
      "SS"
    );
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    // Feeding one hand's tip to both proves the search reads each hand's own source.
    const collapsed = await buildModeRealizationCandidates(
      { left, right },
      { ...overlay, tips: { left: data.tips.left, right: data.tips.left } },
      "SS"
    );
    expect(collapsed).toHaveLength(0);
  }, 60_000);
});
