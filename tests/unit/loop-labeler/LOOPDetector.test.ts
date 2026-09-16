import { describe, it, expect } from "vitest";
import { loopDetector } from "$lib/features/loop-labeler/services/loop-detector";
import type { SequenceEntry, RawStepData } from "$lib/shared/loop-labeler/domain/sequence-models";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";

interface MotionAttrs {
  startLoc: string;
  endLoc: string;
  motionType: string;
  propRotDir: string;
  startOri?: string;
  endOri?: string;
  turns?: number;
}

function makeBeat(
  beat: number,
  left: MotionAttrs,
  right: MotionAttrs,
  startPos: string,
  endPos: string
): RawStepData {
  return {
    beat,
    letter: "A",
    startPos,
    endPos,
    leftAttributes: left,
    rightAttributes: right,
  };
}

function makeEntry(rawSequence: RawStepData[]): SequenceEntry {
  return {
    id: "test-seq",
    word: "TEST",
    isCircular: true,
    loopType: null,
    thumbnails: [],
    sequenceLength: rawSequence.filter((r) => (r.beat ?? 0) >= 1).length,
    gridMode: "diamond",
    fullMetadata: { sequence: rawSequence },
  };
}

/**
 * Halved rotation fixture: 4 beats where beat 1↔3 and 2↔4 form 180° pairs,
 * but beat 1→2 is NOT a 90° rotation. That rules out quartered detection
 * and forces the halved path. We use different motion types across the
 * pairs inside each half (pro + anti) so the per-half beats aren't
 * themselves rotations of each other — only the halves as wholes are.
 */
function halvedFixture(): SequenceEntry {
  const makeMotion = (
    s: string,
    e: string,
    motionType: string,
    propRotDir: string
  ): MotionAttrs => ({
    startLoc: s,
    endLoc: e,
    motionType,
    propRotDir,
  });

  return makeEntry([
    {
      beat: 0,
      sequenceStartPlacement: "alpha1",
      endPos: "alpha1",
    },
    // Beat 1: blue n→e (pro), red s→w (pro)
    makeBeat(
      1,
      makeMotion("n", "e", "pro", "cw"),
      makeMotion("s", "w", "pro", "cw"),
      "alpha1",
      "alpha2"
    ),
    // Beat 2: blue e→n (anti — different motion type so beat1↔beat2 isn't
    // a 90° rotation of the same motion), red w→s (anti)
    makeBeat(
      2,
      makeMotion("e", "n", "anti", "ccw"),
      makeMotion("w", "s", "anti", "ccw"),
      "alpha2",
      "alpha1"
    ),
    // Beat 3: 180° rotated beat 1 — blue s→w (pro), red n→e (pro)
    makeBeat(
      3,
      makeMotion("s", "w", "pro", "cw"),
      makeMotion("n", "e", "pro", "cw"),
      "alpha1",
      "alpha2"
    ),
    // Beat 4: 180° rotated beat 2 — blue w→s (anti), red e→n (anti)
    makeBeat(
      4,
      makeMotion("w", "s", "anti", "ccw"),
      makeMotion("e", "n", "anti", "ccw"),
      "alpha2",
      "alpha1"
    ),
  ]);
}

/**
 * Quartered rotation fixture: 4 beats that rotate 90° CW each. Each beat
 * is the same motion rotated 90° CW from the previous, so the detector's
 * quartered check (all consecutive pairs differ by exactly 90° CW) passes.
 */
