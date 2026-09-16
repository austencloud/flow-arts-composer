/**
 * Exercise the same engine adapter used by the flow-arts `generate_sequence`
 * MCP tool across a large, replayable input matrix.
 *
 * This is a diagnostic runner, not a second generator. Every case goes through:
 *
 *   ensureDataLoadedAsync -> generateViaEngine -> SequenceBuilder
 *
 * The compressed JSONL dataset keeps one record per attempted configuration.
 * Generated sequences are reduced to exact step signatures so the corpus stays
 * practical while preserving the data needed to reproduce structural failures.
 *
 * Usage:
 *   pnpm exec tsx scripts/audit-generator-conformance.ts --profile=smoke
 *   pnpm exec tsx scripts/audit-generator-conformance.ts --profile=full
 *   pnpm exec tsx scripts/audit-generator-conformance.ts --replay=<case-id>
 */

import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { finished } from "node:stream/promises";
import { once } from "node:events";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import {
  generateViaEngine,
  type EngineGenerationParams,
} from "../mcp-server/src/core/engine-generation-adapter.js";
import {
  mcpStepsToEngineSteps,
  type SequenceResult,
  type SequenceStep,
} from "../mcp-server/src/core/sequence-builder-adapter.js";
import {
  ensureDataLoadedAsync,
  type GridMode,
  type PictographData,
} from "../mcp-server/src/shared/server-context.js";
import {
  detectLOOPFromSteps,
  hasRewoundStructure,
  loopDetectorClass,
} from "../packages/sequence-engine/src/loop/detection/LOOPDetector.js";
import { findLetterByMotions } from "../packages/sequence-engine/src/loop/LetterLookup.js";
import { gridPlacementDeriver } from "../packages/sequence-engine/src/core/placements/GridPlacementDeriver.js";
import { LetterClassifier } from "../packages/sequence-engine/src/core/letters/LetterClassifier.js";
import { LetterParser } from "../packages/sequence-engine/src/core/letters/LetterParser.js";

type AuditProfile = "smoke" | "full";
type AuditPhase =
  | "loop-core"
  | "loop-lengths"
  | "loop-orientations"
  | "loop-starts"
  | "freeform-core"
  | "position-controls"
  | "letter-controls"
  | "word-fuzz";

interface AuditCase {
  id: string;
  phase: AuditPhase;
  seed: number;
  params: EngineGenerationParams;
}

interface StepSignature {
  n: number;
  letter: string;
  start: string;
  end: string;
  left: string;
  right: string;
}

interface DetectionSummary {
  functional: string[];
  classBased: string[];
  classLoopType: string | null;
  classPeriod: string | null;
  classConfidence: string;
}

interface AuditRecord {
  id: string;
  phase: AuditPhase;
  seed: number;
  params: EngineGenerationParams;
  status:
    | "pass"
    | "expected-rejection"
    | "generation-error"
    | "invariant-failure";
  durationMs: number;
  violations: string[];
  error?: string;
  result?: {
    word: string;
    stepCount: number;
    startPlacement: string;
    endPlacement: string;
    bridgeStepIndices: number[];
    expectedLoopComponents: string[];
    detection: DetectionSummary;
    steps: StepSignature[];
  };
}

interface AuditSummary {
  profile: AuditProfile;
  seed: number;
  shard: {
    index: number;
    count: number;
    totalEnumerated: number;
  };
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  attempted: number;
  passed: number;
  expectedRejections: number;
  generationErrors: number;
  invariantFailures: number;
  phaseCounts: Record<string, number>;
  violationCounts: Record<string, number>;
  errorCounts: Record<string, number>;
  sourceFingerprint: {
    before: string;
    after: string;
    stable: boolean;
  };
  datasetPath: string;
  failureSamplesPath: string;
}

const SOURCE_INPUTS = [
  "scripts/audit-generator-conformance.ts",
  "mcp-server/src/core/engine-generation-adapter.ts",
  "mcp-server/src/core/sequence-builder-adapter.ts",
  "mcp-server/src/shared/server-context.ts",
  "mcp-server/src/types/pictograph.ts",
  "packages/sequence-engine/src",
  "packages/sequence-engine/dist",
  "static/data/pictographs/DiamondPictographDataframe.csv",
  "static/data/pictographs/BoxPictographDataframe.csv",
  "static/data/pictographs/SkewedPictographDataframe.csv",
] as const;

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function collectFingerprintFiles(targetPath: string): string[] {
  const absolutePath = path.join(PROJECT_ROOT, targetPath);
  if (!statSync(absolutePath).isDirectory()) {
    return [targetPath];
  }

  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(targetPath, entry.name);
    return entry.isDirectory()
      ? collectFingerprintFiles(childPath)
      : [childPath];
  });
}

