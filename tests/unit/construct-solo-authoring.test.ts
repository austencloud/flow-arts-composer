import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
import {
  GridMode,
  GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  MotionType,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createSoloAuthoringState } from "../../src/routes/test/construct-solo-handoff/solo-authoring-state.svelte";
import { createConstructSoloReviewSequence } from "../../src/routes/test/construct-solo-handoff/construct-solo-review-fixture";
import {
  appendSoloContinuation,
  createSoloContinuationOptions,
  createSoloStart,
  otherHand,
  pairSoloReviewSequences,
} from "../../src/routes/test/construct-solo-handoff/construct-solo-proposal";

const catalogs = new Map<GridMode, PictographData[]>();
beforeAll(async () => {
  const read = (name: string) =>
    readFileSync(
      resolve("static/data/pictographs", name + "PictographDataframe.csv"),
      "utf8"
    );
  Object.assign(window, {
    csvData: {
      diamondData: read("Diamond"),
      boxData: read("Box"),
      skewedData: read("Skewed"),
    },
  });
  for (const grid of [GridMode.DIAMOND, GridMode.BOX])
    catalogs.set(
      grid,
      await motionQueryHandler.queryMotions({ gridMode: grid })
    );
});
const loadCatalog = async (grid: GridMode) => catalogs.get(grid)!;
const createState = () =>
  createSoloAuthoringState(
    { loadCatalog, deriveLetters: deriveLettersForSequence },
    createConstructSoloReviewSequence("left")
  );