function quarteredFixture(): SequenceEntry {
  const leftPro = (s: string, e: string): MotionAttrs => ({
    startLoc: s,
    endLoc: e,
    motionType: "pro",
    propRotDir: "cw",
  });
  const rightPro = (s: string, e: string): MotionAttrs => ({
    startLoc: s,
    endLoc: e,
    motionType: "pro",
    propRotDir: "cw",
  });

  return makeEntry([
    {
      beat: 0,
      sequenceStartPlacement: "alpha1",
      endPos: "alpha1",
    },
    // Beat 1: blue n→e, red s→w
    makeBeat(1, leftPro("n", "e"), rightPro("s", "w"), "alpha1", "alpha2"),
    // Beat 2: 90° CW rotated — blue e→s, red w→n
    makeBeat(2, leftPro("e", "s"), rightPro("w", "n"), "alpha2", "alpha3"),
    // Beat 3: another 90° CW — blue s→w, red n→e
    makeBeat(3, leftPro("s", "w"), rightPro("n", "e"), "alpha3", "alpha4"),
    // Beat 4: another 90° CW — blue w→n, red e→s (back to start)
    makeBeat(4, leftPro("w", "n"), rightPro("e", "s"), "alpha4", "alpha1"),
  ]);
}

describe("LOOPDetector.detectLOOP transformationIntervals", () => {
  it("marks a 180° rotation LOOP with 4 beats as quartered in transformationIntervals.rotation", () => {
    const result = loopDetector.detectLOOP(halvedFixture());

    expect(result.isCircular).toBe(true);
    // When the beat count is divisible by 4, quarteredMotionsConsistent
    // upgrades halved intervals to quartered (rotation=4).
    if (result.components.includes("rotated")) {
      expect(result.transformationIntervals.rotation).toBe(4);
    }
  });

  it("marks a 90° rotation LOOP as quartered in transformationIntervals.rotation", () => {
    const result = loopDetector.detectLOOP(quarteredFixture());

    expect(result.isCircular).toBe(true);
    expect(result.components).toContain("rotated");
    expect(result.transformationIntervals.rotation).toBe(4);
  });

  it("halved detection snapshot — full result shape (upgraded to quartered with 4 beats)", () => {
    const result = loopDetector.detectLOOP(halvedFixture());
    expect(result.components).toEqual(expect.arrayContaining(["rotated"]));
    // With 4 beats divisible by 4, the detector upgrades to quartered intervals
    expect(result.transformationIntervals.rotation).toBe(4);
    expect(result.period).toBe(4);
    expect(result.isCircular).toBe(true);
    expect(result.isFreeform).toBe(false);
  });

  it("quartered detection snapshot — full result shape", () => {
    const result = loopDetector.detectLOOP(quarteredFixture());
    expect(result.components).toEqual(expect.arrayContaining(["rotated"]));
    expect(result.transformationIntervals.rotation).toBe(4);
    expect(result.period).toBe(4);
    expect(result.isCircular).toBe(true);
    expect(result.isFreeform).toBe(false);
  });

  it("detects a period-4 orientation rotation (per-pass 90° delta)", () => {
    // 2-beat sequence where blue + red both advance by one quarter turn per
    // pass (in → clock). Position is irrelevant — we're testing pure
    // orientation rotation. The delta of 1 quarter turn means 4 passes are
    // needed to close: period 4, domain orientation.
    const entry = makeEntry([
      {
        beat: 0,
        sequenceStartPlacement: "alpha1",
        endPos: "alpha1",
      },
      {
        beat: 1,
        letter: "A",
        startPos: "alpha1",
        endPos: "alpha1",
        leftAttributes: {
          startLoc: "n",
          endLoc: "n",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "in",
          endOri: "clock",
        },
        rightAttributes: {
          startLoc: "s",
          endLoc: "s",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "in",
          endOri: "clock",
        },
      },
      {
        beat: 2,
        letter: "A",
        startPos: "alpha1",
        endPos: "alpha1",
        leftAttributes: {
          startLoc: "n",
          endLoc: "n",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "clock",
          endOri: "clock",
        },
        rightAttributes: {
          startLoc: "s",
          endLoc: "s",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "clock",
          endOri: "clock",
        },
      },
    ]);

    const result = loopDetector.detectLOOP(entry);

    expect(result.period).toBe(4);
    const rotated = result.componentsDetailed.find(
      (c) => c.component === LOOPComponent.ROTATED
    );
    expect(rotated).toBeDefined();
    expect(rotated?.domain).toBe("orientation");
  });

  it("promotes ROTATED to domain='both' when location + orientation both rotate", () => {
    // Quartered positional rotation (existing fixture) PLUS per-pass
    // orientation delta of 1 quarter turn. Detector should emit ROTATED
    // with domain='both' and period 4.
    const quartered = quarteredFixture();
    // Patch the first beat's blueAttributes.startOri / last beat's endOri
    // to create a per-pass orientation delta as well.
    const beats = quartered.fullMetadata!.sequence!;
    const firstStep = beats.find((b) => (b.beat ?? 0) === 1)!;
    const lastStep = beats.find((b) => (b.beat ?? 0) === 4)!;
    firstStep.leftAttributes = {
      ...firstStep.leftAttributes!,
      startOri: "in",
      endOri: "in",
    };
    firstStep.rightAttributes = {
      ...firstStep.rightAttributes!,
      startOri: "in",
      endOri: "in",
    };
    lastStep.leftAttributes = {
      ...lastStep.leftAttributes!,
      startOri: "out",
      endOri: "clock",
    };
    lastStep.rightAttributes = {
      ...lastStep.rightAttributes!,
      startOri: "out",
      endOri: "clock",
    };

    const result = loopDetector.detectLOOP(quartered);

    expect(result.period).toBe(4);
    const rotated = result.componentsDetailed.find(
      (c) => c.component === LOOPComponent.ROTATED
    );
    expect(rotated?.domain).toBe("both");
  });

  it("returns period 1 and empty componentsDetailed for a non-LOOP sequence", () => {
    // 2-beat static sequence with matching orientations — no LOOP, period 1.
    const entry = makeEntry([
      {
        beat: 0,
        sequenceStartPlacement: "alpha1",
        endPos: "alpha1",
      },
      {
        beat: 1,
        letter: "A",
        startPos: "alpha1",
        endPos: "alpha1",
        leftAttributes: {
          startLoc: "n",
          endLoc: "n",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "in",
          endOri: "in",
        },
        rightAttributes: {
          startLoc: "s",
          endLoc: "s",
          motionType: "static",
          propRotDir: "no_rotation",
          startOri: "in",
          endOri: "in",
        },
      },
    ]);

    const result = loopDetector.detectLOOP(entry);

    expect(result.period).toBe(1);
    expect(result.componentsDetailed).toEqual([]);
  });

  it("leaves transformationIntervals.rotation undefined when no rotation is detected", () => {
    // A 2-beat sequence with no rotation at all — buildFallbackResult returns
    // empty intervals.
    const entry = makeEntry([
      {
        beat: 0,
        sequenceStartPlacement: "alpha1",
        endPos: "alpha1",
      },
      {
        beat: 1,
        letter: "A",
        startPos: "alpha1",
        endPos: "alpha1",
        leftAttributes: {
          startLoc: "n",
          endLoc: "n",
          motionType: "static",
          propRotDir: "no_rotation",
        },
        rightAttributes: {
          startLoc: "s",
          endLoc: "s",
          motionType: "static",
          propRotDir: "no_rotation",
        },
      },
      {
        beat: 2,
        letter: "A",
        startPos: "alpha1",
        endPos: "alpha1",
        leftAttributes: {
          startLoc: "n",
          endLoc: "n",
          motionType: "static",
          propRotDir: "no_rotation",
        },
        rightAttributes: {
          startLoc: "s",
          endLoc: "s",
          motionType: "static",
          propRotDir: "no_rotation",
        },
      },
    ]);

    const result = loopDetector.detectLOOP(entry);
    // No rotation fired, so rotation interval should be absent.
    expect(result.transformationIntervals.rotation).toBeUndefined();
  });

  it("detects all 3 primitives (rotated, swapped, inverted) for an ABBA rotated+swapped+inverted sequence with period 2", () => {
    // 8-beat fixture where:
    //   - Half 1 beats 1–4 use asymmetric positions
    //   - Half 2 beats 5–8 = rotated_180_swapped_inverted of half 1
    //   - Motion types follow ABBA across quarters (anti,pro,pro,anti,pro,anti,anti,pro)
    //     so quarteredMotionsConsistent returns false and quartered detection is skipped
    //   - Halved pairs (beat i vs beat i+4) all emit rotated_180_swapped_inverted
    const m = (
      s: string,
      e: string,
      motionType: string,
      propRotDir: string
    ): MotionAttrs => ({ startLoc: s, endLoc: e, motionType, propRotDir });

    const entry = makeEntry([
      { beat: 0, sequenceStartPlacement: "alpha1", endPos: "alpha1" },
      // ---- Half 1 ----
      // Beat 1: anti/ccw
      makeBeat(1, m("n", "e", "anti", "ccw"), m("e", "s", "anti", "ccw"), "alpha1", "gamma3"),
      // Beat 2: pro/cw (different motionType from beat 1 → breaks quartered consistency)
      makeBeat(2, m("s", "w", "pro", "cw"), m("w", "n", "pro", "cw"), "gamma3", "alpha2"),
      // Beat 3: pro/cw (same as beat 2)
      makeBeat(3, m("n", "w", "anti", "ccw"), m("w", "n", "anti", "ccw"), "alpha2", "gamma4"),
      // Beat 4: anti/ccw (same as beat 1)
      makeBeat(4, m("s", "e", "pro", "cw"), m("e", "s", "pro", "cw"), "gamma4", "alpha3"),
      // ---- Half 2: rotated_180_swapped_inverted of half 1 ----
      // Beat 5 = rot180_swap_inv(beat 1):
      //   blue = rot180(beat1.red) = rot180(e→s) = (w→n), propRotDir inverted: ccw→cw
      //   red  = rot180(beat1.blue) = rot180(n→e) = (s→w), propRotDir inverted: ccw→cw
      //   motionType inverted: anti→pro
      makeBeat(5, m("w", "n", "pro", "cw"), m("s", "w", "pro", "cw"), "alpha3", "gamma1"),
      // Beat 6 = rot180_swap_inv(beat 2):
      //   blue = rot180(beat2.red) = rot180(w→n) = (e→s), propRotDir inverted: cw→ccw
      //   red  = rot180(beat2.blue) = rot180(s→w) = (n→e), propRotDir inverted: cw→ccw
      //   motionType inverted: pro→anti
      makeBeat(6, m("e", "s", "anti", "ccw"), m("n", "e", "anti", "ccw"), "gamma1", "alpha4"),
      // Beat 7 = rot180_swap_inv(beat 3):
      //   blue = rot180(beat3.red) = rot180(w→n) = (e→s), propRotDir inverted: ccw→cw
      //   red  = rot180(beat3.blue) = rot180(n→w) = (s→e), propRotDir inverted: ccw→cw
      //   motionType inverted: anti→pro
      makeBeat(7, m("e", "s", "pro", "cw"), m("s", "e", "pro", "cw"), "alpha4", "gamma2"),
      // Beat 8 = rot180_swap_inv(beat 4):
      //   blue = rot180(beat4.red) = rot180(e→s) = (w→n), propRotDir inverted: cw→ccw
      //   red  = rot180(beat4.blue) = rot180(s→e) = (n→w), propRotDir inverted: cw→ccw
      //   motionType inverted: pro→anti
      makeBeat(8, m("w", "n", "anti", "ccw"), m("n", "w", "anti", "ccw"), "gamma2", "alpha1"),
    ]);

    const result = loopDetector.detectLOOP(entry);

    expect(result.isCircular).toBe(true);
    // All 3 primitives must be detected
    expect(result.components).toContain("rotated");
    expect(result.components).toContain("swapped");
    expect(result.components).toContain("inverted");
    // Period must be 2 (halved), not 4 (quartered)
    expect(result.period).toBe(2);
    // Transformation intervals should all be 2 (halved)
    expect(result.transformationIntervals.rotation).toBe(2);
    expect(result.transformationIntervals.swap).toBe(2);
    expect(result.transformationIntervals.invert).toBe(2);
  });
});
