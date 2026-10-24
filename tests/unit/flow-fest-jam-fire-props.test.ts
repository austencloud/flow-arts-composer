import { describe, expect, it } from "vitest";
import type { PropBuild } from "@austencloud/scene-3d";
import type { JamPropFamily } from "../../src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout";
import { buildFlowFestJamLayout } from "../../src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout";
import {
  jamFireIds,
  jamPerformersInside,
} from "../../src/lib/features/flow-fest-sim/domain/flow-fest-jam-runtime";
import { PropType } from "../../src/lib/shared/pictograph/prop/domain/enums/prop-type";
import { jamFireProp } from "../../src/routes/test/flow-fest-jam/flow-fest-jam-people";

const DAY_FAN: PropBuild = {
  finish: "fire",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "covered",
  triangleGrip: "corner",
};

describe("jam fire props", () => {
  it("puts every burning performer on a fire model, never a plain prop", () => {
    const expected: Record<JamPropFamily, PropType> = {
      staff: PropType.FIRE_DOUBLE_STAFF,
      "double-staff": PropType.FIRE_DOUBLE_STAFF,
      "dragon-staff": PropType.FIRE_DOUBLE_STAFF,
      clubs: PropType.TORCH,
      fans: PropType.FAN,
      hoop: PropType.BIGHOOP,
      poi: PropType.POI,
      "rope-dart": PropType.POI,
    };
    for (const [family, propType] of Object.entries(expected) as [
      JamPropFamily,
      PropType,
    ][]) {
      expect(jamFireProp(family, false, DAY_FAN).propType, family).toBe(
        propType
      );
    }
    expect(jamFireProp("staff", true, DAY_FAN).propType).toBe(PropType.TORCH);
    expect(jamFireProp("fans", false, DAY_FAN).propBuild).toEqual({
      fanBuild: "fire",
      fanCover: "bare",
    });
    expect(jamFireProp("fans", false, DAY_FAN).burns).toBe(true);
    expect(jamFireProp("hoop", false, DAY_FAN).burns).toBe(false);
  });

  it("lights no one whose prop cannot burn", () => {
    const layout = buildFlowFestJamLayout();
    const all = jamPerformersInside(layout, 1);
    const lit = jamFireIds(
      all,
      1,
      all.length,
      (p) => jamFireProp(p.prop, p.juggler, DAY_FAN).burns
    );
    expect(lit.size).toBeGreaterThan(0);
    for (const id of lit)
      expect(
        all.find((p) => p.id === id)!.prop === "hoop" &&
          !all.find((p) => p.id === id)!.juggler
      ).toBe(false);
  });
});
