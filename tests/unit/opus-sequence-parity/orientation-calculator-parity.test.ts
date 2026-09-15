/**
 * Orientation math parity across all THREE copies in the repository.
 *
 *   app          `src/lib/shared/render/core/calculations/orientation.ts`
 *   engine       `packages/sequence-engine/src/core/orientation/OrientationCalculator.ts`
 *   render-core  `packages/render-core/src/calculations/orientation.ts`
 *                — reached by `mcp-server-pkg` through its still-live
 *                  `vendor/sequence-engine/services/implementations/OrientationPropagator.ts`
 *
 * These are independent copies of the same end-orientation algebra. Every LOOP
 * executor propagates orientations through one of them (app:
 * `prop/services/orientation-calculator`; engine:
 * `loop/execution/orientation-helpers`), so if the copies ever disagreed,
 * every downstream LOOP parity result would be contaminated by that
 * disagreement rather than by executor logic.
 *
 * This suite exhausts the documented input space and proves all three agree,
 * which (a) makes the executor differential in
 * `loop-executor-parity.test.ts` attributable to executor logic alone, and
 * (b) locks the duplication against future drift until it is deleted.
 *
 * Part of the read-only sequence-engine parity audit; see
 * `docs/reports/opus-batch-2026-09-12/sequence-engine-parity.md`.
 */

import { describe, expect, it } from "vitest";

import { calculateEndOrientation as appCalculate } from "$lib/shared/render/core/calculations/orientation";
import { calculateEndOrientation as engineCalculate } from "@tka/sequence-engine/core";
import { calculateEndOrientation as renderCoreCalculate } from "@tka/render-core";

/** Every grid location a hand can occupy, including centre. */
const LOCATIONS = ["n", "e", "s", "w", "ne", "se", "sw", "nw", "c"] as const;

/** Every orientation in the canonical cycles (radial, interradial, centric). */
const ORIENTATIONS = [
  "in",
  "out",
  "clock",
  "counter",
  "clockIn",
  "clockOut",
  "counterIn",
  "counterOut",
  "centerN",
  "centerNE",
  "centerE",
  "centerSE",
  "centerS",
  "centerSW",
  "centerW",
  "centerNW",
] as const;

const MOTION_TYPES = ["pro", "anti", "static", "dash", "float"] as const;
const ROTATIONS = ["cw", "ccw", "noRotation"] as const;
const TURNS: ReadonlyArray<number | "fl"> = [
  0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, "fl",
];

describe("orientation calculator parity (app vs engine vs render-core)", () => {
  it("all three copies agree on every (motionType × rotation × turns × orientation) combination", () => {
    const mismatches: string[] = [];
    let cases = 0;

    for (const motionType of MOTION_TYPES) {
      for (const rotationDirection of ROTATIONS) {
        for (const turns of TURNS) {
          for (const startOrientation of ORIENTATIONS) {
            // One representative shift pair per direction plus the two
            // degenerate geometries (static, dash) — end-orientation math
            // only reads the handpath class, not the specific pair.
            const geometries = [
              { startLocation: "n", endLocation: "e" }, // cw quarter
              { startLocation: "n", endLocation: "w" }, // ccw quarter
              { startLocation: "n", endLocation: "n" }, // static
              { startLocation: "n", endLocation: "s" }, // dash
              { startLocation: "c", endLocation: "n" }, // hash-out
              { startLocation: "n", endLocation: "c" }, // hash-in
            ];

            for (const geometry of geometries) {
              const input = {
                motionType,
                rotationDirection,
                turns,
                startOrientation,
                ...geometry,
              };
              cases++;
              const appResult = appCalculate(input);
              const engineResult = engineCalculate(input);
              const renderCoreResult = renderCoreCalculate(input);
              if (appResult !== engineResult || appResult !== renderCoreResult) {
                mismatches.push(
                  `${JSON.stringify(input)} → app=${appResult} engine=${engineResult} render-core=${renderCoreResult}`
                );
              }
            }
          }
        }
      }
    }

    // Guard against the suite silently degrading into a no-op.
    expect(cases).toBeGreaterThan(15_000);
    expect(mismatches.slice(0, 10)).toEqual([]);
  });

  it("all three copies agree on every grid-location pair at the boundary turn counts", () => {
    const mismatches: string[] = [];

    for (const startLocation of LOCATIONS) {
      for (const endLocation of LOCATIONS) {
        for (const turns of [0, 0.5, 1, "fl"] as const) {
          for (const motionType of MOTION_TYPES) {
            const input = {
              motionType,
              rotationDirection: "cw",
              turns,
              startOrientation: "in",
              startLocation,
              endLocation,
            };
            const appResult = appCalculate(input);
            const engineResult = engineCalculate(input);
            const renderCoreResult = renderCoreCalculate(input);
            if (appResult !== engineResult || appResult !== renderCoreResult) {
              mismatches.push(
                `${JSON.stringify(input)} → app=${appResult} engine=${engineResult} render-core=${renderCoreResult}`
              );
            }
          }
        }
      }
    }

    expect(mismatches.slice(0, 10)).toEqual([]);
  });
});
