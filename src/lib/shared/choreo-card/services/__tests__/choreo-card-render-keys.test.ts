import { describe, it, expect } from "vitest";
import {
  buildChoreoCardRenderKeys,
  type ChoreoCardRenderKeyInputs,
} from "../choreo-card-render-keys";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

/**
 * Regression guard for the "download-card flashes out and in" bug (2026-07-02).
 *
 * ChoreoCard's grid-stable-image branch picks its transition mode from
 * `structuralKey`: if it changed, the two pictographs are geometrically
 * different (different arrows/props) → `swap` (sequential, no ghost-overlap);
 * if only the imageKey changed, an OVERLAY toggled (non-radial / grid / points /
 * glyphs / step numbers) → `crossfade` (simultaneous, no whole-grid blank).
 *
 * Routing an overlay toggle through `swap` blanked every cell mid-transition —
 * the reported flash. These tests lock which flags are structural (→ swap) and
 * which are overlay-only (→ crossfade). They mirror ChoreoCard's own decision:
 *   structuralKey changed → "swap"; else imageKey changed → "crossfade".
 */

const SEQ: SequenceData = {
  id: "seq-1",
  steps: [
    { letter: "A", duration: 1 },
    { letter: "B", duration: 1 },
  ],
} as unknown as SequenceData;

function baseInputs(): ChoreoCardRenderKeyInputs {
  return {
    sequence: SEQ,
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    leftBuugengFlipped: false,
    rightBuugengFlipped: false,
    catDogModeEnabled: false,
    showStepNumbers: true,
    showNonRadial: false,
    handPointVis: "all",
    showTKA: true,
    showReversals: true,
    showTnD: false,
    showElemental: false,
    showPositions: false,
    showGrid: true,
    showLeftMotion: true,
    showRightMotion: true,
    includeStartPosition: true,
    startPositionLayout: "row",
    effectiveColumns: 4,
    darkMode: false,
  };
}

/** Mirrors ChoreoCard's grid-stable-image mode decision. */
function routeMode(
  prev: ChoreoCardRenderKeyInputs,
  next: ChoreoCardRenderKeyInputs
): "swap" | "crossfade" | "no-change" {
  const a = buildChoreoCardRenderKeys(prev);
  const b = buildChoreoCardRenderKeys(next);
  if (a.imageKey === b.imageKey) return "no-change";
  return a.structuralKey !== b.structuralKey ? "swap" : "crossfade";
}

describe("buildChoreoCardRenderKeys — overlay vs structural routing", () => {
  it("invalidates geometry for hand-path and solo presentation changes", () => {
    const before = baseInputs();
    expect(routeMode(before, { ...before, handPathMode: true })).toBe("swap");
    expect(routeMode(before, {
      ...before,
      browseViewMode: { subject: "props", granularity: "solo", hand: "right" },
    })).toBe("swap");
  });
  it("repaints a changed palette without moving the card cells", () => {
    const before = baseInputs();
    const after = { ...before, primaryPropColors: { left: "#00ff88", right: "#ff8800" } };
    expect(buildChoreoCardRenderKeys(after).imageKey).not.toBe(buildChoreoCardRenderKeys(before).imageKey);
    expect(routeMode(before, after)).toBe("crossfade");
    expect(buildChoreoCardRenderKeys({ ...after, primaryPropColors: null })).toEqual(buildChoreoCardRenderKeys(before));
  });
  it("non-radial toggle is overlay-only → crossfade (the bug: it used to swap)", () => {
    const before = baseInputs();
    const after = { ...before, showNonRadial: true };
    const a = buildChoreoCardRenderKeys(before);
    const b = buildChoreoCardRenderKeys(after);
    expect(b.imageKey).not.toBe(a.imageKey); // the image DID change
    expect(b.structuralKey).toBe(a.structuralKey); // but geometry did NOT
    expect(b.gridStableKey).toBe(a.gridStableKey); // grid stayed stable
    expect(routeMode(before, after)).toBe("crossfade");
  });

  it("overlay-only flags all route to crossfade", () => {
    const before = baseInputs();
    const overlayOnly: Partial<ChoreoCardRenderKeyInputs>[] = [
      { showGrid: false },
      { handPointVis: "none" },
      { showTKA: false },
      { showReversals: false },
      { showTnD: true },
      { showElemental: true },
      { showPositions: true },
      { showStepNumbers: false },
    ];
    for (const patch of overlayOnly) {
      expect(routeMode(before, { ...before, ...patch })).toBe("crossfade");
    }
  });

  it("structural flags (geometry differs → ghost risk) route to swap", () => {
    const before = baseInputs();
    const structural: Partial<ChoreoCardRenderKeyInputs>[] = [
      { leftPropType: PropType.CLUB }, // different prop → different arrows
      { rightPropType: PropType.CLUB },
      { catDogModeEnabled: true },
      { showLeftMotion: false }, // motion visibility changes which arrows show
      { showRightMotion: false },
      {
        sequence: {
          id: "seq-2",
          steps: [
            { letter: "C", duration: 1 },
            { letter: "D", duration: 1 },
          ],
        } as unknown as SequenceData,
      },
    ];
    for (const patch of structural) {
      expect(routeMode(before, { ...before, ...patch })).toBe("swap");
    }
  });

  it("same-id transforms with unchanged letters invalidate rendered geometry", () => {
    const before = baseInputs();
    const sequence = before.sequence;
    if (!sequence) throw new Error("The render-key fixture needs a sequence");
    const transformed = {
      ...before,
      sequence: {
        ...sequence,
        steps: sequence.steps.map((step, index) => ({
          ...step,
          motions: {
            ...step.motions,
            left: {
              motionType: "pro",
              rotationDirection: "cw",
              startLocation: index === 0 ? "n" : "e",
              endLocation: index === 0 ? "e" : "s",
              turns: 0,
              startOrientation: "in",
              endOrientation: "in",
            },
          },
        })),
      } as unknown as SequenceData,
    };

    expect(routeMode(before, transformed)).toBe("swap");
  });

  it("structuralKey excludes every overlay-visibility flag", () => {
    const base = buildChoreoCardRenderKeys(baseInputs());
    // Flip ALL overlay flags at once; structuralKey must not budge.
    const allOverlaysFlipped = buildChoreoCardRenderKeys({
      ...baseInputs(),
      showNonRadial: true,
      showGrid: false,
      handPointVis: "none",
      showTKA: false,
      showReversals: false,
      showTnD: true,
      showElemental: true,
      showPositions: true,
      showStepNumbers: false,
    });
    expect(allOverlaysFlipped.structuralKey).toBe(base.structuralKey);
    expect(allOverlaysFlipped.imageKey).not.toBe(base.imageKey);
  });
});
