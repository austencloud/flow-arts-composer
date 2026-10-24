/**
 * Invariant sweep over the public builder.
 *
 * The focused tests pin one word or one LOOP at a time. This drives a whole
 * matrix of requests through `SequenceBuilder.build`, shaped the way the MCP
 * adapter shapes them (mcp-server/src/core/engine-generation-adapter.ts: the
 * seed is the requested total divided by the spec's expansion multiplier,
 * `requestedTotalLength` carries the total), and checks every sequence that
 * comes back against the engine's own invariants:
 *
 * - it closes in placement and in both props' orientations;
 * - it is the LOOP that was asked for: the detector reads the requested
 *   components (and reflection axis), or the builder flagged an equivalent
 *   label and every half-pair satisfies both labels in the pair algebra;
 * - every step's turns come from the level's pool (TurnAllocator.ts:
 *   level 1 = 0, level 2 = 0-3 whole, level 3 = halves and "fl");
 * - bridge steps carry turns like letters do;
 * - no Type 6 (static) step at level 1, and none standing still above it;
 * - the seed ends where the LOOP's placement map sends its start.
 *
 * A request that throws GenerationInfeasibleError must only name settings
 * the request actually set. Infeasible and failed cells are collected into
 * tables; run with SWEEP_REPORT=1 to print them.
 *
 * Size: every LOOP rhythm × length × level × dash setting runs in full. The
 * prop and hand relationships run every rhythm × level once per
 * relationship, with the length and dash setting picked by the cell's index
 * (see `sampled`), and a fixed word list covers the bridged, symmetric and
 * one-letter words tonight's changes were about. Every cell has its own
 * seeded Math.random, so a cell builds the same way every run.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GenerationInfeasibleError,
  SequenceBuilder,
  type BuildOptions,
  type BuildResult,
} from "../../src/generation/index.js";
import type { ConstraintOptions } from "../../src/generation/constraints/composition/constraint-options.js";
import type { HandRelationshipMap } from "../../src/generation/constraints/style/hand-relationship-constraint.js";
import type {
  PropDirection,
  PropTiming,
} from "../../src/generation/prop-relationship.js";
import { getTurnPool } from "../../src/generation/turns/TurnAllocator.js";
import { LOOPType, Period } from "../../src/loop/loop-types.js";
import {
  determineEndPlacementsForSpec,
  getLOOPSpecExpansionMultiplier,
  loopSpecFromLegacyRhythm,
} from "../../src/loop/index.js";
import {
  hasRewoundStructure,
  loopDetectorClass,
  loopSignalSteps,
} from "../../src/loop/detection/LOOPDetector.js";
import {
  labelsEquivalentForPair,
  type PairLabel,
} from "../../src/loop/detection/label-equivalence.js";
import type { PairComponentId } from "../../src/loop/detection/pair-relation.js";
import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
} from "../../src/loop/placement-maps/strict-loop-placement-maps.js";
import { LetterClassifier } from "../../src/core/letters/LetterClassifier.js";
import { TransitionGraph } from "../../src/core/transition-graph/TransitionGraph.js";
import { setLetterTransitionGraph } from "../../src/core/transition-graph/LetterTransitionGraph.js";
import {
  CsvVariationProvider,
  loadDiamondVariations,
} from "../helpers/csv-variations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAPPINGS_PATH = path.resolve(
  __dirname,
  "../../../../static/data/learn/letter-mappings.json"
);

const variations = loadDiamondVariations();
const builder = new SequenceBuilder(new CsvVariationProvider(variations));
const classifier = new LetterClassifier();

beforeAll(async () => {
  const graph = new TransitionGraph({
    loadLetterMappings: async () =>
      JSON.parse(readFileSync(MAPPINGS_PATH, "utf8")),
  } as never);
  await graph.initialize();
  setLetterTransitionGraph(graph);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── The matrix ─────────────────────────────────────────────────────────────

const LENGTHS = [4, 8, 12, 16] as const;
const LEVELS = [1, 2, 3] as const;

/** Every legacy LOOP type at a half turn, and the rotated ones at a quarter. */
const RHYTHMS: Array<{ type: LOOPType; period: 2 | 4 }> = [
  ...Object.values(LOOPType).map((type) => ({ type, period: 2 as const })),
  ...Object.values(LOOPType)
    .filter((type) => type.includes("rotated"))
    .map((type) => ({ type, period: 4 as const })),
];

