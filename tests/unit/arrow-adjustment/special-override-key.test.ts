import { describe, it, expect, vi } from "vitest";

// Mock the firebase chain before importing anything that pulls SpecialArrowPlacement.
// computeSpecialOverrideKey → generateSpecialOverrideKey (SpecialArrowPlacement) →
// $lib/shared/firestore → $lib/shared/auth → firebase/auth → protobufjs at load time.
vi.mock("#lib/shared/auth/state/authState.svelte", () => ({
  authState: { effectiveUserId: null },
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
}));

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { computeSpecialOverrideKey } from "#lib/shared/pictograph/arrow/positioning/special-override/services/special-override-key.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

// Representative pictograph: letter P, Diamond display, both Pro motions, both staff.
// Display orientation is not persisted as placement ownership.
function makePictograph(): PictographData {
  return {
    letter: "P",
    motions: {
      left: {
        motionType: "pro",
        startOrientation: "in",
        turns: 0,
        propType: "staff",
        color: "blue",
        gridMode: GridMode.DIAMOND,
      },
      right: {
        motionType: "pro",
        startOrientation: "in",
        turns: 0,
        propType: "staff",
        color: "red",
        gridMode: GridMode.DIAMOND,
      },
    },
  } as unknown as PictographData;
}

function makeRedMotion(propType?: string): MotionData {
  return {
    motionType: "pro",
    startOrientation: "in",
    turns: 0,
    propType,
    color: "red",
    gridMode: GridMode.DIAMOND,
  } as unknown as MotionData;
}

describe("computeSpecialOverrideKey", () => {
  it("returns a 7-segment key ending in the prop type", () => {
    const pd = makePictograph();
    const key = computeSpecialOverrideKey(pd, makeRedMotion(undefined), "red");
    expect(key.split("|")).toHaveLength(7);
    // propType undefined → defaults to "staff".
    expect(key.endsWith("|staff")).toBe(true);
    expect(key).toBe("canonical|from_layer1|P|0,0|pro|red|staff");
  });

  it("keeps canonical ownership while deriving the prop-specific orientation bucket", () => {
    const pd = makePictograph();
    const staffKey = computeSpecialOverrideKey(
      pd,
      makeRedMotion(undefined),
      "red"
    );
    const fanPictograph = {
      ...pd,
      motions: {
        ...pd.motions,
        right: { ...pd.motions.right!, propType: "fan" },
      },
    };
    const fanKey = computeSpecialOverrideKey(
      fanPictograph,
      makeRedMotion("fan"),
      "red"
    );

    const staffSegs = staffKey.split("|");
    const fanSegs = fanKey.split("|");

    expect(staffSegs[0]).toBe("canonical");
    expect(fanSegs[0]).toBe("canonical");
    expect(staffSegs[1]).toBe("from_layer1");
    expect(fanSegs[1]).toBe("in_in");
    expect(fanSegs.slice(2, 6)).toEqual(staffSegs.slice(2, 6));
    expect(staffSegs[6]).toBe("staff");
    expect(fanSegs[6]).toBe("fan");
  });
});
