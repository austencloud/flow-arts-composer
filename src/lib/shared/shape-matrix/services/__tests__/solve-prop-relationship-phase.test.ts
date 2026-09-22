import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn().mockResolvedValue({}),
}));

import type { CsvEdge } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { parseCsvEdges } from "$lib/features/choreo-card/services/pictograph-letter-lookup";
import { applyVariationDescriptor } from "$lib/features/choreo-card/services/deck-variation";
import { hydrateSequence } from "$lib/features/choreo-card/services/sequence-render-hydrator";
import { buildFlowerSequence } from "$lib/features/lab/vtg-lab/services/build-flower-sequence";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { getTipPoints } from "$lib/shared/animation-engine/domain/types/prop-tip-points";
import { getDefaultTrailPointConfig } from "$lib/shared/animation-engine/domain/types/trail-point-types";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import baseWords from "../../../../../../static/data/hero/tnd-base-words.json";
import { derivePropRelationship } from "../../domain/prop-relationship";
import {
  flowerPetals,
  type Flower,
  type FlowerStyle,
  type RotatingFlower,
} from "../../domain/flower-signature";
import type { RotationStyle } from "../../domain/rotation-style";
import {
  classifyRotationStyleMembers,
  representativeRotationStyleMember,
  type RotationStyleArchetype,
} from "../rotation-style-archetypes";
import { resolveFlowerArchetype } from "../flower-archetype";
import { buildBaseIndex, resolveBase } from "../build-realization-sequence";
import {
  buildExactFlowerPhases,
  solvePropRelationshipPhase,
  type FlowerParityTarget,
} from "../solve-prop-relationship-phase";
import { flowerPhaseOrientations } from "../verify-realization-parity";
import { CURVE_MATCH_EPS, curveDistance } from "./curve-distance";
import {
  MODE_FAMILY_ID,
  MODE_ORDER,
  type VtgMode,
} from "../shape-matrix-realizations";

const words = baseWords.map((record) => hydrateSequence(record));
let index: Map<string, SequenceData>;
let edges: CsvEdge[];
let matrices: RotationStyleArchetype[];
let staffTip: { dx: number; dy: number };

// Every fixture here is a rotating flower: a float has no style to resolve an
// archetype from, so naming the narrower type keeps `pair.left.style` a
// FlowerStyle instead of widening to include "float".
function flower(
  style: FlowerStyle,
  turns: number,
  ori: "in" | "out"
): RotatingFlower {
  return {
    style,
    turns,
    ori,
    grid: "diamond",
    petals: flowerPetals({ style, turns }),
  };
}

function overlayFor(pair: {
  left: RotatingFlower;
  right: RotatingFlower;
}): FlowerParityTarget {
  const leftArchetype = resolveFlowerArchetype(matrices, pair.left.style);
  const rightArchetype = resolveFlowerArchetype(matrices, pair.right.style);
  const leftSequence = buildFlowerSequence(
    leftArchetype,
    pair.left,
    "left",
    edges,
    PropType.STAFF
  );
  const rightSequence = buildFlowerSequence(
    rightArchetype,
    pair.right,
    "left",
    edges,
    PropType.STAFF
  );
  return {
    left: calculateMandalaGeometry(
      leftSequence.steps,
      undefined,
      undefined,
      { tipEnds: 1, pathShape: "arc" },
      staffTip
    ).left,
    right: calculateMandalaGeometry(
      rightSequence.steps,
      undefined,
      undefined,
      { tipEnds: 1, pathShape: "arc" },
      staffTip
    ).left,
    tips: { left: staffTip, right: staffTip },
    clubTipDx: Math.hypot(staffTip.dx, staffTip.dy),
  };
}

function distances(
  sequence: SequenceData,
  target: FlowerParityTarget
): { left: number; right: number } {
  const actual = calculateMandalaGeometry(
    sequence.steps,
    undefined,
    undefined,
    { tipEnds: 1, pathShape: "arc" },
    staffTip
  );
  return {
    left: curveDistance(target.left, actual.left),
    right: curveDistance(target.right, actual.right),
  };
}

