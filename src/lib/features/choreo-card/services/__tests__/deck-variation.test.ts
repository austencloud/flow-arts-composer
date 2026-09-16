import { describe, it, expect } from "vitest";
import {
  rollVariation,
  applyVariationDescriptor,
  applyVariation,
  resolveDeckSequences,
  parseTurnUnit,
  DEFAULT_VARIATION_CONFIG,
  type Rng,
} from "../deck-variation";
import type { VariationConfig } from "../deck-variation";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

/** Deterministic rng that yields the given values in order, then 0. */
function seededRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++] ?? 0;
}

const TURNS_ONLY: VariationConfig = {
  reversalFrequency: 0,
  enabledReversals: [],
  turnFrequency: 1,
  enabledTurnPatterns: ["hold-1"],
};

function twoStepSeq(): SequenceData {
  const motion = () =>
    createMotionData({
      motionType: "pro" as const,
      rotationDirection: "cw" as const,
      startLocation: "n" as const,
      endLocation: "e" as const,
      turns: 0,
      startOrientation: "in" as const,
      endOrientation: "in" as const,
    });
  return createSequenceData({
    id: "TEST",
    word: "AB",
    steps: [
      {
        id: "s1",
        stepNumber: 1, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        letter: null, startPlacement: null, endPlacement: null,
        motions: { left: motion(), right: motion() },
      },
      {
        id: "s2",
        stepNumber: 2, duration: 1, leftReversal: false, rightReversal: false, isBlank: false,
        letter: null, startPlacement: null, endPlacement: null,
        motions: { left: motion(), right: motion() },
      },
    ],
  });
}

describe("rollVariation", () => {
  it("returns null when nothing rolls", () => {
    const cfg: VariationConfig = {
      reversalFrequency: 0, enabledReversals: [],
      turnFrequency: 0, enabledTurnPatterns: [],
    };
    expect(rollVariation(4, cfg, seededRng([0.9, 0.9]))).toBeNull();
  });

  it("rolls a turn pattern when the turn gate passes", () => {
    // rng #1 = turn gate (0.0 < 1 → pass); rng #2 = pickTurnPattern index (→ 0)
    const v = rollVariation(4, TURNS_ONLY, seededRng([0.0, 0.0]));
    expect(v).not.toBeNull();
    expect(v!.turnPattern).toBe("1|1"); // hold-1
    expect(v!.turnLabel).toBe("Hold 1");
    expect(v!.reversalSequence).toBeUndefined();
  });

  it("skips a turn pattern whose period does not tile the step count", () => {
    const cfg: VariationConfig = {
      reversalFrequency: 0, enabledReversals: [],
      turnFrequency: 1, enabledTurnPatterns: ["wave-21"], // period 4
    };
    // stepCount 2 not divisible by 4 → no candidate → null
    expect(rollVariation(2, cfg, seededRng([0.0, 0.0]))).toBeNull();
  });
});

describe("applyVariationDescriptor", () => {
  it("turn-only: applies turns and returns a new sequence (TnD path)", () => {
    const seq = twoStepSeq();
    const { sequence } = applyVariationDescriptor(seq, { turnPattern: "1|1" }, []);
    expect(sequence).not.toBe(seq); // new object
    expect(sequence.steps[0]!.motions!.left!.turns).toBe(1);
    expect(sequence.steps[0]!.motions!.right!.turns).toBe(1);
  });

  it("turn-only: tiles a single uniform unit across all beats", () => {
    const { sequence } = applyVariationDescriptor(twoStepSeq(), { turnPattern: "1|2" }, []);
    expect(sequence.steps[0]!.motions!.left!.turns).toBe(1);
    expect(sequence.steps[0]!.motions!.right!.turns).toBe(2);
    expect(sequence.steps[1]!.motions!.left!.turns).toBe(1);
    expect(sequence.steps[1]!.motions!.right!.turns).toBe(2);
  });

  it("preserves signed turn values while splitting beat patterns", () => {
    expect(parseTurnUnit("-0.25|-0.25--0.25|0.25")).toEqual([
      { left: -0.25, right: -0.25 },
      { left: -0.25, right: 0.25 },
    ]);

    const { sequence } = applyVariationDescriptor(twoStepSeq(), {
      turnPattern: "-0.25|-0.25",
    }, []);
    expect(sequence.steps[0]!.motions.left.turns).toBe(-0.25);
    expect(sequence.steps[0]!.motions.right.turns).toBe(-0.25);
    expect(sequence.steps[1]!.motions.left.turns).toBe(-0.25);
    expect(sequence.steps[1]!.motions.right.turns).toBe(-0.25);
  });

  it("no-op descriptor returns the base sequence content unchanged", () => {
    const seq = twoStepSeq();
    const { sequence } = applyVariationDescriptor(seq, {}, []);
    expect(sequence.steps[0]!.motions!.left!.turns).toBe(0);
  });
});

