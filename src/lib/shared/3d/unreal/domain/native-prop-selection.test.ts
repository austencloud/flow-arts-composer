import { describe, expect, it } from "vitest";
import type { PropBuild } from "@austencloud/scene-3d";
import { nativePropId, nativePropSelection } from "./native-prop-selection";

const build: PropBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
  triangleGrip: "corner",
};

describe("native prop selection", () => {
  it.each([
    ["fire", "black", "bare", "fan:fire_black_bare"],
    ["fire", "black", "covered", "fan:fire_black_covered"],
    ["lotus", "black", "bare", "fan:lotus_black_bare"],
    ["day", "black", "bare", "fan:day_black_bare"],
    ["day", "black", "covered", "fan:day_black_covered"],
    ["day", "white", "bare", "fan:day_white_bare"],
    ["day", "white", "covered", "fan:day_white_covered"],
    ["moon", "black", "bare", "fan:moon_black_bare"],
    ["flat-grip", "black", "bare", "fan:flat-grip_black_bare"],
    ["star", "black", "bare", "fan:star_black_bare"],
  ] as const)(
    "round-trips %s / %s / %s through native state",
    (fanBuild, fanFrameColor, fanCover, id) => {
      const selection = { ...build, fanBuild, fanFrameColor, fanCover };
      expect(nativePropId("fan", selection)).toBe(id);
      expect(nativePropSelection(id)).toEqual({
        prop: "fan",
        build: { fanBuild, fanFrameColor, fanCover },
      });
      expect(
        nativePropId("fan", { ...build, ...nativePropSelection(id).build })
      ).toBe(id);
    }
  );

  it("restores the actual pictograph build from legacy and explicit native IDs", () => {
    for (const id of ["fan", "fan:pictograph"]) {
      expect(nativePropSelection(id).build).toEqual({
        fanBuild: "pictograph",
        fanFrameColor: "black",
        fanCover: "bare",
      });
    }
    expect(nativePropId("fan", build)).toBe("fan");
  });

  it("ignores dormant frame and cover settings when switching builds", () => {
    expect(
      nativePropId("fan", {
        ...build,
        fanBuild: "lotus",
        fanFrameColor: "white",
        fanCover: "covered",
      })
    ).toBe("fan:lotus_black_bare");
    expect(
      nativePropId("fan", {
        ...build,
        fanBuild: "fire",
        fanFrameColor: "white",
        fanCover: "covered",
      })
    ).toBe("fan:fire_black_covered");
    expect(nativePropId("staff", { ...build, fanBuild: "day" })).toBe("staff");
    expect(nativePropSelection("staff")).toEqual({
      prop: "staff",
      build: null,
    });
  });

  it("sends unsupported choices for explicit rejection instead of substituting a different mesh", () => {
    expect(nativePropId("fan", { ...build, fanBuild: "sense" })).toBe(
      "fan:sense_black_bare"
    );
    expect(nativePropId("sword", build)).toBe("sword");
    expect(nativePropSelection("fan:unknown_black_bare").build).toBeNull();
  });
});
