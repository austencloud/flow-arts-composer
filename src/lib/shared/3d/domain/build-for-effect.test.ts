import { describe, expect, it } from "vitest";

import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  APPROVED_FAN_BUILDS,
  FAN_BUILDS,
} from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import { buildForEffect } from "./build-for-effect";
import { clampFanBuild } from "./fan-appearance";

const BASE = {
  finish: "day",
  fanBuild: "pictograph",
  fanFrameColor: "black",
  fanCover: "bare",
  triangleGrip: "corner",
} as const;

describe("effects on a fan whose look may not be offered yet", () => {
  it("plays fire and LED on the build in hand when the target is not offered", () => {
    for (const fanBuild of ["pictograph", "sense"] as const) {
      const current = { ...BASE, fanBuild };
      expect(
        buildForEffect(PropType.FAN, "fire", current, APPROVED_FAN_BUILDS)
      ).toBeNull();
      expect(
        buildForEffect(PropType.BIGFAN, "led", current, APPROVED_FAN_BUILDS)
      ).toBeNull();
    }
  });

  it("still equips the fire and moon builds when they are offered", () => {
    expect(buildForEffect(PropType.FAN, "fire", BASE, FAN_BUILDS)).toEqual({
      propBuild: { fanBuild: "fire" },
    });
    expect(buildForEffect(PropType.FAN, "led", BASE, FAN_BUILDS)).toEqual({
      propBuild: { fanBuild: "moon" },
    });
  });

  it("leaves other props alone in either mode", () => {
    expect(
      buildForEffect(PropType.CLUB, "fire", BASE, APPROVED_FAN_BUILDS)
    ).toEqual({ prop: PropType.TORCH });
    expect(buildForEffect(PropType.CLUB, "fire", BASE, FAN_BUILDS)).toEqual({
      prop: PropType.TORCH,
    });
  });
});

describe("clampFanBuild", () => {
  it("masks an unoffered build and keeps offered and review-only ones", () => {
    const fire = { ...BASE, fanBuild: "fire" } as const;
    expect(clampFanBuild(fire, APPROVED_FAN_BUILDS).fanBuild).toBe(
      "pictograph"
    );
    expect(clampFanBuild(fire, FAN_BUILDS)).toBe(fire);
    const sense = { ...BASE, fanBuild: "sense" } as const;
    expect(clampFanBuild(sense, APPROVED_FAN_BUILDS)).toBe(sense);
    const astral = { ...BASE, fanBuild: "astral" } as const;
    expect(clampFanBuild(astral, APPROVED_FAN_BUILDS)).toBe(astral);
  });
});
