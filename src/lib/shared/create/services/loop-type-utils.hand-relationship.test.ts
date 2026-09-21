import { describe, expect, it } from "vitest";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import {
  handModesBlockedByLoop,
  loopBlocksHandMode,
  resolveLoopConfig,
  tndLoopCompatibility,
} from "./loop-type-utils";

function axisFor(
  loopType: LOOPType,
  reflectionAxis:
    | "north-south"
    | "east-west"
    | "northeast-southwest"
    | "northwest-southeast",
  handRelationship: string
) {
  return resolveLoopConfig(loopType, "halved", {
    reflectionAxis,
    handRelationship,
  }).loopRhythm.reflectionAxis;
}

function periodFor(handRelationship: string) {
  return resolveLoopConfig(LOOPType.ROTATED, "quartered", { handRelationship })
    .period;
}

describe("resolveLoopConfig under a hand mode", () => {
  it("TO keeps both cardinal axes and coerces a diagonal to north-south", () => {
    expect(axisFor(LOOPType.MIRRORED, "east-west", "TO")).toBe("east-west");
    expect(axisFor(LOOPType.MIRRORED, "north-south", "TO")).toBe("north-south");
    expect(axisFor(LOOPType.MIRRORED, "northeast-southwest", "TO")).toBe(
      "north-south"
    );
  });

  it("SO keeps both cardinal axes and coerces a diagonal to east-west", () => {
    expect(axisFor(LOOPType.FLIPPED, "north-south", "SO")).toBe("north-south");
    expect(axisFor(LOOPType.FLIPPED, "northwest-southeast", "SO")).toBe(
      "east-west"
    );
  });

  it("TO and SO drop quartered rotation to halved", () => {
    expect(periodFor("TO")).toBe("halved");
    expect(periodFor("SO")).toBe("halved");
  });

  it("QS keeps quartered rotation", () => {
    expect(periodFor("QS")).toBe("quartered");
  });

  it("QO keeps a diagonal, coerces a cardinal to northeast-southwest, never runs quartered", () => {
    expect(axisFor(LOOPType.MIRRORED, "northwest-southeast", "QO")).toBe(
      "northwest-southeast"
    );
    expect(axisFor(LOOPType.MIRRORED, "north-south", "QO")).toBe(
      "northeast-southwest"
    );
    expect(periodFor("QO")).toBe("halved");
  });

  it("free, TS and SS keep everything", () => {
    for (const hand of ["free", "TS", "SS"]) {
      expect(periodFor(hand)).toBe("quartered");
      expect(axisFor(LOOPType.MIRRORED, "northwest-southeast", hand)).toBe(
        "northwest-southeast"
      );
    }
  });

  it("reads an unknown value as free", () => {
    expect(periodFor("mirrored")).toBe("quartered");
  });
});

describe("tndLoopCompatibility", () => {
  it("QS blocks the reflections and swap", () => {
    expect([...tndLoopCompatibility("QS").blockedComponents].sort()).toEqual(
      [
        LOOPComponent.FLIPPED,
        LOOPComponent.MIRRORED,
        LOOPComponent.SWAPPED,
      ].sort()
    );
    expect(tndLoopCompatibility("QS").allowsQuartered).toBe(true);
  });

  it("the other modes block nothing", () => {
    for (const hand of ["free", "TS", "SS", "TO", "SO", "QO"] as const) {
      expect(tndLoopCompatibility(hand).blockedComponents.size).toBe(0);
    }
  });
});

describe("loopBlocksHandMode and handModesBlockedByLoop", () => {
  it("names the component that rules out QS", () => {
    expect(loopBlocksHandMode(LOOPType.MIRRORED, "QS")).toBe(
      LOOPComponent.MIRRORED
    );
    expect(loopBlocksHandMode(LOOPType.SWAPPED, "QS")).toBe(
      LOOPComponent.SWAPPED
    );
    expect(loopBlocksHandMode(LOOPType.ROTATED, "QS")).toBeNull();
    expect(loopBlocksHandMode(LOOPType.MIRRORED, "TO")).toBeNull();
    expect(loopBlocksHandMode(null, "QS")).toBeNull();
  });

  it("lists QS with a reason under a reflection or swap and nothing otherwise", () => {
    expect(handModesBlockedByLoop(LOOPType.MIRRORED)).toEqual({
      QS: "Not compatible with a Reflection LOOP",
    });
    expect(handModesBlockedByLoop(LOOPType.SWAPPED)).toEqual({
      QS: "Not compatible with a Swapped LOOP",
    });
    expect(handModesBlockedByLoop(LOOPType.ROTATED)).toEqual({});
    expect(handModesBlockedByLoop(null)).toEqual({});
  });
});
