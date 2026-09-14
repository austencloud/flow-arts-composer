import { describe, expect, it } from "vitest";
import { resolveLoopConfig } from "./loop-type-utils";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";

describe("resolveLoopConfig with a hand relationship", () => {
  it("coerces quartered rotation to halved for Mirrored and Flipped hands", () => {
    for (const handRelationship of ["mirrored", "flipped"]) {
      const resolved = resolveLoopConfig(LOOPType.ROTATED, "quartered", {
        handRelationship,
      });
      expect(resolved.period).toBe("halved");
      expect(resolved.loopRhythm.rotationInterval).toBe(2);
    }
  });

  it("keeps quartered rotation for Free, Unison, Opposite and no relationship", () => {
    for (const handRelationship of ["free", "unison", "opposite", undefined]) {
      expect(
        resolveLoopConfig(LOOPType.ROTATED, "quartered", { handRelationship })
          .period
      ).toBe("quartered");
    }
  });

  it("moves a diagonal reflection axis onto the relationship's own axis", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northeast-southwest",
        handRelationship: "mirrored",
      }).loopRhythm.reflectionAxis
    ).toBe("north-south");
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northwest-southeast",
        handRelationship: "flipped",
      }).loopRhythm.reflectionAxis
    ).toBe("east-west");
  });

  it("leaves a cardinal axis alone: both cardinal reflections commute with both relationships", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "east-west",
        handRelationship: "mirrored",
      }).loopRhythm.reflectionAxis
    ).toBe("east-west");
  });

  it("leaves a diagonal axis alone when the relationship is not a reflection", () => {
    expect(
      resolveLoopConfig(LOOPType.MIRRORED, "halved", {
        reflectionAxis: "northeast-southwest",
        handRelationship: "unison",
      }).loopRhythm.reflectionAxis
    ).toBe("northeast-southwest");
  });
});
