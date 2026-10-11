import { describe, expect, test } from "vitest";
import { PoiOptionFilterDecorator } from "#lib/features/levels/poi-lab/services/poi-option-filter-decorator.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// Minimal motion fixtures — only the fields the poi rules read. Default is a
// legal poi move (PRO, 1 turn).
function mkMotion(o: Partial<MotionData> = {}): MotionData {
  return {
    motionType: MotionType.PRO,
    turns: 1,
    rotationDirection: RotationDirection.CLOCKWISE,
    startOrientation: Orientation.OUT,
    color: "blue",
    ...o,
  } as unknown as MotionData;
}

function pic(left?: MotionData, right?: MotionData): PictographData {
  return { motions: { left, right } } as unknown as PictographData;
}

const decorator = new PoiOptionFilterDecorator();
const bothStaff = { leftPropType: PropType.STAFF, rightPropType: PropType.STAFF };
const bluePoi = { leftPropType: PropType.POI, rightPropType: PropType.STAFF };
const bothPoi = { leftPropType: PropType.POI, rightPropType: PropType.POI };

describe("PoiOptionFilterDecorator.filterPoiLegalOptions", () => {
  test("no poi hand → identity (even an illegal-for-poi move survives)", () => {
    const illegal = pic(mkMotion({ motionType: MotionType.ANTI, turns: 0 }));
    const out = decorator.filterPoiLegalOptions([illegal], null, bothStaff);
    expect(out).toHaveLength(1);
    expect(out).toContain(illegal);
  });

  test("blue poi → illegal blue move (ANTI 0 turns) is hidden, legal survives", () => {
    const legal = pic(mkMotion({ motionType: MotionType.PRO, turns: 1 }));
    const illegal = pic(mkMotion({ motionType: MotionType.ANTI, turns: 0 }));
    const out = decorator.filterPoiLegalOptions([legal, illegal], null, bluePoi);
    expect(out).toContain(legal);
    expect(out).not.toContain(illegal);
  });

  test("only the poi hand is constrained (red illegal but red is staff → survives)", () => {
    const opt = pic(
      mkMotion({ motionType: MotionType.PRO, turns: 1 }),
      mkMotion({ color: "red", motionType: MotionType.ANTI, turns: 0 }),
    );
    expect(decorator.filterPoiLegalOptions([opt], null, bluePoi)).toContain(opt);
    // same option with BOTH hands poi → red is now illegal → removed
    expect(decorator.filterPoiLegalOptions([opt], null, bothPoi)).toHaveLength(0);
  });

  test("absent motion imposes no constraint (single-hand step)", () => {
    const opt = pic(undefined, mkMotion({ color: "red", motionType: MotionType.PRO, turns: 1 }));
    // blue is poi but blue motion is absent → not rejected on blue's account
    expect(decorator.filterPoiLegalOptions([opt], null, bluePoi)).toContain(opt);
  });

  test("transition: instant spin reversal against previous beat is hidden", () => {
    const prev = pic(mkMotion({ rotationDirection: RotationDirection.CLOCKWISE }));
    const reversed = pic(mkMotion({ rotationDirection: RotationDirection.COUNTER_CLOCKWISE }));
    const same = pic(mkMotion({ rotationDirection: RotationDirection.CLOCKWISE }));
    const out = decorator.filterPoiLegalOptions([reversed, same], prev, bluePoi);
    expect(out).toContain(same);
    expect(out).not.toContain(reversed);
  });

  test("PRO 0 turns + IN orientation is hidden", () => {
    const illegal = pic(
      mkMotion({ motionType: MotionType.PRO, turns: 0, startOrientation: Orientation.IN }),
    );
    expect(decorator.filterPoiLegalOptions([illegal], null, bluePoi)).toHaveLength(0);
  });

  test("DASH under 0.5 turns is hidden", () => {
    const illegal = pic(mkMotion({ motionType: MotionType.DASH, turns: 0 }));
    expect(decorator.filterPoiLegalOptions([illegal], null, bluePoi)).toHaveLength(0);
  });
});
