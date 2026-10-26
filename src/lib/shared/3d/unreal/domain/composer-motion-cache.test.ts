import { describe, expect, it } from "vitest";
import {
  ComposerMotionCache,
  composerCaptureStaffLengthCm,
  composerMotionSignature,
  getComposerMotionCache,
} from "./composer-motion-cache";
import {
  DEFAULT_PERFORMER_HAND_DISTANCE,
  fixedHandDistance,
} from "../../domain/performer-hand-distance";

const score = {
  steps: [{ stepNumber: 1, duration: 1, motions: { left: "a", right: "b" } }],
};

describe("Composer motion cache", () => {
  it("keys captured motion by the staff length the Web performer actually uses", () => {
    const globalCm = 86.36;
    const defaultLength = composerCaptureStaffLengthCm(null, globalCm);
    const overrideLength = composerCaptureStaffLengthCm(120, globalCm);
    expect(defaultLength).toBe(globalCm);
    expect(overrideLength).toBe(120);
    expect(
      composerMotionSignature(score, { staffLengthCm: defaultLength })
    ).not.toBe(
      composerMotionSignature(score, { staffLengthCm: overrideLength })
    );
    expect(
      composerMotionSignature(score, {
        staffLengthCm: composerCaptureStaffLengthCm(null, 100),
      })
    ).not.toBe(
      composerMotionSignature(score, { staffLengthCm: defaultLength })
    );
  });

  it("separates Composer viewer reach inputs from standalone measured capture", () => {
    const options = { character: "x-bot", staffLengthCm: 86.36 };
    expect(
      composerMotionSignature(score, {
        ...options,
        captureReachInputPolicy: "viewer",
      })
    ).not.toBe(composerMotionSignature(score, options));
  });

  it("keys the actual hand orbit, including default-equivalent and scaled distances", () => {
    const base = { character: "ch01", captureReachInputPolicy: "viewer" };
    const defaultKey = composerMotionSignature(score, {
      ...base,
      handDistance: DEFAULT_PERFORMER_HAND_DISTANCE,
    });
    const equivalentKey = composerMotionSignature(score, {
      ...base,
      handDistance: {
        left: fixedHandDistance(0.52),
        right: fixedHandDistance(0.52),
      },
    });
    const joinedKey = composerMotionSignature(score, {
      ...base,
      handDistance: {
        left: fixedHandDistance(0.35),
        right: fixedHandDistance(0.35),
      },
    });
    expect(equivalentKey).toBe(defaultKey);
    expect(joinedKey).not.toBe(defaultKey);
  });

  it("reuses the same capture across performers and option insertion order", () => {
    const first = composerMotionSignature(score, {
      character: "x-bot",
      propType: "staff",
      effectId: "fire",
      beatPlaneOverrides: new Map([
        [2, { left: "wheel" }],
        [1, { right: "floor" }],
      ]),
    });
    const second = composerMotionSignature(
      { ...score },
      {
        beatPlaneOverrides: new Map([
          [1, { right: "floor" }],
          [2, { left: "wheel" }],
        ]),
        effectId: "fire",
        propType: "staff",
        character: "x-bot",
      }
    );
    expect(second).toBe(first);
    expect(
      composerMotionSignature(score, {
        character: "x-bot",
        propType: "staff",
        effectId: "led",
        beatPlaneOverrides: new Map([
          [1, { right: "floor" }],
          [2, { left: "wheel" }],
        ]),
      })
    ).not.toBe(first);
    expect(
      composerMotionSignature(
        { steps: [{ ...score.steps[0], duration: 2 }] },
        {
          character: "x-bot",
          propType: "staff",
          effectId: "fire",
          beatPlaneOverrides: new Map([
            [1, { right: "floor" }],
            [2, { left: "wheel" }],
          ]),
        }
      )
    ).not.toBe(first);
  });

  it("keeps Web poses paired with native bundles through remounts and eviction", () => {
    const shared = getComposerMotionCache();
    const sharedBundle = { frames: [42] };
    shared.set("page-lifetime-test", sharedBundle);
    expect(getComposerMotionCache().get("page-lifetime-test")).toBe(
      sharedBundle
    );
    const cache = new ComposerMotionCache(2);
    const a = { frames: [1] };
    const pose = { frames: [], durationSeconds: 4, loop: true };
    cache.set("a", a, pose);
    cache.set("b", { frames: [2] }, { ...pose });
    expect(cache.getPose("a")).toBe(pose);
    cache.set("c", { frames: [3] });
    expect(cache.has("a")).toBe(true);
    expect(cache.get("a")).toBe(a);
    expect(cache.has("b")).toBe(false);
    expect(cache.getPose("b")).toBeUndefined();
    expect(cache.has("c")).toBe(true);
    cache.set("a", { frames: [4] });
    expect(cache.getPose("a")).toBeUndefined();
  });

  it("plays a clip restored from the device without offering it as native motion", () => {
    const cache = new ComposerMotionCache(2);
    const pose = { frames: [], durationSeconds: 4, loop: true };
    cache.setPose("restored", pose);
    expect(cache.getPose("restored")).toBe(pose);
    expect(cache.has("restored")).toBe(false);
    expect(cache.get("restored")).toBeUndefined();

    // A later real capture fills in the bundle, and restoring the pose again
    // must not throw that bundle away.
    const bundle = { frames: [1] };
    cache.set("restored", bundle, pose);
    cache.setPose("restored", { ...pose });
    expect(cache.get("restored")).toBe(bundle);

    // Pose-only entries take an LRU slot like any other.
    cache.setPose("b", pose);
    cache.setPose("c", pose);
    expect(cache.getPose("restored")).toBeUndefined();
    expect(cache.has("restored")).toBe(false);
  });
});
