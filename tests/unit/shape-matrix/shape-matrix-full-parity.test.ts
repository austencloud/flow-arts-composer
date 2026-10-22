import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { makeSpinRatio, THEORY_SPIN_RATIO_MAX_PART } from "@vtg/domain";
import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
import { traceScaledPath } from "#lib/shared/notation/qft/qft-model.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { flowerKey } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import {
  buildTheoryAxis,
  theoryKnobs,
  theorySoloKnobs,
} from "#lib/shared/shape-matrix/domain/theory-flower.js";
import { buildModeRealizationCandidates } from "#lib/shared/shape-matrix/services/build-mode-realizations.js";
import {
  CURVE_MATCH_EPS,
  curveDistance,
} from "#lib/shared/shape-matrix/services/__tests__/curve-distance.js";
import { loadShapeMatrix } from "#lib/shared/shape-matrix/services/shape-matrix-flowers.js";
import { MODE_ORDER } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

/*
 * The sweep Austen expected after the three-against-four report (feedback
 * fcnmmdj5t0851xVGTv2z, 2026-09-15): every cell, in every timing and
 * direction, plays the mandala its tile drew. The default suite keeps the
 * risky subsets fast (shape-matrix-three-four-parity, theory-pairing-phase);
 * this file is the whole product, so it only runs on ask. On 2026-10-22 the
 * Theory half took 4 s and the Matrix half 44 min (40,416 cell-modes) alone
 * on d1; send it to d2 rather than a loaded machine.
 *
 *   SHAPE_MATRIX_FULL_SWEEP=1 npx vitest run --config tests/config/vitest.config.ts tests/unit/shape-matrix/shape-matrix-full-parity.test.ts
 */
const FULL_SWEEP = Boolean(process.env.SHAPE_MATRIX_FULL_SWEEP);
/** The three-turn loci are long enough that 64 samples cut 18-unit corners. */
const FINE_SAMPLES = 256;

const staticPath = path.resolve(process.cwd(), "static");
vi.stubGlobal("fetch", async (input: string | URL | Request) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const file = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
  return new Response(readFileSync(path.join(staticPath, file)), {
    status: 200,
    headers: {
      "content-type": file.endsWith(".json") ? "application/json" : "text/csv",
    },
  });
});

type Pt = { x: number; y: number };

/**
 * Hausdorff distance between two sampled closed curves, bucketed so a 15:14
 * trace's thousands of points do not turn into tens of millions of pairs.
 * Start point and travel direction do not matter; where the curve lies does.
 */
function locusDistance(a: Pt[], b: Pt[], cell = 0.05): number {
  const directed = (from: Pt[], to: Pt[]) => {
    const buckets = new Map<string, Pt[]>();
    for (const q of to) {
      const key = `${Math.floor(q.x / cell)},${Math.floor(q.y / cell)}`;
      const bucket = buckets.get(key);
      if (bucket) bucket.push(q);
      else buckets.set(key, [q]);
    }
    let worst = 0;
    for (const p of from) {
      const cx = Math.floor(p.x / cell);
      const cy = Math.floor(p.y / cell);
      let nearest = Infinity;
      // After ring r every point within r cells is seen, so stop once the
      // nearest found is closer than anything a further ring could hold.
      for (let ring = 0; ring < 64 && nearest > (ring - 1) * cell; ring++) {
        for (let dx = -ring; dx <= ring; dx++)
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            for (const q of buckets.get(`${cx + dx},${cy + dy}`) ?? []) {
              nearest = Math.min(nearest, Math.hypot(p.x - q.x, p.y - q.y));
            }
          }
      }
      worst = Math.max(worst, nearest);
    }
    return worst;
  };
  return Math.max(directed(a, b), directed(b, a));
}

describe.skipIf(!FULL_SWEEP)("every shape matrix cell in every mode", () => {
  /* Theory: every ratio the builder accepts (0 through 15 on each side), each
     axis flower on either hand, all six pairings. Each hand's live guide must
     lie where its tile's flower lies. */
  it("keeps each Theory hand on its tile for every ratio", () => {
    const units = { hand: 1, prop: 0.84 };
    const failures: string[] = [];
    for (let props = 0; props <= THEORY_SPIN_RATIO_MAX_PART; props++)
      for (let hands = 0; hands <= THEORY_SPIN_RATIO_MAX_PART; hands++) {
        if (props === 0 && hands === 0) continue;
        const ratio = makeSpinRatio(props, hands);
        // A reducible pair reaches the grid as its reduced ratio.
        if (ratio.propRotations !== props || ratio.handCycles !== hands)
          continue;
        for (const flower of buildTheoryAxis(ratio)) {
          const tile = traceScaledPath(theorySoloKnobs(flower), units);
          for (const mode of MODE_ORDER)
            for (const hand of ["left", "right"] as const) {
              const live = traceScaledPath(
                theoryKnobs(flower, hand, mode),
                units
              );
              const distance = locusDistance(tile, live);
              if (distance > 0.1) {
                failures.push(
                  `${hands}:${props} ${flower.style} ${flower.ori} ${mode} ${hand} ${distance.toFixed(3)}`
                );
              }
            }
        }
      }
    expect(failures).toEqual([]);
  }, 600_000);

  /* Matrix: every pair of flowers on one grid (a diamond flower and a box
     flower never share a realization), every mode, every candidate the drill
     can show, each hand compared against the tile's own curve. */
  it("realizes every staff Matrix cell as the mandala its tile drew", async () => {
    const data = await loadShapeMatrix(PropType.STAFF);
    const failures: string[] = [];
    for (const left of data.axis)
      for (const right of data.axis) {
        if (left.grid !== right.grid) continue;
        const selected = {
          left: data.left.get(flowerKey(left))?.left ?? [],
          right: data.right.get(flowerKey(right))?.right ?? [],
          tips: data.tips,
        };
        const cell = `${flowerKey(left)} × ${flowerKey(right)}`;
        for (const mode of MODE_ORDER) {
          const candidates = await buildModeRealizationCandidates(
            { left, right },
            selected,
            mode
          );
          if (!candidates.length) failures.push(`${cell} ${mode} none`);
          for (const candidate of candidates) {
            const actual = calculateMandalaGeometry(
              candidate.seq.steps,
              undefined,
              undefined,
              { tipEnds: 1, pathShape: "arc" },
              { left: [data.tips.left], right: [data.tips.right] }
            );
            const leftDistance = curveDistance(
              selected.left,
              actual.left,
              FINE_SAMPLES
            );
            const rightDistance = curveDistance(
              selected.right,
              actual.right,
              FINE_SAMPLES
            );
            if (
              leftDistance > CURVE_MATCH_EPS ||
              rightDistance > CURVE_MATCH_EPS
            ) {
              failures.push(
                `${cell} ${mode} ${candidate.propMode ?? "no prop mode"} L${leftDistance.toFixed(1)} R${rightDistance.toFixed(1)}`
              );
            }
          }
        }
      }
    expect(failures).toEqual([]);
  }, 3_600_000);
});
