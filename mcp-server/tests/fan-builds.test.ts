import { describe, expect, it } from "vitest";
import {
  APPROVED_FAN_BUILDS,
  defaultFanBuild,
  type FanBuild,
} from "../src/core/fan-builds.js";
import {
  getStandaloneRenderer,
  resolveFanAppearance,
  type PictographInput,
} from "../src/core/standalone-renderer.js";

const input: PictographInput = {
  letter: "A",
  gridMode: "diamond",
  leftMotion: {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    hand: "left",
    turns: 1,
  },
  rightMotion: {
    motionType: "anti",
    rotationDirection: "ccw",
    startLocation: "s",
    endLocation: "w",
    startOrientation: "in",
    hand: "right",
    turns: 1,
  },
};

const renderer = getStandaloneRenderer();
const draw = (build?: FanBuild) =>
  renderer.renderToSvg(input, {
    leftPropType: "fan",
    rightPropType: "staff",
    fanAppearance: build
      ? { build, frameColor: "black", cover: "bare" }
      : undefined,
  });

describe("fan looks waiting on their maker", () => {
  it("draws a waiting look as the pictograph fan", async () => {
    const pictograph = await draw("pictograph");
    for (const waiting of ["fire", "lotus", "day", "flat-grip", "moon", "star"] as const) {
      expect(await draw(waiting)).toBe(pictograph);
    }
    expect(await draw()).toBe(pictograph);
  });

  it("still draws an approved look as asked", async () => {
    expect(APPROVED_FAN_BUILDS).toContain("sense");
    expect(await draw("sense")).not.toBe(await draw("pictograph"));
  });

  it("makes fire the default once fire is approved, and draws it", () => {
    const approved: readonly FanBuild[] = ["pictograph", "sense", "fire"];
    expect(defaultFanBuild(approved)).toBe("fire");
    expect(resolveFanAppearance(undefined, approved).build).toBe("fire");
    expect(resolveFanAppearance({ build: "lotus" }, approved).build).toBe("fire");
    expect(resolveFanAppearance({ build: "fire" }, approved).build).toBe("fire");
  });
});