const PROP_RELATIONSHIPS: Array<{
  direction: PropDirection;
  timing?: PropTiming;
}> = (["same", "opp"] as const).flatMap((direction) =>
  ([undefined, "tog", "split", "quarter"] as const).map((timing) =>
    timing ? { direction, timing } : { direction }
  )
);

const HAND_MAPS: HandRelationshipMap[] = [
  "identity",
  "rotate-180",
  "rotate-90-cw",
  "rotate-90-ccw",
  "reflect-north-south",
  "reflect-east-west",
  "reflect-northeast-southwest",
  "reflect-northwest-southeast",
];
const HAND_RELATIONSHIPS = HAND_MAPS.flatMap((map) =>
  [false, true].map((inverted) => ({ map, inverted }))
);

/**
 * Words the four LOOP commits were about: bridged words (WXYZ, ABCD, WY),
 * words whose every variation has symmetric hands (D, J, P, AA, BA), a word
 * whose hands always share one path (GG), a one-letter word, and two that
 * connect directly (AJGE, MNOP) as controls.
 */
const WORDS = [
  "WXYZ",
  "ABCD",
  "WY",
  "D",
  "J",
  "P",
  "AA",
  "BA",
  "GG",
  "A",
  "AJGE",
  "MNOP",
];

interface Cell {
  key: string;
  type: LOOPType;
  period: 2 | 4;
  level: number;
  length?: number;
  word?: string;
  dashes: boolean;
  prop?: { direction: PropDirection; timing?: PropTiming };
  hand?: { map: HandRelationshipMap; inverted: boolean };
}

