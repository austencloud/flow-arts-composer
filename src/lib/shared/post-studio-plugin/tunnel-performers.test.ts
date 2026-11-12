import { describe, expect, it } from "vitest";
import type { PostProject } from "@austencloud/video-editor/core";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
import {
  FRONT_PROP_COLORS,
  castPartDraw,
  followerPropColors,
  postAnimationPropType,
} from "./tunnel-performers";

function projectOf(items: Record<string, unknown>[]): PostProject {
  return { tracks: [{ id: "track-1", items }] } as unknown as PostProject;
}

describe("postAnimationPropType", () => {
  it("takes the tunnel clip's prop over another clip's", () => {
    const project = projectOf([
      { id: "a", kind: "animation", animationAppearance: { propType: PropType.FAN } },
      {
        id: "b",
        kind: "animation",
        followers: [{ beatsBehind: 0 }],
        animationAppearance: { propType: PropType.BIGSTAFF },
      },
    ]);
    expect(postAnimationPropType(project)).toBe(PropType.BIGSTAFF);
  });

  it("falls back to any clip's prop, then to none", () => {
    expect(
      postAnimationPropType(
        projectOf([
          { id: "b", kind: "animation", followers: [{ beatsBehind: 0 }] },
          { id: "a", kind: "animation", animationAppearance: { propType: PropType.CLUB } },
        ])
      )
    ).toBe(PropType.CLUB);
    expect(
      postAnimationPropType(projectOf([{ id: "v", kind: "video" }]))
    ).toBeUndefined();
  });
});

describe("tunnel colors", () => {
  it("keeps the front performer red and blue, apart from those behind", () => {
    expect(FRONT_PROP_COLORS).toEqual({
      left: getMotionColor(HandSide.LEFT, "dark"),
      right: getMotionColor(HandSide.RIGHT, "dark"),
    });
    expect(followerPropColors(0, 1)).not.toEqual(FRONT_PROP_COLORS);
  });
});

describe("castPartDraw", () => {
  const both = { left: true, right: true };
  const leftOnly = { left: true, right: false };
  const rightOnly = { left: false, right: true };

  it("draws everyone without a part", () => {
    expect(castPartDraw(undefined, 2)).toEqual({
      primary: 0,
      primaryHands: both,
      followers: [both, both],
    });
  });

  it("draws one hand of everyone, passing every follower's layer", () => {
    expect(castPartDraw({ hand: "left" }, 2)).toEqual({
      primary: 0,
      primaryHands: leftOnly,
      followers: [leftOnly, leftOnly],
    });
  });

  it("draws the front alone, with no follower layers", () => {
    expect(castPartDraw({ performer: 0 }, 1)).toEqual({
      primary: 0,
      primaryHands: both,
      followers: [],
    });
  });

  it("draws one follower as the canvas's own pair", () => {
    expect(castPartDraw({ performer: 1 }, 1)).toEqual({
      primary: 1,
      primaryHands: both,
      followers: [],
    });
    expect(castPartDraw({ performer: 1, hand: "right" }, 1)).toEqual({
      primary: 1,
      primaryHands: rightOnly,
      followers: [],
    });
  });

  it("draws only the second follower of a two-follower tunnel", () => {
    expect(castPartDraw({ performer: 2 }, 2)).toEqual({
      primary: 2,
      primaryHands: both,
      followers: [],
    });
  });

  it("draws nobody for a performer past the last follower", () => {
    expect(castPartDraw({ performer: 3 }, 1)).toEqual({
      primary: null,
      primaryHands: both,
      followers: [],
    });
  });
});