describe("applyVariation (compose wrapper)", () => {
  it("preserves the AppliedVariation shape with all keys", () => {
    const seq = twoStepSeq();
    const cfg = { ...DEFAULT_VARIATION_CONFIG, reversalFrequency: 0, turnFrequency: 0 };
    const result = applyVariation(seq, cfg, [], () => 0.99);
    expect(result.sequence).toBe(seq); // no variation rolled → base returned
    expect(result.variation).toEqual({
      reversalPatternId: null,
      reversalLabel: null,
      reversalSequence: null,
      turnPattern: null,
      turnLabel: null,
      turnLoopClosed: true,
      warnings: [],
    });
  });

  it("maps a rolled turn into AppliedVariation fields", () => {
    const cfg = {
      reversalFrequency: 0, enabledReversals: [],
      turnFrequency: 1, enabledTurnPatterns: ["hold-1"],
    };
    const result = applyVariation(twoStepSeq(), cfg, [], seededRng([0.0, 0.0]));
    expect(result.variation.turnPattern).toBe("1|1");
    expect(result.variation.turnLabel).toBe("Hold 1");
  });
});

describe("resolveDeckSequences (positional seam)", () => {
  it("expands many cards over one base id into distinct variants (TnD collapse fix)", () => {
    const base = twoStepSeq(); // id "TEST"
    const map = new Map([["cat::TEST", base]]);
    const cards = [
      { sequenceId: "TEST", sourceCatalogId: "cat", variation: { turnPattern: "0|0" } },
      { sequenceId: "TEST", sourceCatalogId: "cat", variation: { turnPattern: "1|1" } },
      { sequenceId: "TEST", sourceCatalogId: "cat", variation: { turnPattern: "2|2" } },
    ];
    const out = resolveDeckSequences(cards, map, []);
    expect(out).toHaveLength(3); // NOT collapsed to 1
    expect(out[0]!.sequence.steps[0]!.motions!.left!.turns).toBe(0);
    expect(out[1]!.sequence.steps[0]!.motions!.left!.turns).toBe(1);
    expect(out[2]!.sequence.steps[0]!.motions!.left!.turns).toBe(2);
  });

  it("returns base untouched when a card has no variation", () => {
    const base = twoStepSeq();
    const map = new Map([["cat::TEST", base]]);
    const out = resolveDeckSequences([{ sequenceId: "TEST", sourceCatalogId: "cat" }], map, []);
    expect(out[0]!.sequence).toBe(base);
    expect(out[0]!.turnLoopClosed).toBe(true);
  });
});

import { resolveStartOrientation, type StartOriMode } from "../deck-variation";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