function describeCell(cell: Omit<Cell, "key">): string {
  return [
    `${cell.type}/${cell.period}`,
    `L${cell.level}`,
    cell.word ? `word ${cell.word}` : `len ${cell.length}`,
    cell.dashes ? "dashes" : "no dashes",
    cell.prop
      ? `prop ${cell.prop.direction}${cell.prop.timing ? "/" + cell.prop.timing : ""}`
      : "",
    cell.hand ? `hand ${cell.hand.map}${cell.hand.inverted ? "/inv" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const cell = (c: Omit<Cell, "key">): Cell => ({ ...c, key: describeCell(c) });

/** Full cross product of rhythm × length × level × dashes, no relationships. */
const baseCells: Cell[] = RHYTHMS.flatMap(({ type, period }) =>
  LENGTHS.flatMap((length) =>
    LEVELS.flatMap((level) =>
      [true, false].map((dashes) =>
        cell({ type, period, level, length, dashes })
      )
    )
  )
);

/**
 * One cell per relationship × rhythm × level. The length and dash setting
 * rotate with the cell's running index, so across the set every length and
 * both dash settings meet every relationship without the full product.
 */
function sampled<T>(
  relationships: readonly T[],
  make: (
    relationship: T,
    length: number,
    dashes: boolean,
    r: (typeof RHYTHMS)[number],
    level: number
  ) => Cell
): Cell[] {
  let index = 0;
  return relationships.flatMap((relationship) =>
    RHYTHMS.flatMap((rhythm) =>
      LEVELS.map((level) => {
        const i = index++;
        return make(
          relationship,
          LENGTHS[i % LENGTHS.length]!,
          (i >> 2) % 2 === 0,
          rhythm,
          level
        );
      })
    )
  );
}

const propCells = sampled(
  PROP_RELATIONSHIPS,
  (prop, length, dashes, { type, period }, level) =>
    cell({ type, period, level, length, dashes, prop })
);
const handCells = sampled(
  HAND_RELATIONSHIPS,
  (hand, length, dashes, { type, period }, level) =>
    cell({ type, period, level, length, dashes, hand })
);
const wordCells: Cell[] = WORDS.flatMap((word) =>
  RHYTHMS.flatMap(({ type, period }) =>
    LEVELS.map((level) => cell({ type, period, level, word, dashes: true }))
  )
);

// ─── Building one cell ──────────────────────────────────────────────────────

function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic Math.random (mulberry32), one seed per cell. */
function seedRandom(seed: number) {
  let a = seed >>> 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

function requestFor(c: Cell): BuildOptions | { refused: string } {
  const loopSpec = loopSpecFromLegacyRhythm(c.type, c.period);
  const constraintOptions: ConstraintOptions = { propContinuity: "maximize" };
  if (!c.dashes) constraintOptions.motionFamily = { exclude: ["dash"] };
  if (c.prop) constraintOptions.propRelationship = c.prop;
  if (c.hand) constraintOptions.handRelationship = c.hand;
  const loop = {
    type: c.type,
    period: c.period === 4 ? Period.QUARTERED : Period.HALVED,
    useTargetedGeneration: true,
    loopSpec,
  };
  if (c.word) {
    return {
      word: c.word,
      gridMode: "diamond",
      level: c.level,
      constraintOptions,
      loop,
    };
  }
  // The adapter refuses a total its multiplier does not divide.
  const multiplier = getLOOPSpecExpansionMultiplier(loopSpec);
  if (c.length! % multiplier !== 0) {
    return {
      refused: `${c.length} is not a multiple of the ${multiplier}x expansion`,
    };
  }
  return {
    length: c.length! / multiplier,
    gridMode: "diamond",
    level: c.level,
    constraintOptions,
    loop: { ...loop, requestedTotalLength: c.length },
  };
}

// ─── Invariants ─────────────────────────────────────────────────────────────

type Step = BuildResult["sequence"][number];

function requestedComponents(type: LOOPType): string[] {
  if (type === LOOPType.REWOUND) return ["rewound"];
  return ["rotated", "mirrored", "flipped", "swapped", "inverted"].filter((c) =>
    type.includes(c)
  );
}

/** Mirrored and flipped are both reflections; the axis tells them apart. */
function normalized(components: Iterable<string>): string {
  const out = new Set<string>();
  for (const c of components)
    out.add(c === "mirrored" || c === "flipped" ? "reflection" : c);
  return [...out].sort().join("+");
}

function requestedAxis(type: LOOPType) {
  if (type.includes("rotated")) return null;
  if (type.includes("mirrored")) return DEFAULT_MIRRORED_AXIS;
  if (type.includes("flipped")) return DEFAULT_FLIPPED_AXIS;
  return null;
}

/** Why the result is not the LOOP that was asked for, or undefined. */
function labelViolation(c: Cell, result: BuildResult): string | undefined {
  const sequence = result.sequence;
  if (c.type === LOOPType.REWOUND) {
    return hasRewoundStructure(sequence) ? undefined : "not rewound";
  }
  const detected = loopDetectorClass.detectLOOPType(sequence);
  const detectedComponents = new Set<string>();
  for (const spec of [detected.spec?.left, detected.spec?.right]) {
    for (const component of spec?.components.keys() ?? []) {
      detectedComponents.add(String(component));
    }
  }
  const wanted = requestedComponents(c.type);
  const axis = requestedAxis(c.type);
  if (
    detected.isCircular &&
    normalized(detectedComponents) === normalized(wanted) &&
    (axis === null || detected.reflectionAxis === axis)
  ) {
    return undefined;
  }
  const detectedLabel =
    `${[...detectedComponents].sort().join("+") || "none"}` +
    (detected.reflectionAxis ? ` (${detected.reflectionAxis})` : "");

  // A symmetric seed can satisfy the request and the detector's label at
  // once; the builder must say so, and every half-pair must bear it out.
  if (!result.loop?.equivalentLabels?.length) {
    return `detected ${detectedLabel}, asked ${wanted.join("+")}`;
  }
  const steps = loopSignalSteps(sequence);
  const half = steps.length / 2;
  const asked: PairLabel = {
    components: wanted as PairComponentId[],
    reflectionAxis: axis ?? undefined,
  };
  const read: PairLabel = {
    components: [...detectedComponents] as PairComponentId[],
    reflectionAxis: detected.reflectionAxis ?? undefined,
  };
  if (!Number.isInteger(half) || half < 1) {
    return `equivalent label claimed on ${steps.length} signal steps`;
  }
  for (let i = 0; i < half; i++) {
    if (!labelsEquivalentForPair(steps[i]!, steps[i + half]!, asked, read)) {
      return `equivalent label ${detectedLabel} fails half-pair ${i}`;
    }
  }
  return undefined;
}

const isTurnValue = (pool: readonly unknown[], turns: unknown) =>
  pool.includes(turns);

/** Everything wrong with one built sequence, as readable lines. */
function violations(c: Cell, result: BuildResult): string[] {
  const out: string[] = [];
  const sequence = result.sequence;
  const first = sequence[0]!;
  const last = sequence[sequence.length - 1]!;

  if (c.length !== undefined && sequence.length - 1 !== c.length) {
    out.push(`built ${sequence.length - 1} steps, asked ${c.length}`);
  }
  if (first.startPlacement !== last.endPlacement) {
    out.push(`placement open ${first.startPlacement} -> ${last.endPlacement}`);
  }
  for (const side of ["left", "right"] as const) {
    if (
      first.motions[side].startOrientation !== last.motions[side].endOrientation
    ) {
      out.push(
        `${side} orientation open ${first.motions[side].startOrientation} -> ${last.motions[side].endOrientation}`
      );
    }
  }

  // A hand relationship can make LOOP components coincide (a north-south
  // mirror between the hands turns a swap into a mirror), so the builder
  // checks those requests by rebuilding the requested construction instead
  // of by the detector's label (SequenceBuilder.getLOOPValidationFailure).
  // Their label differences are tabled, not failed; see `relabelled`.
  const label = labelViolation(c, result);
  if (label && !c.hand) out.push(label);

  // Turns come from the level's pool. Float only exists at level 3, and a
  // float that could not float materializes as 0, which every pool holds.
  const pool = getTurnPool(c.level, undefined, { allowFloat: c.level === 3 });
  sequence.slice(1).forEach((step: Step, i) => {
    for (const side of ["left", "right"] as const) {
      const turns = step.motions[side].turns;
      if (turns === undefined) out.push(`step ${i + 1} ${side} has no turns`);
      else if (!isTurnValue(pool, turns)) {
        out.push(
          `step ${i + 1} ${side} turns ${String(turns)} outside level ${c.level}`
        );
      }
    }
    if (classifier.getType(step.letter ?? "") === 6) {
      if (c.level === 1)
        out.push(`step ${i + 1} is static ${step.letter} at level 1`);
      const moving = (["left", "right"] as const).some((side) => {
        const t = step.motions[side].turns;
        return t === "fl" || (typeof t === "number" && t > 0);
      });
      if (!moving)
        out.push(`step ${i + 1} is static ${step.letter} standing still`);
    }
  });

  // The seed ends where the LOOP's map sends its start. Derived steps are
  // the transformed passes; the seed is everything before the first one.
  const derived = result.loop?.derivedStepIndices ?? [];
  if (derived.length > 0 && c.type !== LOOPType.REWOUND) {
    const seedEnd = sequence[Math.min(...derived) - 1]!.endPlacement;
    const allowed = determineEndPlacementsForSpec(
      loopSpecFromLegacyRhythm(c.type, c.period),
      first.startPlacement as string
    );
    if (allowed.length > 0 && !allowed.includes(seedEnd as string)) {
      out.push(
        `seed ends ${seedEnd}, LOOP from ${first.startPlacement} needs ${allowed.join("/")}`
      );
    }
  }
  return out;
}

/**
 * Each setting an infeasible error may name, and whether this cell's request
 * actually set it. A relaxation the request never set is a lie.
 */
function relaxationIsReal(c: Cell, relaxation: string): boolean {
  switch (relaxation) {
    case "motionType":
      return !c.dashes;
    case "handRelationship":
      return c.hand !== undefined;
    case "propRelationship":
      return c.prop !== undefined;
    case "staticSteps":
      return c.level === 1;
    case "inversionHalfway":
    case "inversionAddsLength":
      return c.type.includes("inverted");
    default:
      return false;
  }
}

function infeasibleViolations(
  c: Cell,
  error: GenerationInfeasibleError
): string[] {
  const out: string[] = [];
  for (const relaxation of error.relaxations) {
    if (!relaxationIsReal(c, relaxation)) {
      out.push(`names "${relaxation}", which the request did not set`);
    }
  }
  const quoted = /"([^"]+)"/.exec(error.message)?.[1];
  if (quoted !== undefined && quoted !== c.word) {
    out.push(`names word "${quoted}", asked ${c.word ?? "no word"}`);
  }
  const loopNamed = /(?:as an?|form an?|close an?) (\w+) LOOP/.exec(
    error.message
  )?.[1];
  if (loopNamed !== undefined && loopNamed !== c.type) {
    out.push(`names a ${loopNamed} LOOP, asked ${c.type}`);
  }
  return out;
}

// ─── Running ────────────────────────────────────────────────────────────────

interface Outcome {
  built: number;
  bridgeSteps: number;
  turnedBridgeSteps: number;
  refused: string[];
  infeasible: Array<{
    key: string;
    message: string;
    relaxations: readonly string[];
  }>;
  failed: Array<{ key: string; message: string }>;
  broken: Array<{ key: string; problems: string[] }>;
  /** Hand-relationship builds the detector reads as another label. */
  relabelled: Array<{ key: string; label: string }>;
}

function runCells(cells: readonly Cell[]): Outcome {
  const outcome: Outcome = {
    built: 0,
    bridgeSteps: 0,
    turnedBridgeSteps: 0,
    refused: [],
    infeasible: [],
    failed: [],
    broken: [],
    relabelled: [],
  };
  for (const c of cells) {
    const request = requestFor(c);
    if ("refused" in request) {
      outcome.refused.push(`${c.key}: ${request.refused}`);
      continue;
    }
    seedRandom(hashKey(c.key));
    try {
      const result = builder.build(request);
      outcome.built++;
      const problems = violations(c, result);
      if (problems.length > 0) outcome.broken.push({ key: c.key, problems });
      const label = c.hand ? labelViolation(c, result) : undefined;
      if (label) outcome.relabelled.push({ key: c.key, label });
      for (const index of result.bridgeStepIndices) {
        const step = result.sequence[index]!;
        outcome.bridgeSteps++;
        const turned = (["left", "right"] as const).some((side) => {
          const t = step.motions[side].turns;
          return t === "fl" || (typeof t === "number" && t > 0);
        });
        if (turned) outcome.turnedBridgeSteps++;
      }
    } catch (error) {
      if (error instanceof GenerationInfeasibleError) {
        outcome.infeasible.push({
          key: c.key,
          message: error.message,
          relaxations: error.relaxations,
        });
        const problems = infeasibleViolations(c, error);
        if (problems.length > 0) outcome.broken.push({ key: c.key, problems });
      } else {
        outcome.failed.push({
          key: c.key,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      vi.restoreAllMocks();
    }
  }
  return outcome;
}

/** With SWEEP_REPORT=<file>, append the group's tables to that file. */
function report(name: string, cells: readonly Cell[], o: Outcome) {
  const file = process.env.SWEEP_REPORT;
  if (!file) return;
  const lines = [
    `## ${name}: ${cells.length} cells, ${o.built} built, ${o.refused.length} refused by the adapter, ` +
      `${o.infeasible.length} infeasible, ${o.failed.length} failed, ${o.broken.length} broken; ` +
      `bridge steps ${o.bridgeSteps} (${o.turnedBridgeSteps} with turns), ` +
      `${o.relabelled.length} read as another label`,
    ...o.infeasible.map(
      (x) =>
        `INFEASIBLE | ${x.key} | ${x.relaxations.join(",") || "-"} | ${x.message}`
    ),
    ...o.failed.map((x) => `FAILED | ${x.key} | ${x.message}`),
    ...o.broken.map((x) => `BROKEN | ${x.key} | ${x.problems.join("; ")}`),
    ...o.relabelled.map((x) => `RELABELLED | ${x.key} | ${x.label}`),
  ];
  appendFileSync(file, lines.join("\n") + "\n");
}

