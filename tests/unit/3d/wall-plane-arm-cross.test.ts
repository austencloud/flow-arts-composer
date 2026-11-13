import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  findWallPlaneArmCross,
  type ArmCrossInput,
} from "#lib/shared/3d/services/wall-plane-arm-cross.js";

// The 22 T&D base words the viewer opens with. Blocking a word here takes
// wall plane away from it, so this pins exactly which ones lose it.
const words = JSON.parse(
  readFileSync(path.join(process.cwd(), "static/data/hero/tnd-base-words.json"), "utf8"),
) as Array<ArmCrossInput & { id: string }>;

describe("findWallPlaneArmCross", () => {
  it("blocks only the split-same words, whose arms swap while lying across each other", () => {
    const blocked = words.filter((word) => findWallPlaneArmCross(word)).map((word) => word.id);
    expect(blocked).toEqual(["tnd-split-same-aaaa", "tnd-split-same-bbbb", "tnd-split-same-cccc"]);
  });

  it("puts AAAA's pass-through where beat 1 hands over to beat 2", () => {
    const aaaa = words.find((word) => word.id === "tnd-split-same-aaaa")!;
    expect(findWallPlaneArmCross(aaaa)).toEqual({ beat: 2 });
  });

  it("leaves DJDJ alone: both hands rise through the cross, so one arm stays in front", () => {
    const djdj = words.find((word) => word.id === "tnd-tog-opp-djdj")!;
    expect(findWallPlaneArmCross(djdj)).toBeNull();
  });
});
