import { describe, expect, it } from "vitest";
import { PoseGlide, blendPropState, type PoseGlideProps } from "./pose-glide";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

const DEG = Math.PI / 180;

function pose(center: number, staff: number): PropState {
  return { centerPathAngle: center * DEG, staffRotationAngle: staff * DEG };
}

function frame(left: PropState | null, right: PropState | null = null) {
  return { leftProp: left, rightProp: right } satisfies PoseGlideProps;
}

function degrees(radians: number): number {
  return Math.round(((radians / DEG) % 360) + 360) % 360;
}

describe("blendPropState", () => {
  it("turns the short way around the grid and the staff", () => {
    const out = blendPropState(pose(350, 340), pose(10, 20), 0.5, pose(0, 0));
    expect(degrees(out.centerPathAngle)).toBe(0);
    expect(degrees(out.staffRotationAngle)).toBe(0);
    expect(out.x).toBeUndefined();
  });

  it("moves in a straight line when either end is off the hand points", () => {
    const dash: PropState = { ...pose(0, 0), x: 0, y: 0 };
    const out = blendPropState(pose(0, 0), dash, 0.5, pose(0, 0));
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0);
  });
});

describe("PoseGlide", () => {
  it("blends from the drawn pose to the live one, then lets go", () => {
    const glide = new PoseGlide();
    glide.apply(frame(pose(0, 0)), 0, true);
    glide.start(100, 200);

    const early = frame(pose(90, 90));
    expect(glide.apply(early, 150, true)).toBe(true);
    const mid = degrees(early.leftProp!.centerPathAngle);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(90);

    const late = frame(pose(90, 90));
    expect(glide.apply(late, 300, true)).toBe(false);
    expect(degrees(late.leftProp!.centerPathAngle)).toBe(90);
    expect(glide.active).toBe(false);
  });

  it("snaps when nothing was drawn or motion is reduced", () => {
    const fresh = new PoseGlide();
    fresh.start(0, 200);
    expect(fresh.active).toBe(false);

    const reduced = new PoseGlide();
    reduced.apply(frame(pose(0, 0)), 0, true);
    reduced.start(0, 0);
    expect(reduced.active).toBe(false);
  });

  // Between two loads the player shows a blank pose with no sequence. The
  // glide has to start from the pose the visitor saw, not that one.
  it("starts from the last pose drawn with a sequence", () => {
    const glide = new PoseGlide();
    glide.apply(frame(pose(45, 0)), 0, true);
    glide.apply(frame(pose(0, 0)), 10, false);
    glide.start(20, 200);

    const first = frame(pose(135, 0));
    glide.apply(first, 20, true);
    expect(degrees(first.leftProp!.centerPathAngle)).toBe(45);
  });

  it("restarts a running glide from where the props are", () => {
    const glide = new PoseGlide();
    glide.apply(frame(pose(0, 0)), 0, true);
    glide.start(0, 200);
    const shown = frame(pose(90, 0));
    glide.apply(shown, 100, true);
    const shownAngle = degrees(shown.leftProp!.centerPathAngle);

    glide.start(100, 200);
    const next = frame(pose(180, 0));
    glide.apply(next, 100, true);
    expect(degrees(next.leftProp!.centerPathAngle)).toBe(shownAngle);
  });
});