function sourceFingerprint(): string {
  const hash = createHash("sha256");
  const sourceFiles = SOURCE_INPUTS.flatMap(collectFingerprintFiles).sort();
  for (const sourceFile of sourceFiles) {
    hash.update(sourceFile.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path.join(PROJECT_ROOT, sourceFile)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

const LOOP_TYPES = [
  "rotated",
  "mirrored",
  "flipped",
  "swapped",
  "inverted",
  "swapped_inverted",
  "rotated_inverted",
  "mirrored_swapped",
  "mirrored_inverted",
  "rotated_swapped",
  "mirrored_rotated",
  "mirrored_inverted_rotated",
  "mirrored_swapped_inverted",
  "mirrored_rotated_swapped",
  "rotated_swapped_inverted",
  "mirrored_rotated_inverted_swapped",
  "strict_rewound",
  "rewound",
] as const;

const GRID_MODES: GridMode[] = ["diamond", "box", "skewed"];
const LEVELS = [1, 2, 3] as const;
const TURN_INTENSITIES = [0, 1, 2, 3] as const;
const PERIODS = ["halved", "quartered"] as const;
const PRESETS = [
  "smooth",
  "smooth-hands",
  "smooth-props",
  "reversal",
  "isolation",
  "antispin",
  "no-dash",
  "no-static",
  "maximize-dash",
  "maximum-chaos",
] as const;
const HAND_PATH_MODES = [undefined, "smooth", "mixed", "choppy"] as const;
const MOTION_FILTERS = [undefined, "no-dash", "prefer-dash"] as const;
const START_ORIENTATIONS = [
  "in",
  "out",
  "clock",
  "counter",
  "clockIn",
  "clockOut",
  "counterIn",
  "counterOut",
] as const;
const letterClassifier = new LetterClassifier();
const letterParser = new LetterParser();

const cliArgs = process.argv.slice(2);
const profile = readArg("profile", "smoke") as AuditProfile;
if (profile !== "smoke" && profile !== "full") {
  throw new Error(`Unknown profile "${profile}". Use "smoke" or "full".`);
}
const suiteSeed = Number(readArg("seed", "20260725"));
const replayId = readArg("replay");
const limit = Number(readArg("limit", "0"));
const countOnly = cliArgs.includes("--count-only");
const selectedPhases = new Set(
  readArg("phases", "")
    .split(",")
    .map((phase) => phase.trim())
    .filter(Boolean)
);
const selectedGrids = new Set(
  readArg("grids", "")
    .split(",")
    .map((grid) => grid.trim())
    .filter(Boolean)
);
const [shardIndexText, shardCountText] = readArg("shard", "0/1").split("/");
const shardIndex = Number(shardIndexText);
const shardCount = Number(shardCountText);
if (
  !Number.isInteger(shardIndex) ||
  !Number.isInteger(shardCount) ||
  shardCount < 1 ||
  shardIndex < 0 ||
  shardIndex >= shardCount
) {
  throw new Error(
    `Invalid shard "${shardIndexText}/${shardCountText}". Use INDEX/COUNT with 0 <= INDEX < COUNT.`
  );
}
const outputRoot = path.resolve(
  readArg(
    "out",
    path.join(
      ".claude-artifacts",
      "generator-conformance",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${profile}`
    )
  )
);

function readArg(name: string, fallback?: string): string {
  const prefix = `--${name}=`;
  return (
    cliArgs.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback ??
    ""
  );
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeed<T>(seed: number, action: () => T): T {
  const originalRandom = Math.random;
  Math.random = makeRandom(seed);
  try {
    return action();
  } finally {
    Math.random = originalRandom;
  }
}

function makeCase(
  phase: AuditPhase,
  ordinal: number,
  params: EngineGenerationParams
): AuditCase {
  const canonical = JSON.stringify({ phase, params });
  const seedHash = stableHash(canonical);
  const replayId = createHash("sha256")
    .update(JSON.stringify({ phase, ordinal, params }))
    .digest("hex")
    .slice(0, 16);
  return {
    id: `${phase}-${replayId}`,
    phase,
    seed: (suiteSeed + seedHash + ordinal) >>> 0,
    params,
  };
}

function* loopCoreCases(): Generator<AuditCase> {
  const levels = profile === "smoke" ? [2] : LEVELS;
  const turns = profile === "smoke" ? [2] : TURN_INTENSITIES;
  const presets = profile === "smoke" ? ["smooth"] : PRESETS;
  const handPaths = profile === "smoke" ? ["mixed"] : HAND_PATH_MODES;
  const motionFilters = profile === "smoke" ? [undefined] : MOTION_FILTERS;
  let ordinal = 0;

  for (const loopType of LOOP_TYPES) {
    for (const period of PERIODS) {
      for (const gridMode of GRID_MODES) {
        for (const level of levels) {
          for (const turnIntensity of turns) {
            for (const constraintPreset of presets) {
              for (const handPathMode of handPaths) {
                for (const motionTypeFilter of motionFilters) {
                  yield makeCase("loop-core", ordinal++, {
                    length: 16,
                    loopType,
                    period,
                    gridMode,
                    level,
                    propType: "fan",
                    turnIntensity,
                    constraintPreset,
                    handPathMode,
                    motionTypeFilter,
                  });
                }
              }
            }
          }
        }
      }
    }
  }
}

function* loopLengthCases(): Generator<AuditCase> {
  if (profile === "smoke") return;
  const lengths = [2, 4, 6, 8, 12, 16, 24, 32] as const;
  let ordinal = 0;

  for (const loopType of LOOP_TYPES) {
    for (const period of PERIODS) {
      for (const gridMode of GRID_MODES) {
        for (const level of LEVELS) {
          for (const length of lengths) {
            yield makeCase("loop-lengths", ordinal++, {
              length,
              loopType,
              period,
              gridMode,
              level,
              propType: "fan",
              turnIntensity: Math.min(level, 3),
              constraintPreset: "smooth",
              handPathMode: "mixed",
            });
          }
        }
      }
    }
  }
}

function* loopOrientationCases(): Generator<AuditCase> {
  if (profile === "smoke") return;
  let ordinal = 0;

  for (const loopType of LOOP_TYPES) {
    for (const period of PERIODS) {
      for (const gridMode of GRID_MODES) {
        for (const leftStartOrientation of START_ORIENTATIONS) {
          for (const rightStartOrientation of START_ORIENTATIONS) {
            yield makeCase("loop-orientations", ordinal++, {
              length: 16,
              loopType,
              period,
              gridMode,
              level: 3,
              propType: "fan",
              turnIntensity: 3,
              constraintPreset: "smooth",
              handPathMode: "mixed",
              leftStartOrientation,
              rightStartOrientation,
            });
          }
        }
      }
    }
  }
}

function distinctPositions(data: PictographData[]): string[] {
  return [
    ...new Set(
      data.flatMap((pictograph) => [
        pictograph.startPlacement,
        pictograph.endPlacement,
      ])
    ),
  ]
    .filter(Boolean)
    .sort();
}

function* loopStartCases(
  dataByGrid: Map<GridMode, PictographData[]>
): Generator<AuditCase> {
  if (profile === "smoke") return;
  let ordinal = 0;

  for (const loopType of LOOP_TYPES) {
    for (const period of PERIODS) {
      for (const gridMode of GRID_MODES) {
        const positions = distinctPositions(dataByGrid.get(gridMode) ?? []);
        for (const startPlacement of positions) {
          yield makeCase("loop-starts", ordinal++, {
            length: 16,
            loopType,
            period,
            gridMode,
            level: 3,
            propType: "fan",
            turnIntensity: 3,
            constraintPreset: "smooth",
            handPathMode: "mixed",
            startPlacement,
          });
        }
      }
    }
  }
}

function* freeformCases(): Generator<AuditCase> {
  const levels = profile === "smoke" ? [1, 2, 3] : LEVELS;
  const turns = profile === "smoke" ? [1] : TURN_INTENSITIES;
  const presets = profile === "smoke" ? PRESETS : PRESETS;
  const handPaths = profile === "smoke" ? ["mixed"] : HAND_PATH_MODES;
  const motionFilters = profile === "smoke" ? [undefined] : MOTION_FILTERS;
  const lengths = profile === "smoke" ? [8] : [1, 2, 4, 8, 16, 32];
  let ordinal = 0;

  for (const gridMode of GRID_MODES) {
    for (const level of levels) {
      for (const turnIntensity of turns) {
        for (const constraintPreset of presets) {
          for (const handPathMode of handPaths) {
            for (const motionTypeFilter of motionFilters) {
              for (const length of lengths) {
                yield makeCase("freeform-core", ordinal++, {
                  length,
                  gridMode,
                  level,
                  propType: "fan",
                  turnIntensity,
                  constraintPreset,
                  handPathMode,
                  motionTypeFilter,
                });
              }
            }
          }
        }
      }
    }
  }
}

function distinctLetters(data: PictographData[]): string[] {
  return [...new Set(data.map((pictograph) => pictograph.letter))]
    .filter(Boolean)
    .sort();
}

function* positionControlCases(
  dataByGrid: Map<GridMode, PictographData[]>
): Generator<AuditCase> {
  if (profile === "smoke") return;
  let ordinal = 0;

  for (const gridMode of GRID_MODES) {
    const positions = distinctPositions(dataByGrid.get(gridMode) ?? []);

    for (const startPlacement of positions) {
      for (const endPlacement of positions) {
        yield makeCase("position-controls", ordinal++, {
          length: 8,
          gridMode,
          level: 2,
          propType: "fan",
          turnIntensity: 2,
          constraintPreset: "smooth",
          handPathMode: "mixed",
          startPlacement,
          endPlacement,
        });
      }
    }

    for (const position of positions) {
      const common = {
        length: 8,
        gridMode,
        level: 2,
        propType: "fan",
        turnIntensity: 2,
        constraintPreset: "smooth",
        handPathMode: "mixed" as const,
      };
      yield makeCase("position-controls", ordinal++, {
        ...common,
        startPlacement: position,
      });
      yield makeCase("position-controls", ordinal++, {
        ...common,
        endPlacement: position,
      });
      yield makeCase("position-controls", ordinal++, {
        ...common,
        blockedStartPlacements: [position],
      });
      yield makeCase("position-controls", ordinal++, {
        ...common,
        blockedStartPlacements: positions.filter(
          (candidate) => candidate !== position
        ),
      });
    }
  }
}

function* letterControlCases(
  dataByGrid: Map<GridMode, PictographData[]>
): Generator<AuditCase> {
  if (profile === "smoke") return;
  let ordinal = 0;

  for (const gridMode of GRID_MODES) {
    const letters = distinctLetters(dataByGrid.get(gridMode) ?? []).filter(
      (letter) => !letterClassifier.isType6(letter)
    );
    for (let index = 0; index < letters.length; index++) {
      const letter = letters[index]!;
      const otherLetter = letters[(index + 1) % letters.length]!;
      const common = {
        length: 16,
        gridMode,
        level: 2,
        propType: "fan",
        turnIntensity: 2,
        constraintPreset: "smooth",
        handPathMode: "mixed" as const,
      };
      yield makeCase("letter-controls", ordinal++, {
        ...common,
        mustContainLetters: [letter],
      });
      yield makeCase("letter-controls", ordinal++, {
        ...common,
        mustNotContainLetters: [letter],
      });
      yield makeCase("letter-controls", ordinal++, {
        ...common,
        mustContainLetters: [letter],
        mustNotContainLetters: [otherLetter],
      });
    }
  }
}

function* wordCases(
  dataByGrid: Map<GridMode, PictographData[]>
): Generator<AuditCase> {
  if (profile === "smoke") return;
  const count = 2048;

  for (let ordinal = 0; ordinal < count; ordinal++) {
    const gridMode = GRID_MODES[ordinal % GRID_MODES.length]!;
    const letters = distinctLetters(dataByGrid.get(gridMode) ?? []).filter(
      (letter) => !letterClassifier.isType6(letter)
    );
    const random = makeRandom((suiteSeed + ordinal * 2654435761) >>> 0);
    const wordLength = 1 + Math.floor(random() * 12);
    let word = "";
    for (let i = 0; i < wordLength; i++) {
      word += letters[Math.floor(random() * letters.length)] ?? "A";
    }

    yield makeCase("word-fuzz", ordinal, {
      word,
      gridMode,
      level: LEVELS[ordinal % LEVELS.length]!,
      propType: "fan",
      turnIntensity: TURN_INTENSITIES[ordinal % TURN_INTENSITIES.length]!,
      constraintPreset: PRESETS[ordinal % PRESETS.length]!,
      handPathMode: HAND_PATH_MODES[ordinal % HAND_PATH_MODES.length],
      motionTypeFilter: MOTION_FILTERS[ordinal % MOTION_FILTERS.length],
    });
  }
}

function* allCases(
  dataByGrid: Map<GridMode, PictographData[]>
): Generator<AuditCase> {
  yield* loopCoreCases();
  yield* loopLengthCases();
  yield* loopOrientationCases();
  yield* loopStartCases(dataByGrid);
  yield* freeformCases();
  yield* positionControlCases(dataByGrid);
  yield* letterControlCases(dataByGrid);
  yield* wordCases(dataByGrid);
}

function caseSelected(auditCase: AuditCase): boolean {
  const phaseMatches =
    selectedPhases.size === 0 || selectedPhases.has(auditCase.phase);
  const gridMatches =
    selectedGrids.size === 0 ||
    selectedGrids.has(String(auditCase.params.gridMode));
  return phaseMatches && gridMatches;
}

function normalizeComponents(components: Iterable<unknown>): string[] {
  return [...components].map(String).sort();
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function motionSignature(
  motion: SequenceStep["leftMotion"] | SequenceStep["rightMotion"]
): string {
  return [
    motion?.motionType ?? "",
    `${motion?.startLocation ?? ""}>${motion?.endLocation ?? ""}`,
    `${motion?.startOrientation ?? ""}>${motion?.endOrientation ?? ""}`,
    motion?.rotationDirection ?? "",
    String(motion?.turns ?? ""),
  ].join(":");
}

function stepSignatures(steps: SequenceStep[]): StepSignature[] {
  return steps.map((step, index) => ({
    n: step.stepNumber ?? index,
    letter: step.letter ?? "",
    start: step.startPlacement ?? "",
    end: step.endPlacement ?? "",
    left: motionSignature(step.leftMotion),
    right: motionSignature(step.rightMotion),
  }));
}

function motionForLetterLookup(
  motion: SequenceStep["leftMotion"]
): SequenceStep["leftMotion"] {
  if (motion.motionType !== "float") return motion;
  return {
    ...motion,
    motionType: motion.prefloatMotionType ?? motion.motionType,
    rotationDirection:
      motion.prefloatRotationDirection ?? motion.rotationDirection,
  };
}

function addViolation(
  violations: string[],
  code: string,
  detail: string
): void {
  violations.push(`${code}: ${detail}`);
}

function checkMotionTypePreset(
  params: EngineGenerationParams,
  steps: SequenceStep[],
  violations: string[]
): void {
  const letterSteps = steps.slice(1);
  const motions = letterSteps.flatMap((step) => [
    step.leftMotion,
    step.rightMotion,
  ]);

  if (
    params.constraintPreset === "no-dash" ||
    params.motionTypeFilter === "no-dash"
  ) {
    const dashCount = motions.filter(
      (motion) => motion?.motionType === "dash"
    ).length;
    if (dashCount > 0) {
      addViolation(
        violations,
        "constraint-no-dash",
        `${dashCount} dash motions emitted`
      );
    }
  }

  if (params.constraintPreset === "no-static") {
    const staticCount = motions.filter(
      (motion) => motion?.motionType === "static"
    ).length;
    if (staticCount > 0) {
      addViolation(
        violations,
        "constraint-no-static",
        `${staticCount} static motions emitted`
      );
    }
  }

  if (params.constraintPreset === "isolation") {
    const nonPro = motions.filter(
      (motion) => motion?.motionType !== "pro"
    ).length;
    const nonZeroTurns = motions.filter(
      (motion) => Number(motion?.turns ?? 0) !== 0
    ).length;
    if (nonPro > 0) {
      addViolation(
        violations,
        "constraint-isolation-motion",
        `${nonPro} motions are not pro`
      );
    }
    if (nonZeroTurns > 0) {
      addViolation(
        violations,
        "constraint-isolation-turns",
        `${nonZeroTurns} motions have non-zero turns`
      );
    }
  }

  if (params.constraintPreset === "antispin") {
    const nonAnti = motions.filter(
      (motion) => motion?.motionType !== "anti"
    ).length;
    if (nonAnti > 0) {
      addViolation(
        violations,
        "constraint-antispin",
        `${nonAnti} motions are not anti`
      );
    }
  }
}

function checkTurns(
  params: EngineGenerationParams,
  steps: SequenceStep[],
  violations: string[]
): void {
  const turns = steps
    .slice(1)
    .flatMap((step) => [step.leftMotion?.turns, step.rightMotion?.turns])
    .map((turn) => Math.abs(Number(turn ?? 0)));
  const maxAllowed = params.turnIntensity;

  if (maxAllowed !== undefined) {
    const over = turns.filter((turn) => turn > maxAllowed + Number.EPSILON);
    if (over.length > 0) {
      addViolation(
        violations,
        "turn-intensity",
        `${over.length} motions exceed ${maxAllowed}; max=${Math.max(...over)}`
      );
    }
  }

  if (params.level === 1) {
    const nonZero = turns.filter((turn) => turn !== 0);
    if (nonZero.length > 0) {
      addViolation(
        violations,
        "level-1-turns",
        `${nonZero.length} motions have turns`
      );
    }
  }

  if (params.level === 2) {
    const fractional = turns.filter((turn) => !Number.isInteger(turn));
    if (fractional.length > 0) {
      addViolation(
        violations,
        "level-2-fractional-turns",
        `${fractional.length} motions use fractional turns`
      );
    }
  }
}

function validateSequence(
  auditCase: AuditCase,
  sequenceResult: SequenceResult,
  expectedLoopComponents: string[],
  validPositions: Set<string>,
  allPictographs: PictographData[],
  pictographsByLetter: Map<string, PictographData[]>
): { violations: string[]; detection: DetectionSummary } {
  const { params } = auditCase;
  const { steps } = sequenceResult;
  const violations: string[] = [];
  const expectedLength = params.length;
  const first = steps[0];
  const last = steps[steps.length - 1];
  const emittedLetters = steps.slice(1).map((step) => step.letter);

  if (steps.length === 0) {
    addViolation(violations, "empty-sequence", "no steps returned");
  }

  if (params.startPlacement && first?.startPlacement !== params.startPlacement) {
    addViolation(
      violations,
      "requested-start-placement",
      `requested ${params.startPlacement}, received ${first?.startPlacement ?? "?"}`
    );
  }
  if (params.endPlacement && last?.endPlacement !== params.endPlacement) {
    addViolation(
      violations,
      "requested-end-placement",
      `requested ${params.endPlacement}, received ${last?.endPlacement ?? "?"}`
    );
  }
  if (
    first?.startPlacement &&
    params.blockedStartPlacements?.includes(first.startPlacement)
  ) {
    addViolation(
      violations,
      "blocked-start-placement",
      `${first.startPlacement} was explicitly blocked`
    );
  }

  for (const requiredLetter of params.mustContainLetters ?? []) {
    if (!emittedLetters.includes(requiredLetter)) {
      addViolation(
        violations,
        "required-letter-missing",
        `${requiredLetter} was not emitted`
      );
    }
  }
  for (const excludedLetter of params.mustNotContainLetters ?? []) {
    if (emittedLetters.includes(excludedLetter)) {
      addViolation(
        violations,
        "excluded-letter-present",
        `${excludedLetter} was emitted`
      );
    }
  }

  if (params.word) {
    const expectedLetters = letterParser.parse(params.word);
    const actualLetters = steps
      .slice(1)
      .filter((step) => !step.isBridge)
      .map((step) => step.letter);
    if (!sameStrings(expectedLetters, actualLetters)) {
      addViolation(
        violations,
        "word-round-trip",
        `expected [${expectedLetters.join(",")}], received [${actualLetters.join(",")}]`
      );
    }
  }

  if (expectedLength !== undefined && !params.word) {
    const actualLength = Math.max(0, steps.length - 1);
    if (actualLength !== expectedLength) {
      addViolation(
        violations,
        "length",
        `requested ${expectedLength}, received ${actualLength}`
      );
    }
  }

  for (let index = 0; index < steps.length; index++) {
    const step = steps[index]!;
    if ((step.stepNumber ?? index) !== index) {
      addViolation(
        violations,
        "step-number",
        `index ${index} carries stepNumber ${String(step.stepNumber)}`
      );
    }

    if (step.startPlacement && !validPositions.has(step.startPlacement)) {
      addViolation(
        violations,
        "grid-start-placement",
        `${step.startPlacement} is absent from ${params.gridMode}`
      );
    }
    if (step.endPlacement && !validPositions.has(step.endPlacement)) {
      addViolation(
        violations,
        "grid-end-placement",
        `${step.endPlacement} is absent from ${params.gridMode}`
      );
    }

    for (const [side, motion] of [
      ["blue", step.leftMotion],
      ["red", step.rightMotion],
    ] as const) {
      if (!motion) {
        addViolation(
          violations,
          "missing-motion",
          `step ${index} has no ${side} motion`
        );
      }
    }

    if (step.leftMotion && step.rightMotion) {
      try {
        const derivedStart = gridPlacementDeriver.getGridPlacementFromLocations(
          String(step.leftMotion.startLocation),
          String(step.rightMotion.startLocation)
        );
        const derivedEnd = gridPlacementDeriver.getGridPlacementFromLocations(
          String(step.leftMotion.endLocation),
          String(step.rightMotion.endLocation)
        );
        if (derivedStart !== step.startPlacement) {
          addViolation(
            violations,
            "derived-start-placement",
            `step ${index}: ${step.startPlacement} != ${derivedStart}`
          );
        }
        if (derivedEnd !== step.endPlacement) {
          addViolation(
            violations,
            "derived-end-placement",
            `step ${index}: ${step.endPlacement} != ${derivedEnd}`
          );
        }
      } catch (error) {
        addViolation(
          violations,
          "position-derivation",
          `step ${index}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (index > 0) {
        const leftLookupMotion = motionForLetterLookup(step.leftMotion);
        const rightLookupMotion = motionForLetterLookup(step.rightMotion);
        const emittedLetterMatch = findLetterByMotions(
          leftLookupMotion,
          rightLookupMotion,
          pictographsByLetter.get(step.letter) ?? []
        );
        if (emittedLetterMatch === null) {
          const derivedLetter = findLetterByMotions(
            leftLookupMotion,
            rightLookupMotion,
            allPictographs
          );
          if (derivedLetter === null) {
            addViolation(
              violations,
              "letter-motion-no-match",
              `step ${index}: ${step.letter} has no dataframe match`
            );
          } else if (derivedLetter !== step.letter) {
            addViolation(
              violations,
              "letter-motion-mismatch",
              `step ${index}: emitted ${step.letter}, motions resolve to ${derivedLetter}`
            );
          }
        }
      }
    }

    if (index === 0) continue;
    const previous = steps[index - 1]!;

    if (previous.endPlacement !== step.startPlacement) {
      addViolation(
        violations,
        "position-continuity",
        `step ${index}: ${previous.endPlacement} -> ${step.startPlacement}`
      );
    }

    for (const [side, previousMotion, motion] of [
      ["blue", previous.leftMotion, step.leftMotion],
      ["red", previous.rightMotion, step.rightMotion],
    ] as const) {
      if (!previousMotion || !motion) continue;
      if (previousMotion.endLocation !== motion.startLocation) {
        addViolation(
          violations,
          "location-continuity",
          `step ${index} ${side}: ${previousMotion.endLocation} -> ${motion.startLocation}`
        );
      }
      if (previousMotion.endOrientation !== motion.startOrientation) {
        addViolation(
          violations,
          "orientation-continuity",
          `step ${index} ${side}: ${previousMotion.endOrientation} -> ${motion.startOrientation}`
        );
      }
    }
  }

  const start = steps[0];
  if (
    params.leftStartOrientation &&
    start?.leftMotion?.startOrientation !== params.leftStartOrientation
  ) {
    addViolation(
      violations,
      "blue-start-orientation",
      `requested ${params.leftStartOrientation}, received ${start?.leftMotion?.startOrientation ?? "?"}`
    );
  }
  if (
    params.rightStartOrientation &&
    start?.rightMotion?.startOrientation !== params.rightStartOrientation
  ) {
    addViolation(
      violations,
      "red-start-orientation",
      `requested ${params.rightStartOrientation}, received ${start?.rightMotion?.startOrientation ?? "?"}`
    );
  }

  checkMotionTypePreset(params, steps, violations);
  checkTurns(params, steps, violations);

  const engineSteps = mcpStepsToEngineSteps(steps);
  const functional = detectLOOPFromSteps(engineSteps);
  const classResult = loopDetectorClass.detectLOOPType(engineSteps);
  const classComponents = normalizeComponents(
    classResult.spec?.left?.components.keys() ?? []
  );
  const detection: DetectionSummary = {
    functional: normalizeComponents(functional.components),
    classBased: classComponents,
    classLoopType: classResult.loopType ? String(classResult.loopType) : null,
    classPeriod: classResult.period ? String(classResult.period) : null,
    classConfidence: classResult.confidence,
  };

  if (params.loopType) {
    if (!first || !last || first.startPlacement !== last.endPlacement) {
      addViolation(
        violations,
        "loop-position-closure",
        `${first?.startPlacement ?? "?"} -> ${last?.endPlacement ?? "?"}`
      );
    }

    for (const [side, startMotion, endMotion] of [
      ["blue", first?.leftMotion, last?.leftMotion],
      ["red", first?.rightMotion, last?.rightMotion],
    ] as const) {
      if (
        startMotion &&
        endMotion &&
        startMotion.startOrientation !== endMotion.endOrientation
      ) {
        addViolation(
          violations,
          "loop-orientation-closure",
          `${side}: ${startMotion.startOrientation} -> ${endMotion.endOrientation}`
        );
      }
    }

    const expected = normalizeComponents(expectedLoopComponents);
    const identityMatches =
      expected.length === 1 && expected[0] === "rewound"
        ? hasRewoundStructure(engineSteps)
        : sameStrings(expected, classComponents);
    if (!identityMatches) {
      addViolation(
        violations,
        "loop-identity",
        `expected [${expected.join(",")}], detected [${classComponents.join(",")}]`
      );
    }
  }

  return { violations, detection };
}

function normalizeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .trim();
}

function errorSignature(error: string): string {
  return error
    .replace(/\d+/g, "#")
    .replace(/\[[^\]]+\]/g, "[…]")
    .slice(0, 240);
}

function expectedRejection(
  _auditCase: AuditCase,
  error: string
): string | undefined {
  if (
    error.includes("Requested LOOP length") &&
    error.includes("must be divisible by its")
  ) {
    return "Requested total length cannot contain a whole structural LOOP cycle";
  }

  return undefined;
}

function violationSignature(violation: string): string {
  return violation.split(":")[0] ?? violation;
}

async function writeDatasetRecord(
  gzip: ReturnType<typeof createGzip>,
  record: AuditRecord
): Promise<void> {
  if (!gzip.write(`${JSON.stringify(record)}\n`)) {
    await once(gzip, "drain");
  }
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const sourceFingerprintBefore = sourceFingerprint();
  mkdirSync(outputRoot, { recursive: true });

  const dataByGrid = new Map<GridMode, PictographData[]>();
  const positionsByGrid = new Map<GridMode, Set<string>>();
  const pictographsByLetterByGrid = new Map<
    GridMode,
    Map<string, PictographData[]>
  >();
  for (const gridMode of GRID_MODES) {
    const data = await ensureDataLoadedAsync(gridMode);
    dataByGrid.set(gridMode, data);
    positionsByGrid.set(
      gridMode,
      new Set(
        data.flatMap((pictograph) => [
          pictograph.startPlacement,
          pictograph.endPlacement,
        ])
      )
    );
    const pictographsByLetter = new Map<string, PictographData[]>();
    for (const pictograph of data) {
      const matches = pictographsByLetter.get(pictograph.letter) ?? [];
      matches.push(pictograph);
      pictographsByLetter.set(pictograph.letter, matches);
    }
    pictographsByLetterByGrid.set(gridMode, pictographsByLetter);
  }

  if (countOnly) {
    const phaseCounts = new Map<string, number>();
    const ids = new Set<string>();
    let duplicateIds = 0;
    let total = 0;
    for (const auditCase of allCases(dataByGrid)) {
      if (!caseSelected(auditCase)) continue;
      total++;
      phaseCounts.set(
        auditCase.phase,
        (phaseCounts.get(auditCase.phase) ?? 0) + 1
      );
      if (ids.has(auditCase.id)) {
        duplicateIds++;
      } else {
        ids.add(auditCase.id);
      }
    }
    console.log(
      JSON.stringify(
        {
          profile,
          total,
          uniqueIds: ids.size,
          duplicateIds,
          phaseCounts: Object.fromEntries(phaseCounts),
        },
        null,
        2
      )
    );
    if (duplicateIds > 0) process.exitCode = 1;
    return;
  }

  const datasetPath = path.join(outputRoot, "cases.jsonl.gz");
  const failureSamplesPath = path.join(outputRoot, "failure-samples.json");
  const summaryPath = path.join(outputRoot, "summary.json");
  const gzip = createGzip({ level: 9 });
  const datasetFile = createWriteStream(datasetPath);
  gzip.pipe(datasetFile);

  const failureSamples = new Map<string, AuditRecord>();
  const violationCounts = new Map<string, number>();
  const errorCounts = new Map<string, number>();
  const phaseCounts = new Map<string, number>();
  let attempted = 0;
  let passed = 0;
  let expectedRejections = 0;
  let generationErrors = 0;
  let invariantFailures = 0;
  let totalEnumerated = 0;

  for (const auditCase of allCases(dataByGrid)) {
    if (!caseSelected(auditCase)) continue;
    const caseIndex = totalEnumerated++;
    if (caseIndex % shardCount !== shardIndex) continue;
    if (replayId && auditCase.id !== replayId) continue;
    if (limit > 0 && attempted >= limit) break;

    attempted++;
    phaseCounts.set(
      auditCase.phase,
      (phaseCounts.get(auditCase.phase) ?? 0) + 1
    );
    const started = performance.now();
    let record: AuditRecord;

    try {
      const allPictographs = dataByGrid.get(
        auditCase.params.gridMode as GridMode
      );
      if (!allPictographs) {
        throw new Error(`No data loaded for ${auditCase.params.gridMode}`);
      }

      const generated = withSeed(auditCase.seed, () =>
        generateViaEngine(auditCase.params, allPictographs)
      );
      const validation = validateSequence(
        auditCase,
        generated.result,
        generated.loopComponents ?? [],
        positionsByGrid.get(auditCase.params.gridMode as GridMode) ?? new Set(),
        allPictographs,
        pictographsByLetterByGrid.get(auditCase.params.gridMode as GridMode) ??
          new Map()
      );
      const status =
        validation.violations.length === 0 ? "pass" : "invariant-failure";
      record = {
        id: auditCase.id,
        phase: auditCase.phase,
        seed: auditCase.seed,
        params: auditCase.params,
        status,
        durationMs: Number((performance.now() - started).toFixed(3)),
        violations: validation.violations,
        result: {
          word: generated.result.word,
          stepCount: Math.max(0, generated.result.steps.length - 1),
          startPlacement: generated.result.startPlacement,
          endPlacement: generated.result.endPlacement,
          bridgeStepIndices: generated.result.bridgeStepIndices,
          expectedLoopComponents: normalizeComponents(
            generated.loopComponents ?? []
          ),
          detection: validation.detection,
          steps: stepSignatures(generated.result.steps),
        },
      };

      if (status === "pass") {
        passed++;
      } else {
        invariantFailures++;
        for (const violation of validation.violations) {
          const signature = violationSignature(violation);
          violationCounts.set(
            signature,
            (violationCounts.get(signature) ?? 0) + 1
          );
          if (!failureSamples.has(signature)) {
            failureSamples.set(signature, record);
            writeFileSync(
              failureSamplesPath,
              `${JSON.stringify(Object.fromEntries(failureSamples), null, 2)}\n`,
              "utf8"
            );
          }
        }
      }
    } catch (error) {
      const message = normalizeError(error);
      const signature = errorSignature(message);
      const rejectionReason = expectedRejection(auditCase, message);
      if (rejectionReason) {
        expectedRejections++;
      } else {
        generationErrors++;
        errorCounts.set(signature, (errorCounts.get(signature) ?? 0) + 1);
      }
      record = {
        id: auditCase.id,
        phase: auditCase.phase,
        seed: auditCase.seed,
        params: auditCase.params,
        status: rejectionReason ? "expected-rejection" : "generation-error",
        durationMs: Number((performance.now() - started).toFixed(3)),
        violations: rejectionReason
          ? [`expected-domain-rejection: ${rejectionReason}`]
          : [],
        error: message,
      };
      if (!rejectionReason && !failureSamples.has(`error:${signature}`)) {
        failureSamples.set(`error:${signature}`, record);
        writeFileSync(
          failureSamplesPath,
          `${JSON.stringify(Object.fromEntries(failureSamples), null, 2)}\n`,
          "utf8"
        );
      }
    }

    await writeDatasetRecord(gzip, record);

    if (attempted % 100 === 0) {
      console.log(
        `${attempted.toLocaleString()} cases: ${passed.toLocaleString()} pass, ` +
          `${expectedRejections.toLocaleString()} expected rejections, ` +
          `${generationErrors.toLocaleString()} generation errors, ` +
          `${invariantFailures.toLocaleString()} invariant failures`
      );
    }
  }

  gzip.end();
  await finished(gzip);
  await finished(datasetFile);

  const finishedAt = new Date();
  const sourceFingerprintAfter = sourceFingerprint();
  const summary: AuditSummary = {
    profile,
    seed: suiteSeed,
    shard: {
      index: shardIndex,
      count: shardCount,
      totalEnumerated,
    },
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    attempted,
    passed,
    expectedRejections,
    generationErrors,
    invariantFailures,
    phaseCounts: Object.fromEntries(
      [...phaseCounts.entries()].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    ),
    violationCounts: Object.fromEntries(
      [...violationCounts.entries()].sort((left, right) => right[1] - left[1])
    ),
    errorCounts: Object.fromEntries(
      [...errorCounts.entries()].sort((left, right) => right[1] - left[1])
    ),
    sourceFingerprint: {
      before: sourceFingerprintBefore,
      after: sourceFingerprintAfter,
      stable: sourceFingerprintBefore === sourceFingerprintAfter,
    },
    datasetPath,
    failureSamplesPath,
  };

  writeFileSync(
    failureSamplesPath,
    `${JSON.stringify(Object.fromEntries(failureSamples), null, 2)}\n`,
    "utf8"
  );
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(summary, null, 2));
  if (attempted === 0) {
    process.exitCode = 2;
  } else if (!summary.sourceFingerprint.stable) {
    process.exitCode = 3;
  } else if (generationErrors > 0 || invariantFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