beforeAll(() => {
  edges = parseCsvEdges(
    readFileSync(
      resolve("static/data/pictographs/DiamondPictographDataframe.csv"),
      "utf8"
    )
  );
  index = buildBaseIndex(words);
  const classified = classifyRotationStyleMembers(words, "diamond");
  matrices = (["iso", "antispin", "hybrid"] as RotationStyle[]).flatMap(
    (style) => {
      const members = classified.get(style) ?? [];
      if (members.length === 0) return [];
      const representative = representativeRotationStyleMember(members);
      const sequence = applyVariationDescriptor(
        representative,
        {
          turnPattern: "0|0",
          turnLabel: "test-archetype",
          gridMode: "diamond",
        },
        edges
      ).sequence;
      return [{ style, byTurn: new Map([["0|0", sequence]]) }];
    }
  );
  const points = getTipPoints(PropType.STAFF).points;
  const source = getDefaultTrailPointConfig(PropType.STAFF, points).right;
  if (source.type !== "tip") throw new Error("Staff right source is not a tip");
  staffTip = points[source.index]!;
});

describe("flower phase orientation search", () => {
  it("searches the complete Level 4 wheel for quarter-turn flowers", () => {
    const orientations = flowerPhaseOrientations({
      left: flower("pro", 0.25, "out"),
      right: flower("pro", 0.25, "out"),
    });
    expect(orientations).toEqual([
      Orientation.IN,
      Orientation.CLOCK_IN,
      Orientation.CLOCK,
      Orientation.CLOCK_OUT,
      Orientation.OUT,
      Orientation.COUNTER_OUT,
      Orientation.COUNTER,
      Orientation.COUNTER_IN,
    ]);
  });

  it("keeps non-quarter bands on cardinal starts", () => {
    expect(
      flowerPhaseOrientations({
        left: flower("pro", 1, "out"),
        right: flower("anti", 1, "in"),
      })
    ).toEqual([
      Orientation.IN,
      Orientation.CLOCK,
      Orientation.OUT,
      Orientation.COUNTER,
    ]);
  });
});