describe("single-hand authorship against the real catalog", () => {
  it("keeps Box starts on the Box grid through both creation paths", () => {
    const fresh = createSoloStart(
      "right",
      GridMode.BOX,
      GridLocation.SOUTHEAST,
      Orientation.OUT
    );
    const imported = createConstructSoloReviewSequence("left");
    expect(fresh.startPlacement?.gridMode).toBe(GridMode.BOX);
    expect(imported.startPlacement?.gridMode).toBe(GridMode.BOX);
    expect(fresh.startPlacement?.motions.right?.endLocation).toBe(
      GridLocation.SOUTHEAST
    );
  });
  it.each(["left", "right"] as const)(
    "starts and continues %s without inventing the other hand",
    (hand) => {
      for (const grid of [GridMode.DIAMOND, GridMode.BOX]) {
        let sequence = createSoloStart(
          hand,
          grid,
          grid === GridMode.BOX ? GridLocation.NORTHWEST : GridLocation.NORTH,
          Orientation.OUT
        );
        for (const turns of [0, 1, 0.5, 0.25, "fl"] as const) {
          const options = createSoloContinuationOptions(
            catalogs.get(grid)!,
            sequence,
            hand,
            { turns }
          );
          expect(options.length).toBeGreaterThan(0);
          for (const option of options) {
            expect(isVisibleMotion(option.motions[otherHand(hand)])).toBe(
              false
            );
            const motion = option.motions[hand];
            expect(motion.endOrientation).toBe(
              calculateEndOrientation(motion, hand)
            );
            expect(motion.turns).toBe(turns);
            if (turns === "fl")
              expect(motion.motionType).toBe(MotionType.FLOAT);
          }
          sequence = appendSoloContinuation(sequence, options[0]!);
          const composition =
            hand === "left" ? sequence.leftSoloProp : sequence.rightSoloProp;
          expect(composition?.steps).toHaveLength(sequence.steps.length);
          expect(composition?.steps.at(-1)?.endOrientation).toBe(
            sequence.steps.at(-1)?.motions[hand].endOrientation
          );
          expect(sequence.metadata?.soloPropContentHash).toBe(
            composition?.contentHash
          );
        }
      }
    }
  );

  it("uses explicit dash/static spin direction and preserves continuity", () => {
    const start = createSoloStart(
      "right",
      GridMode.DIAMOND,
      GridLocation.NORTH,
      Orientation.IN
    );
    const options = createSoloContinuationOptions(
      catalogs.get(GridMode.DIAMOND)!,
      start,
      "right",
      { turns: 1, direction: RotationDirection.COUNTER_CLOCKWISE }
    );
    const dash = options.find(
      (option) => option.motions.right.motionType === MotionType.DASH
    )!;
    expect(dash.motions.right.rotationDirection).toBe(
      RotationDirection.COUNTER_CLOCKWISE
    );
    const wrongStart = createSoloStart(
      "right",
      GridMode.DIAMOND,
      GridLocation.SOUTH,
      Orientation.IN
    );
    expect(() => appendSoloContinuation(wrongStart, dash)).toThrow(/continue/);
  });

  it("refuses unequal paths instead of dropping authored steps", () => {
    const blue = createConstructSoloReviewSequence("left");
    const red = createConstructSoloReviewSequence("right");
    const longer = appendSoloContinuation(
      blue,
      createSoloContinuationOptions(
        catalogs.get(GridMode.BOX)!,
        blue,
        "left"
      )[0]!
    );
    expect(() => pairSoloReviewSequences(longer, red)).toThrow(/same number/);
    expect(longer.steps).toHaveLength(9);
    expect(red.steps).toHaveLength(8);
  });

  it("refuses equal-length paths with unequal durations", () => {
    const blue = createConstructSoloReviewSequence("left");
    const red = createConstructSoloReviewSequence("right");
    const changed = {
      ...red,
      steps: red.steps.map((step, i) =>
        i === 0 ? { ...step, duration: 2 } : step
      ),
    };
    expect(() => pairSoloReviewSequences(blue, changed)).toThrow(/duration/);
    expect(blue.steps).toHaveLength(8);
    expect(changed.steps[0]?.duration).toBe(2);
  });

  it("keeps float provenance, native grid and source orientations through current Fuse", () => {
    const make = (hand: "left" | "right", location: GridLocation) => {
      const start = createSoloStart(
        hand,
        GridMode.BOX,
        location,
        Orientation.OUT
      );
      const option = createSoloContinuationOptions(
        catalogs.get(GridMode.BOX)!,
        start,
        hand,
        { turns: "fl" }
      )[0]!;
      return appendSoloContinuation(start, option);
    };
    const blue = make("left", GridLocation.NORTHWEST);
    const red = make("right", GridLocation.SOUTHEAST);
    const paired = pairSoloReviewSequences(blue, red);
    expect(paired.steps).toHaveLength(1);
    for (const [hand, source] of [
      ["left", blue],
      ["right", red],
    ] as const) {
      const motion = source.steps[0]!.motions[hand];
      expect(paired.steps[0]?.motions[hand]).toMatchObject({
        motionType: MotionType.FLOAT,
        turns: "fl",
        prefloatMotionType: motion.prefloatMotionType,
        startLocation: motion.startLocation,
        endLocation: motion.endLocation,
        startOrientation: motion.startOrientation,
        endOrientation: motion.endOrientation,
        gridMode: GridMode.BOX,
      });
    }
  });

  it.each(["left", "right"] as const)(
    "builds %s from scratch, adds its partner, combines, and undoes without changing the fixed hand",
    async (hand) => {
      const state = createState();
      state.newSolo();
      state.setHand(hand);
      await state.loadCatalog();
      state.start(GridLocation.NORTH);
      state.append(
        state.options.find(
          (option) => option.motions[hand].motionType === MotionType.PRO
        )!
      );
      state.append(state.options[0]!);
      const fixed = JSON.stringify(state.active);
      state.addPartner();
      state.start(GridLocation.SOUTH);
      expect(state.activeHand).toBe(otherHand(hand));
      expect(state.targetLength).toBe(2);
      expect(
        state.options.every((option) => !isVisibleMotion(option.motions[hand]))
      ).toBe(true);
      state.append(state.options[0]!);
      await state.review();
      expect(state.result).toBeNull();
      state.append(state.options[0]!);
      expect(state.complete).toBe(true);
      await state.review();
      expect(state.result?.steps).toHaveLength(2);
      expect(state.result?.steps.every((step) => step.letter)).toBe(true);
      expect(state.result?.word).toBe(
        state.result?.steps.map((step) => step.letter).join("")
      );
      expect(JSON.stringify(state.reference)).toBe(fixed);
      state.history.undo();
      expect(state.result).toBeNull();
      expect(state.active?.steps).toHaveLength(1);
      expect(JSON.stringify(state.reference)).toBe(fixed);
      state.history.redo();
      expect(state.active?.steps).toHaveLength(2);
      state.newSolo();
      state.history.undo();
      expect(state.active?.steps).toHaveLength(2);
      expect(JSON.stringify(state.reference)).toBe(fixed);
    }
  );

  it("ignores a delayed grid load after Undo restores the cached grid", async () => {
    let resolveDiamond!: (rows: PictographData[]) => void;
    const state = createSoloAuthoringState(
      {
        loadCatalog: (grid) =>
          grid === GridMode.BOX
            ? loadCatalog(grid)
            : new Promise((resolve) => {
                resolveDiamond = resolve;
              }),
        deriveLetters: deriveLettersForSequence,
      },
      createConstructSoloReviewSequence("left")
    );
    await state.loadCatalog();
    state.newSolo();
    const pending = state.loadCatalog();
    state.history.undo();
    await state.loadCatalog();
    resolveDiamond(catalogs.get(GridMode.DIAMOND)!);
    await pending;
    expect(state.draft.gridMode).toBe(GridMode.BOX);
    expect(state.options.length).toBeGreaterThan(0);
    expect(state.loading).toBe(false);
  });

  it("keeps failures retryable and never writes the workspace to storage", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(catalogs.get(GridMode.BOX)!);
    const state = createSoloAuthoringState(
      { loadCatalog: loader, deriveLetters: deriveLettersForSequence },
      createConstructSoloReviewSequence("left")
    );
    await state.loadCatalog();
    expect(state.error).toContain("offline");
    expect(state.loading).toBe(false);
    await state.loadCatalog();
    expect(state.options.length).toBeGreaterThan(0);
    expect(state.error).toBe("");
    state.append(state.options[0]!);
    state.history.undo();
    state.history.redo();
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });

  it("does not resurrect a completed pair when Undo happens during letter derivation", async () => {
    let resolvePair!: (sequence: SequenceData) => void;
    let pendingPair!: SequenceData;
    const state = createSoloAuthoringState(
      {
        loadCatalog,
        deriveLetters: (sequence) => {
          pendingPair = sequence;
          return new Promise((resolve) => {
            resolvePair = resolve;
          });
        },
      },
      createConstructSoloReviewSequence("left")
    );
    await state.loadCatalog();
    state.addPartner();
    state.start(GridLocation.SOUTHEAST);
    for (let step = 0; step < 8; step++) state.append(state.options[0]!);
    const review = state.review();
    expect(state.busy).toBe(true);
    state.history.undo();
    resolvePair(pendingPair);
    await review;
    expect(state.result).toBeNull();
    expect(state.active?.steps).toHaveLength(7);
    expect(state.busy).toBe(false);
  });
});
