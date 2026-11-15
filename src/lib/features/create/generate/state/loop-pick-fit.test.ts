import { describe, expect, it } from "vitest";
import {
  LOOPType,
  Period,
} from "../circular/domain/models/circular-models";
import type { UIGenerationConfig } from "#lib/shared/create/utils/config-mapper.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { resolveLoopPick } from "./loop-pick-fit";

function config(overrides: Partial<UIGenerationConfig>): UIGenerationConfig {
  return {
    mode: "freeform",
    loopEnabled: true,
    length: 14,
    level: 2,
    turnIntensity: 1,
    gridMode: GridMode.DIAMOND,
    propContinuity: "continuous",
    period: Period.HALVED,
    loopType: LOOPType.ROTATED,
    reflectionAxis: "north-south",
    constraintPreset: "mixed",
    handPathMode: "mixed",
    motionTypeFilter: "mixed",
    handRelationship: "free",
    propRelationship: "free",
    matchHandTurns: false,
    durationTemplateId: null,
    spellTargetLength: null,
    ...overrides,
  } as UIGenerationConfig;
}

describe("resolveLoopPick", () => {
  // Austen 2026-11-14: Quartered at a length it can't split used to be shown
  // but never saved, so closing the LOOP panel left it Halved.
  it("keeps a Quartered pick and moves the length to fit it", () => {
    expect(
      resolveLoopPick(
        config({ length: 14 }),
        { loopType: LOOPType.ROTATED, rhythm: { rotationInterval: 4 } },
        64
      )
    ).toMatchObject({
      loopType: LOOPType.ROTATED,
      loopEnabled: true,
      period: Period.QUARTERED,
      length: 16,
    });
  });

  it("bends a leftover Quartered to the length when a component is picked", () => {
    expect(
      resolveLoopPick(
        config({ length: 14, period: Period.QUARTERED, loopEnabled: false }),
        { loopType: LOOPType.ROTATED },
        64
      )
    ).toMatchObject({ period: Period.HALVED, length: 14, loopEnabled: true });
  });

  it("moves the length when no rhythm can hold the picked component", () => {
    expect(
      resolveLoopPick(
        config({ length: 7, loopEnabled: false }),
        { loopType: LOOPType.SWAPPED },
        64
      )
    ).toMatchObject({ loopType: LOOPType.SWAPPED, length: 8 });
  });

  it("drops a leftover Quartered for a LOOP without rotation", () => {
    expect(
      resolveLoopPick(
        config({ length: 7, period: Period.QUARTERED }),
        { loopType: LOOPType.SWAPPED },
        64
      )
    ).toMatchObject({ period: Period.HALVED });
  });

  it("returns null when no length under the cap fits", () => {
    expect(
      resolveLoopPick(
        config({ length: 3 }),
        { loopType: LOOPType.ROTATED, rhythm: { rotationInterval: 4 } },
        3
      )
    ).toBeNull();
  });
});