describe("resolveStartOrientation (family-aware)", () => {
  it("maps register + family to its per-hand orientation pair", () => {
    expect(resolveStartOrientation("radial", "alpha")).toEqual({ left: Orientation.IN, right: Orientation.IN });
    // nonradial: alpha/gamma = clock|counter; beta = counter|clock
    expect(resolveStartOrientation("nonradial", "alpha")).toEqual({ left: Orientation.CLOCK, right: Orientation.COUNTER });
    expect(resolveStartOrientation("nonradial", "beta")).toEqual({ left: Orientation.COUNTER, right: Orientation.CLOCK });
    // mixed/split: blue radial; red = clock for beta, counter otherwise
    expect(resolveStartOrientation("split", "alpha")).toEqual({ left: Orientation.IN, right: Orientation.COUNTER });
    expect(resolveStartOrientation("split", "beta")).toEqual({ left: Orientation.IN, right: Orientation.CLOCK });
  });
});

/** twoStepSeq() plus a start placement (required for orientation propagation). */
function seqWithStart() {
  const base = twoStepSeq();
  const startMotion = () =>
    createMotionData({
      motionType: "static" as const,
      rotationDirection: "cw" as const,
      startLocation: "n" as const,
      endLocation: "n" as const,
      turns: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
    });
  return {
    ...base,
    startPlacement: {
      isStartPlacement: true as const,
      id: "SP",
      startPos: "alpha",
      endPos: "alpha",
      letter: null,
      gridMode: "diamond",
      motions: { left: startMotion(), right: startMotion() },
    } as unknown as NonNullable<SequenceData["startPlacement"]>,
  } as SequenceData;
}

describe("applyVariationDescriptor — startOriMode", () => {
  it("register-only (no turn/reversal) re-seeds AND propagates to every step", () => {
    // Fixture hands both start at N → beta family → nonradial beta = counter|clock.
    const seq = seqWithStart();
    const { sequence } = applyVariationDescriptor(seq, { startOriMode: "nonradial" }, []);
    expect(sequence.startPlacement!.motions.left!.endOrientation).toBe(Orientation.COUNTER);
    expect(sequence.startPlacement!.motions.right!.endOrientation).toBe(Orientation.CLOCK);
    expect(sequence.steps[0]!.motions!.left!.startOrientation).toBe(Orientation.COUNTER);
  });

  it("does NOT mutate the input base sequence (shared across cards)", () => {
    const seq = seqWithStart();
    applyVariationDescriptor(seq, { startOriMode: "nonradial" }, []);
    expect(seq.startPlacement!.motions.left!.endOrientation).toBe(Orientation.IN);
    expect(seq.steps[0]!.motions!.left!.startOrientation).toBe(Orientation.IN);
  });

  it("radial / absent register is a no-op passthrough", () => {
    const seq = seqWithStart();
    const a = applyVariationDescriptor(seq, { startOriMode: "radial" }, []);
    expect(a.sequence.steps[0]!.motions!.left!.startOrientation).toBe(Orientation.IN);
    const b = applyVariationDescriptor(seq, {}, []);
    expect(b.sequence).toBe(seq);
  });

  it("split re-seeds blue radial, red nonradial (beta fixture → red clock)", () => {
    // Fixture hands both start at N → beta family → mixed beta = in|clock.
    const { sequence } = applyVariationDescriptor(seqWithStart(), { startOriMode: "split" }, []);
    expect(sequence.startPlacement!.motions.left!.endOrientation).toBe(Orientation.IN);
    expect(sequence.startPlacement!.motions.right!.endOrientation).toBe(Orientation.CLOCK);
  });
});

describe("applyVariationDescriptor — box mode", () => {
  it("rotates a beta seed CCW (−45°) into box; gridMode flips, no-op when diamond", () => {
    // Fixture hands both start at N → beta family → CCW: N → NW.
    const { sequence } = applyVariationDescriptor(seqWithStart(), { gridMode: "box" }, []);
    expect(sequence.startPlacement!.motions.left!.startLocation).toBe("nw");
    expect(sequence.startPlacement!.motions.right!.startLocation).toBe("nw");
    expect(sequence.startPlacement!.gridMode).toBe("box");

    // diamond / absent is a passthrough.
    const same = applyVariationDescriptor(seqWithStart(), { gridMode: "diamond" }, []);
    expect(same.sequence.startPlacement!.motions.left!.startLocation).toBe("n");
  });
});