describe("exact flower parity", () => {
  const pairs = [
    {
      left: flower("pro", 0.25, "out"),
      right: flower("pro", 0.25, "out"),
    },
    {
      left: flower("pro", 0.75, "out"),
      right: flower("pro", 0.75, "out"),
    },
    {
      left: flower("anti", 0.75, "in"),
      right: flower("anti", 0.75, "out"),
    },
  ] satisfies Array<{ left: Flower; right: Flower }>;

  it("accepts only sequences whose two trails match the clicked flowers", () => {
    let accepted = 0;
    for (const pair of pairs) {
      const target = overlayFor(pair);
      for (const handMode of MODE_ORDER) {
        const base = resolveBase(
          index,
          handMode,
          pair.left.style,
          pair.right.style
        );
        if (!base) continue;
        const phases = buildExactFlowerPhases(base, pair, edges, target);
        expect(
          phases.length,
          `${handMode} should preserve ${pair.left.style}/${pair.left.turns} × ${pair.right.style}/${pair.right.turns}`
        ).toBeGreaterThan(0);
        for (const phase of phases) {
          const distance = distances(phase.sequence, target);
          expect(distance.left).toBeLessThanOrEqual(CURVE_MATCH_EPS);
          expect(distance.right).toBeLessThanOrEqual(CURVE_MATCH_EPS);
          accepted++;
        }
      }
    }
    expect(accepted).toBeGreaterThan(0);
  }, 30_000);

  it("rejects relationship-only matches that change the selected flower", () => {
    for (const pair of pairs.slice(1)) {
      const base = resolveBase(index, "QS", pair.left.style, pair.right.style);
      if (!base) throw new Error("Missing QS base");
      expect(
        solvePropRelationshipPhase(base, pair, "TS", edges, overlayFor(pair))
      ).toBeNull();
    }
  });

  it("classifies every returned target exactly and deterministically", () => {
    const pair = pairs[0]!;
    const target = overlayFor(pair);
    for (const targetMode of MODE_ORDER as readonly VtgMode[]) {
      for (const handMode of MODE_ORDER) {
        const base = resolveBase(index, handMode, "pro", "pro");
        if (!base) continue;
        const first = solvePropRelationshipPhase(
          base,
          pair,
          targetMode,
          edges,
          target
        );
        const second = solvePropRelationshipPhase(
          base,
          pair,
          targetMode,
          edges,
          target
        );
        expect(second?.leftOrientation).toBe(first?.leftOrientation);
        expect(second?.rightOrientation).toBe(first?.rightOrientation);
        if (!first) continue;
        const relationship = derivePropRelationship(first.sequence, pair);
        expect(relationship.kind).toBe("full");
        if (relationship.kind === "full") {
          expect(relationship.element.familyId).toBe(
            MODE_FAMILY_ID[targetMode]
          );
        }
      }
    }
  }, 30_000);

  it("keeps every hand relationship available for quarter-turn flowers", () => {
    const pair = pairs[0]!;
    const target = overlayFor(pair);
    const table: Record<string, string[]> = {};
    for (const handMode of MODE_ORDER) {
      const base = resolveBase(index, handMode, "pro", "pro");
      if (!base) continue;
      table[handMode] = [
        ...new Set(
          buildExactFlowerPhases(base, pair, edges, target).map((phase) => {
            const relationship = derivePropRelationship(phase.sequence, pair);
            return relationship.kind === "full"
              ? relationship.element.familyId
              : relationship.kind;
          })
        ),
      ].sort();
    }
    // Sorted because the claim is which bands each hand relationship can
    // reach, not which of them the wheel walks into first. An opposite-spin
    // phase is read against the mirror (bearing sum minus pi), so the two TO
    // phases changed places when that reading moved into the engine; both
    // bands are still there, which is what this is for.
    expect(table).toEqual({
      SS: ["quarter-same"],
      TS: ["split-same", "tog-same"],
      QS: ["quarter-same"],
      SO: ["quarter-opp"],
      TO: ["split-opp", "tog-opp"],
      QO: ["quarter-opp"],
    });

    const splitSameBase = resolveBase(index, "SS", "pro", "pro");
    if (!splitSameBase) throw new Error("Missing SS pro/pro base");
    expect(
      solvePropRelationshipPhase(splitSameBase, pair, "TS", edges, target)
    ).toBeNull();
  });

  it("does not invent timed relationships for unequal turns or Float", () => {
    const base = resolveBase(index, "SS", "pro", "pro");
    if (!base) throw new Error("Missing SS pro/pro base");
    const emptyTarget: FlowerParityTarget = {
      left: [],
      right: [],
      tips: { left: { dx: 0, dy: 0 }, right: { dx: 0, dy: 0 } },
      clubTipDx: 0,
    };
    const unequal = {
      left: flower("pro", 0.25, "out"),
      right: flower("pro", 1, "out"),
    };
    const floating = {
      left: {
        style: "float",
        turns: "fl",
        ori: "in",
        grid: "diamond",
        petals: 0,
      },
      right: {
        style: "float",
        turns: "fl",
        ori: "out",
        grid: "diamond",
        petals: 0,
      },
    } satisfies { left: Flower; right: Flower };

    expect(
      solvePropRelationshipPhase(base, unequal, "SS", edges, emptyTarget)
    ).toBeNull();
    expect(
      solvePropRelationshipPhase(base, floating, "SS", edges, emptyTarget)
    ).toBeNull();
  });

  it("keeps the exact hand-to-prop graph complete across level bands", () => {
    const variants = [
      ["pro", "in"],
      ["pro", "out"],
      ["anti", "in"],
      ["anti", "out"],
    ] as const;
    let checkedPairs = 0;

    for (const turns of [0, 0.25, 0.5, 1]) {
      for (const [leftStyle, leftOri] of variants) {
        for (const [rightStyle, rightOri] of variants) {
          const pair = {
            left: flower(leftStyle, turns, leftOri),
            right: flower(rightStyle, turns, rightOri),
          };
          const target = overlayFor(pair);
          const graph: Record<string, string[]> = {};
          for (const handMode of MODE_ORDER) {
            const base = resolveBase(index, handMode, leftStyle, rightStyle);
            if (!base) continue;
            graph[handMode] = [
              ...new Set(
                buildExactFlowerPhases(base, pair, edges, target).map(
                  (phase) => {
                    const relationship = derivePropRelationship(
                      phase.sequence,
                      pair
                    );
                    return relationship.kind === "full"
                      ? relationship.element.familyId
                      : relationship.kind;
                  }
                )
              ),
            ];
          }
          const targets = Object.values(graph);
          const edgeCount = targets.reduce(
            (total, targets) => total + targets.length,
            0
          );
          const branchingHands = targets.filter(
            (propModes) => propModes.length > 1
          );

          expect(Object.keys(graph)).toEqual(MODE_ORDER);
          expect(edgeCount).toBe(turns === 0.25 ? 8 : 6);
          expect(branchingHands).toHaveLength(turns === 0.25 ? 2 : 0);
          checkedPairs += 1;
        }
      }
    }

    expect(checkedPairs).toBe(64);
  }, 180_000);
});
