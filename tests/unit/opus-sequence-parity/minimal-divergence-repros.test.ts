/**
 * The smallest concrete sequences on which the two LOOP paths disagree.
 *
 * READ-ONLY AUDIT EVIDENCE. Each repro is a one-step seed built from a single
 * canonical pictograph row, so the whole divergence fits on one screen and can
 * be pasted into a bug report or an MCP call without further setup.
 *
 * Both repros assert BOTH sides' exact output, so whichever implementation is
 * changed first, this file fails and states what changed.
 *
 * See `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.
 */

import { describe, expect, it } from "vitest";

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { getGridPositionFromLocations } from "$lib/shared/pictograph/grid/services/grid-position-deriver";
import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

import { buildSeed, loadPictographRows } from "./harness/canonical-fixtures";
import { AppLOOPType, AppPeriod, runApp, runEngine } from "./harness/run-both-paths";

/** `letter startPos→endPos L:startLoc→endLoc R:startLoc→endLoc` per step. */
function trace(steps: StepData[]): string[] {
  return steps.map(
    (s) =>
      `${s.letter ?? "-"} ${s.startPosition}→${s.endPosition} ` +
      `L:${s.motions.left.startLocation}→${s.motions.left.endLocation} ` +
      `R:${s.motions.right.startLocation}→${s.motions.right.endLocation}`
  );
}

function seedFor(letter: string, startPosition: string, endPosition: string) {
  const row = loadPictographRows("diamond").find(
    (r) =>
      r.letter === letter &&
      r.startPosition === startPosition &&
      r.endPosition === endPosition
  );
  if (!row) {
    throw new Error(
      `No canonical diamond row for ${letter} ${startPosition}→${endPosition}`
    );
  }
  return buildSeed([row], "diamond");
}

describe("D1 — app MIRRORED_SWAPPED_INVERTED relabels a position the hands never left", () => {
  // Canonical row: α, alpha3→alpha3, left static w→w, right static e→e.
  // Both hands are static with zero turns, so the derived pass cannot move
  // anything; the only question is what position the derived step claims.
  const seed = seedFor("α", "alpha3", "alpha3");

  it("is a two-entry seed of one static canonical step", () => {
    expect(trace(seed)).toEqual([
      "- alpha3→alpha3 L:w→w R:e→e",
      "α alpha3→alpha3 L:w→w R:e→e",
    ]);
  });

  it("app: derived step keeps the hands at w/e but calls the position alpha7", () => {
    const app = runApp(seed, AppLOOPType.MIRRORED_SWAPPED_INVERTED, AppPeriod.HALVED);
    expect(app.kind).toBe("ok");
    if (app.kind !== "ok") return;

    expect(trace(app.steps)).toEqual([
      "- alpha3→alpha3 L:w→w R:e→e",
      "α alpha3→alpha3 L:w→w R:e→e",
      "α alpha3→alpha7 L:w→w R:e→e",
    ]);

    // Self-contradiction, independent of the engine: hands at w/e ARE alpha3.
    const derived = getGridPositionFromLocations(
      app.steps[2]!.motions.left.endLocation as GridLocation,
      app.steps[2]!.motions.right.endLocation as GridLocation
    );
    expect(derived).toBe("alpha3");
    expect(app.steps[2]!.endPosition).toBe("alpha7");

    // …and therefore the LOOP never returns home.
    expect(app.steps[2]!.endPosition).not.toBe(seed[0]!.startPosition);
  });

  it("engine: derived step stays at alpha3 and the LOOP closes", () => {
    const engine = runEngine(
      seed,
      AppLOOPType.MIRRORED_SWAPPED_INVERTED,
      AppPeriod.HALVED
    );
    expect(engine.kind).toBe("ok");
    if (engine.kind !== "ok") return;

    expect(trace(engine.steps)).toEqual([
      "- alpha3→alpha3 L:w→w R:e→e",
      "α alpha3→alpha3 L:w→w R:e→e",
      "α alpha3→alpha3 L:w→w R:e→e",
    ]);
  });

  it("root cause: the app mirrors the end position without composing the swap", () => {
    // `MirroredSwappedInvertedLOOPExecutor._getMirroredPosition` applies only
    // VERTICAL_MIRROR_POSITION_MAP. The composite this LOOP performs on the
    // hands is swap∘mirror, and swap(mirror(alpha3)) === alpha3 while
    // mirror(alpha3) === alpha7 — so the stored position is one transform
    // short. Seeds where the two agree (alpha1/alpha5, beta1/beta5) show no
    // divergence, which is why the defect is invisible half the time.
    const app = runApp(seed, AppLOOPType.MIRRORED_SWAPPED_INVERTED, AppPeriod.HALVED);
    const unaffected = runApp(
      seedFor("α", "alpha1", "alpha1"),
      AppLOOPType.MIRRORED_SWAPPED_INVERTED,
      AppPeriod.HALVED
    );
    expect(app.kind).toBe("ok");
    expect(unaffected.kind).toBe("ok");
    if (app.kind !== "ok" || unaffected.kind !== "ok") return;

    expect(app.steps[2]!.endPosition).toBe("alpha7");
    expect(unaffected.steps[2]!.endPosition).toBe("alpha1");
  });
});

describe("D2 — engine quartered ROTATED_INVERTED stops rotating on its copy pass", () => {
  // Canonical row: A, alpha3→alpha5, left pro cw w→n, right pro cw e→s.
  // A quarter-turn seed: four passes should walk alpha3→alpha5→alpha7→alpha1
  // →alpha3.
  const seed = seedFor("A", "alpha3", "alpha5");

  it("app: four passes walk the full quarter orbit and close at alpha3", () => {
    const app = runApp(seed, AppLOOPType.ROTATED_INVERTED, AppPeriod.QUARTERED);
    expect(app.kind).toBe("ok");
    if (app.kind !== "ok") return;

    expect(trace(app.steps)).toEqual([
      "- alpha3→alpha3 L:w→w R:e→e",
      "A alpha3→alpha5 L:w→n R:e→s",
      "B alpha5→alpha7 L:n→e R:s→w",
      "A alpha7→alpha1 L:e→s R:w→n",
      "B alpha1→alpha3 L:s→w R:n→e",
    ]);
  });

  it("engine: the third pass copies the seed's end locations and the orbit stalls", () => {
    const engine = runEngine(
      seed,
      AppLOOPType.ROTATED_INVERTED,
      AppPeriod.QUARTERED
    );
    expect(engine.kind).toBe("ok");
    if (engine.kind !== "ok") return;

    expect(trace(engine.steps)).toEqual([
      "- alpha3→alpha3 L:w→w R:e→e",
      "A alpha3→alpha5 L:w→n R:e→s",
      "B alpha5→alpha7 L:n→e R:s→w",
      // Pass 3 is FusedExecutor.createCopiedStep: it takes its start locations
      // from the previous step (e/w) but reuses the SOURCE step's end
      // locations (n/s) and the source's endPosition (alpha5). A pro cw
      // quarter from e ends at s, not n — the copy is only sound when the
      // preceding pass returned to the seed's start position, which is true
      // for mirror/flip/swap/invert and false once ROTATED is absorbed into
      // the same fused group.
      "A alpha7→alpha5 L:e→n R:w→s",
      "B alpha5→alpha7 L:n→e R:s→w",
    ]);

    // The LOOP ends at alpha7 instead of alpha3.
    expect(engine.steps[engine.steps.length - 1]!.endPosition).toBe("alpha7");
    expect(seed[0]!.startPosition).toBe("alpha3");
  });
});
