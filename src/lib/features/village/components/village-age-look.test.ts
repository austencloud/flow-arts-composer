import { describe, expect, it } from "vitest";
import { AGE_LOOK, GROW_SECONDS, easeToward } from "./village-age-look";

describe("village age look", () => {
  it("grows a youth to adult size over GROW_SECONDS, then holds", () => {
    const span = AGE_LOOK.adult.scale - AGE_LOOK.youth.scale;
    let scale = AGE_LOOK.youth.scale;
    const frame = 1 / 60;
    let frames = 0;
    while (scale !== AGE_LOOK.adult.scale && frames < 1000) {
      scale = easeToward(
        scale,
        AGE_LOOK.adult.scale,
        span,
        GROW_SECONDS,
        frame
      );
      frames++;
    }
    expect(frames * frame).toBeCloseTo(GROW_SECONDS, 1);
    expect(
      easeToward(scale, AGE_LOOK.adult.scale, span, GROW_SECONDS, frame)
    ).toBe(1);
  });

  it("only elders stoop", () => {
    expect(AGE_LOOK.youth.stoopRadians).toBe(0);
    expect(AGE_LOOK.adult.stoopRadians).toBe(0);
    expect(AGE_LOOK.elder.stoopRadians).toBeGreaterThan(0);
  });
});