function expectClean(o: Outcome) {
  expect(o.broken.map((x) => `${x.key}: ${x.problems.join("; ")}`)).toEqual([]);
}

describe("SequenceBuilder invariant sweep", () => {
  it("level pools match the brief's reading of TurnAllocator", () => {
    expect(getTurnPool(1)).toEqual([0]);
    expect(getTurnPool(2)).toEqual([0, 1, 2, 3]);
    expect(getTurnPool(3)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"]);
    expect(() => getTurnPool(4)).toThrow(/Level 4/);
  });

  it("every LOOP rhythm × length × level × dashes", { timeout: 60_000 }, () => {
    const o = runCells(baseCells);
    report("base", baseCells, o);
    expectClean(o);
    // Most of the matrix must actually build, or the sweep proves nothing.
    expect(o.built).toBeGreaterThan(baseCells.length / 2);
  });

  it(
    "prop relationships over every LOOP rhythm × level",
    { timeout: 60_000 },
    () => {
      const o = runCells(propCells);
      report("prop relationships", propCells, o);
      expectClean(o);
    }
  );

  it(
    "hand relationships over every LOOP rhythm × level",
    { timeout: 60_000 },
    () => {
      const o = runCells(handCells);
      report("hand relationships", handCells, o);
      expectClean(o);
    }
  );

  it(
    "bridged, symmetric and one-letter words over every LOOP rhythm × level",
    { timeout: 60_000 },
    () => {
      const o = runCells(wordCells);
      report("words", wordCells, o);
      expectClean(o);
      // Bridges were the point of a9deee6196: at levels 2 and 3 they turn.
      expect(o.bridgeSteps).toBeGreaterThan(0);
      expect(o.turnedBridgeSteps).toBeGreaterThan(0);
    }
  );
});
