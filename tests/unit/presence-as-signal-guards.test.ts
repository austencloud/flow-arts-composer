/**
 * Presence-as-Signal Guards — StepData→Step migration tripwires.
 *
 * Since 2026-07-02 `StepData.motions` is {blue, red} BOTH REQUIRED (canonical
 * Step shape) and "this hand is not really there" is an INVISIBLE STATIC
 * PLACEHOLDER (`createStepData` fills missing hands; `isVisibleMotion` is the
 * presence predicate at every re-encoded site). These tests lock that the
 * re-encoded semantics match the old absence semantics exactly: one-hand and
 * blank steps still skip derivation, still hash with the "-" sentinel, still
 * animate solo, still suppress the missing prop.
 *
 * A failing test here is the tripwire working: whoever changes the encoding
 * must consciously re-encode these behaviors — not delete the test.
 *
 * Full 110-site register + absence-encoding design:
 * docs/superpowers/specs/active/2026-07-01-presence-as-signal-register.md
 * docs/superpowers/specs/active/2026-07-02-stepdata-step-absence-encoding-design.md
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";

import { reconcileStepDerived } from "$lib/shared/create/services/sequence-derived-fields";
import { deriveSequenceLetters } from "$lib/shared/create/services/sequence-transforms";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";
import { deriveTnDFromPictograph } from "$lib/shared/pictograph/shared/domain/utils/tnd-deriver";
import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";
import { interpolatePropAngles } from "$lib/shared/animation-engine/services/prop-interpolator";
import { FrameParameterBuilder } from "$lib/shared/animation-engine/services/frame-parameter-builder";
import { ensureMotionData } from "$lib/shared/sequence-viewer/services/sequence-motion-loader";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";

vi.mock("$lib/shared/browse/get-browse-loader", () => ({
  getBrowseLoader: vi.fn(),
}));

// Wave 0 guards: hydrateSequence's letter/position derivers hit the pictograph
// dataframe (fetch) — identity-stub them so the gridMode donor loop is the
// unit under test.
vi.mock("$lib/shared/navigation/services/letter-deriver", () => ({
  deriveLettersForSequence: vi.fn(async (s: unknown) => s),
}));
vi.mock("$lib/shared/navigation/services/position-deriver", () => ({
  derivePositionsForSequence: vi.fn(async (s: unknown) => s),
}));
import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
import { analyzeDifficulty } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import { enrichStepsWithGridPlacements } from "$lib/shared/qr/services/compositional-utils";
import { extractPattern } from "$lib/features/create/shared/services/rotation-direction-pattern-manager";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

function motion(overrides: Partial<MotionData> = {}): MotionData {
  return createMotionData({
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.OUT,
    turns: 1,
    ...overrides,
  });
}

function oneHandStep(overrides: Partial<StepData> = {}): StepData {
  return createStepData({
    letter: Letter.A,
    stepNumber: 1,
    motions: { [HandSide.LEFT]: motion() },
    ...overrides,
  });
}

function bothHandStep(overrides: Partial<StepData> = {}): StepData {
  return createStepData({
    letter: Letter.A,
    stepNumber: 1,
    motions: {
      [HandSide.LEFT]: motion(),
      [HandSide.RIGHT]: motion({
        color: HandSide.RIGHT,
        startLocation: GridLocation.SOUTH,
        endLocation: GridLocation.WEST,
      }),
    },
    ...overrides,
  });
}

function seq(steps: StepData[]): SequenceData {
  return createSequenceData({ word: "GUARD", steps });
}

// ── sequence-derived-fields.ts:34 ───────────────────────────────────────────
describe("reconcileStepDerived — one-hand steps pass through UNCHANGED", () => {
  it("does not recompute gridMode/positions for a one-hand step (stale values kept)", () => {
    const step = oneHandStep({
      startPlacement: GridPlacement.GAMMA11, // deliberately stale/wrong
      endPlacement: GridPlacement.GAMMA11,
    });
    const out = reconcileStepDerived(step);
    expect(out).toBe(step); // identity: absence short-circuits derivation entirely
  });

  it("DOES recompute for a both-hand step (control: proves the gate is presence)", () => {
    const step = bothHandStep({ startPlacement: GridPlacement.GAMMA11 });
    const out = reconcileStepDerived(step);
    expect(out).not.toBe(step);
    expect(out.startPlacement).not.toBe(GridPlacement.GAMMA11);
  });
});

// ── sequence-transforms.ts:551 ──────────────────────────────────────────────
describe("deriveSequenceLetters — one-hand steps keep their letter, no lookup", () => {
  it("skips the dataframe lookup for a step missing a hand", async () => {
    const handler = {
      findLetterByMotionConfiguration: vi.fn(async () => Letter.B),
    };
    const out = await deriveSequenceLetters(
      seq([oneHandStep({ letter: Letter.A })]),
      handler as unknown as Parameters<typeof deriveSequenceLetters>[1]
    );
    expect(handler.findLetterByMotionConfiguration).not.toHaveBeenCalled();
    expect(out.steps[0]!.letter).toBe(Letter.A); // stale letter preserved by design
  });

  it("DOES look up for a both-hand step (control)", async () => {
    const handler = {
      findLetterByMotionConfiguration: vi.fn(async () => Letter.B),
    };
    const out = await deriveSequenceLetters(
      seq([bothHandStep({ letter: Letter.A })]),
      handler as unknown as Parameters<typeof deriveSequenceLetters>[1]
    );
    expect(handler.findLetterByMotionConfiguration).toHaveBeenCalledTimes(1);
    expect(out.steps[0]!.letter).toBe(Letter.B);
  });
});

// ── sequence-loopability-checker.ts:92,142 ──────────────────────────────────
describe("isSeamlesslyLoopable — absent hand passes vacuously; both absent = not loopable", () => {
  const circularBlue = motion({
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.NORTH,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
  });

  it("one-hand sequence is loopable when the present hand closes (red vacuously passes)", () => {
    const step = createStepData({
      stepNumber: 1,
      motions: { [HandSide.LEFT]: circularBlue },
    });
    expect(isSeamlesslyLoopable(seq([step]))).toBe(true);
  });

  it("one-hand sequence is NOT loopable when the present hand does not close (control)", () => {
    const open = motion({
      startLocation: GridLocation.NORTH,
      endLocation: GridLocation.EAST,
    });
    const step = createStepData({
      stepNumber: 1,
      motions: { [HandSide.LEFT]: open },
    });
    expect(isSeamlesslyLoopable(seq([step]))).toBe(false);
  });

  it("zero-hand sequence is NOT loopable (no data = no determination)", () => {
    const step = createStepData({ stepNumber: 1, motions: {} });
    expect(isSeamlesslyLoopable(seq([step]))).toBe(false);
  });
});

// ── content-hasher.ts:113 ───────────────────────────────────────────────────
describe('hashSequenceContent — absent motion hashes as the "-" sentinel', () => {
  it("one-hand and both-hand versions of the same step hash differently", () => {
    const left = motion();
    const oneHand = createStepData({
      stepNumber: 1,
      motions: { [HandSide.LEFT]: left },
    });
    const bothHands = createStepData({
      id: oneHand.id,
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: left,
        [HandSide.RIGHT]: motion({ color: HandSide.RIGHT }),
      },
    });
    const h1 = hashSequenceContent({
      word: "W",
      steps: [oneHand],
      startPlacement: undefined,
    });
    const h2 = hashSequenceContent({
      word: "W",
      steps: [bothHands],
      startPlacement: undefined,
    });
    expect(h1).not.toBe(h2); // a bridge that fabricates the red motion re-keys render caches
  });

  it("absence hashes deterministically (sentinel is stable)", () => {
    const step = oneHandStep();
    const a = hashSequenceContent({
      word: "W",
      steps: [step],
      startPlacement: undefined,
    });
    const b = hashSequenceContent({
      word: "W",
      steps: [step],
      startPlacement: undefined,
    });
    expect(a).toBe(b);
  });
});

// ── tnd-deriver.ts:114 ──────────────────────────────────────────────────────
describe("deriveTnDFromPictograph — absent hand yields NULL_RESULT", () => {
  it("returns null classification when a hand is missing", () => {
    const out = deriveTnDFromPictograph(oneHandStep());
    expect(out.tndMode).toBeNull();
    expect(out.elementalType).toBeNull();
  });

  it("classifies when both hands present with shift arcs (control)", () => {
    const step = bothHandStep(); // blue N->E, red S->W: opposite-side shift arcs
    const out = deriveTnDFromPictograph(step);
    expect(out.tndMode).not.toBeNull();
  });
});

// ── turns-tuple-generator.ts:47 ─────────────────────────────────────────────
describe('TurnsTupleGenerator — absent hand falls back to "(0, 0)"', () => {
  it('returns the generic "(0, 0)" tuple for a one-hand pictograph', () => {
    expect(turnsTupleGenerator.generateTurnsTuple(oneHandStep())).toBe(
      "(0, 0)"
    );
  });

  it("returns a letter-type-specific tuple for a both-hand pictograph (control)", () => {
    const tuple = turnsTupleGenerator.generateTurnsTuple(
      bothHandStep({ letter: Letter.A })
    );
    expect(tuple).not.toBe("(0, 0)");
  });
});

// ── prop-interpolator.ts:57,67 — the mandala solo-animation path ────────────
describe("interpolatePropAngles — absent hand animates NOTHING (solo path)", () => {
  it("one-hand step: present hand gets angles, absent hand stays null, frame valid", () => {
    const out = interpolatePropAngles(oneHandStep(), 0.5);
    expect(out.isValid).toBe(true);
    expect(out.leftAngles).not.toBeNull();
    expect(out.rightAngles).toBeNull(); // mandala club solo animation depends on this
  });

  it("zero-hand step: frame is invalid (blank beat, nothing animates)", () => {
    const out = interpolatePropAngles(
      createStepData({ stepNumber: 1, motions: {} }),
      0.5
    );
    expect(out.isValid).toBe(false);
    expect(out.leftAngles).toBeNull();
    expect(out.rightAngles).toBeNull();
  });
});

// ── frame-parameter-builder.ts:509 — single-hand prop nulling ───────────────
describe("FrameParameterBuilder.updateHandPresenceCache — absent hand's prop is suppressed", () => {
  it("sequence with only blue motions reports sequenceHasRedMotion=false", () => {
    const builder = new FrameParameterBuilder();
    builder.updateHandPresenceCache(seq([oneHandStep()]));
    expect(builder.sequenceHasLeftMotion).toBe(true);
    expect(builder.sequenceHasRightMotion).toBe(false); // renderer nulls the red prop
  });

  it("both-hand sequence reports both present (control)", () => {
    const builder = new FrameParameterBuilder();
    builder.updateHandPresenceCache(seq([bothHandStep()]));
    expect(builder.sequenceHasLeftMotion).toBe(true);
    expect(builder.sequenceHasRightMotion).toBe(true);
  });
});

// ── sequence-motion-loader.ts:15 — the hydration gate ───────────────────────
describe("ensureMotionData — motion absence triggers the gallery fetch", () => {
  const loadFullSequenceData = vi.fn();

  beforeEach(() => {
    loadFullSequenceData.mockReset();
    vi.mocked(getBrowseLoader).mockReturnValue({
      loadFullSequenceData,
    } as unknown as ReturnType<typeof getBrowseLoader>);
  });

  it("sequence that already has both motions is returned as-is, no fetch", async () => {
    const s = seq([bothHandStep()]);
    const out = await ensureMotionData(s);
    expect(out).toBe(s);
    expect(loadFullSequenceData).not.toHaveBeenCalled();
  });

  // Thin gallery records are RAW Firestore blobs that never passed through the
  // factory — their motions really are absent at runtime, whatever the type
  // says. Model them as raw-shaped objects, not factory output (which now
  // placeholder-fills and therefore reads as full data).
  function rawThinStep(): StepData {
    return { ...bothHandStep(), motions: {} } as unknown as StepData;
  }

  it("thin sequence (raw record, no step has both motions) fetches from the gallery", async () => {
    const hydrated = seq([bothHandStep()]);
    loadFullSequenceData.mockResolvedValue(hydrated);
    const thin = seq([rawThinStep()]);
    const out = await ensureMotionData(thin);
    // The id is threaded alongside the word so same-word variations resolve to
    // the right sequence (loadFullSequenceData(name, id?)).
    expect(loadFullSequenceData).toHaveBeenCalledWith("GUARD", thin.id);
    expect(out).toBe(hydrated);
  });

  it("failed fetch falls back to the original thin sequence", async () => {
    loadFullSequenceData.mockResolvedValue(null);
    const thin = seq([rawThinStep()]);
    const out = await ensureMotionData(thin);
    expect(out).toBe(thin);
  });

  it("placeholder-filled one-hand step counts as full data (assembly workspaces never re-fetch)", async () => {
    const s = seq([oneHandStep()]);
    const out = await ensureMotionData(s);
    expect(out).toBe(s);
    expect(loadFullSequenceData).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 0 — straggler re-encodes (2026-07-05). The checkpoint package
// (2026-07-05-stepdata-migration-checkpoint-package.md §1c) found these sites
// still keyed on raw presence after the both-required flip; each guard below
// locks the restored absence semantics.
// ═══════════════════════════════════════════════════════════════════════════

function invisibleMotion(overrides: Partial<MotionData> = {}): MotionData {
  return motion({
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    isVisible: false,
    ...overrides,
  });
}

describe("hydrateSequence — placeholder beats cannot donate gridMode", () => {
  it("skips a leading blank beat and derives gridMode from the first VISIBLE beat", async () => {
    const blankBoxish = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: invisibleMotion({
          startLocation: GridLocation.NORTHEAST,
          endLocation: GridLocation.NORTHEAST,
        }),
        [HandSide.RIGHT]: invisibleMotion({
          color: HandSide.RIGHT,
          startLocation: GridLocation.SOUTHWEST,
          endLocation: GridLocation.SOUTHWEST,
        }),
      },
    });
    const realDiamond = bothHandStep({ stepNumber: 2 });
    const out = await hydrateSequence(seq([blankBoxish, realDiamond]), {
      loopDetector: null,
    });
    // Placeholder locations are intercardinal (box-implying); the real beat is
    // cardinal (diamond). The donor must be the real beat.
    expect(out.gridMode).toBe(GridMode.DIAMOND);
  });

  it("all-placeholder sequence leaves gridMode unset (no fabricated donor)", async () => {
    const blank = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: invisibleMotion(),
        [HandSide.RIGHT]: invisibleMotion({ color: HandSide.RIGHT }),
      },
    });
    const out = await hydrateSequence(seq([blank]), { loopDetector: null });
    expect(out.gridMode).toBeUndefined();
  });
});

describe("analyzeDifficulty — invisible placeholders don't inflate the badge", () => {
  const calmVisible = () =>
    motion({
      turns: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.OUT,
    });

  it("an invisible CLOCK-orientation placeholder does not trigger level 3", () => {
    const step = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: calmVisible(),
        [HandSide.RIGHT]: invisibleMotion({
          color: HandSide.RIGHT,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.CLOCK,
        }),
      },
    });
    expect(analyzeDifficulty([step])).toEqual({ level: 1, trigger: "none" });
  });

  it("the SAME motion visible DOES trigger level 3 (control: the gate is visibility)", () => {
    const step = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: calmVisible(),
        [HandSide.RIGHT]: motion({
          color: HandSide.RIGHT,
          turns: 0,
          startOrientation: Orientation.CLOCK,
          endOrientation: Orientation.CLOCK,
        }),
      },
    });
    expect(analyzeDifficulty([step]).level).toBe(3);
  });
});

describe("enrichStepsWithGridPlacements — placeholder beats keep null positions", () => {
  it("does not fabricate GridPlacements from placeholder locations", () => {
    const blank = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: invisibleMotion(),
        [HandSide.RIGHT]: invisibleMotion({ color: HandSide.RIGHT }),
      },
    });
    enrichStepsWithGridPlacements([blank]);
    expect(blank.startPlacement).toBeNull();
    expect(blank.endPlacement).toBeNull();
  });

  it("DOES derive for a visible both-hand step (control)", () => {
    const step = bothHandStep();
    enrichStepsWithGridPlacements([step]);
    expect(step.startPlacement).not.toBeNull();
    expect(step.endPlacement).not.toBeNull();
  });
});

describe("extractPattern — placeholder hands extract as null (skip slot), not 'none'", () => {
  it("invisible hand yields null; visible cw hand yields 'cw'", () => {
    const step = createStepData({
      stepNumber: 1,
      motions: {
        [HandSide.LEFT]: motion(), // PRO cw, turns 1 -> "cw"
        [HandSide.RIGHT]: invisibleMotion({ color: HandSide.RIGHT }),
      },
    });
    const pattern = extractPattern(seq([step]), "wave0-guard");
    expect(pattern.entries[0]?.left).toBe("cw");
    // Before the fix this was "none" (placeholder STATIC@0), permanently
    // disabling nothing — but baking a fabricated slot into saved patterns.
    expect(pattern.entries[0]?.right).toBeNull();
  });
});
