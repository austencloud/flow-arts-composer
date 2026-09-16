#!/usr/bin/env tsx
/**
 * Translate SpiroAnim's finite Quarter Space Tech catalog into authored
 * Kinetic Alphabet sequences with a primary plane on every hand motion.
 *
 * The source positions come from SpiroAnim's own compiler and analyzer. This
 * script does not reinterpret raw arc/plane angles. It asks SpiroAnim for each
 * compiled six-axis position timeline, then projects every transition through
 * TKA's canonical Wall, Wheel, and Floor coordinate mapper.
 *
 * Usage:
 *   tsx scripts/transcribe-spiroanim-qst.ts
 *   tsx scripts/transcribe-spiroanim-qst.ts --write
 *   tsx scripts/transcribe-spiroanim-qst.ts --source E:/spiroanim --source-ref origin/main --write
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calculateEndOrientation } from "@tka/sequence-engine/core";
import { Plane, type Plane as PlaneValue } from "@tka/tka-types";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { getGridPlacementFromLocations } from "$lib/shared/pictograph/grid/services/grid-placement-deriver";
import { calculateHandpathDirection } from "$lib/shared/pictograph/arrow/positioning/calculation/services/handpath-direction-calculator";
import {
  lookupLetter,
  parseCsvEdges,
} from "$lib/features/choreo-card/services/pictograph-letter-lookup";

type QstCollectionKey = "breaks" | "advanced" | "beyond";
type QstPosition = "top" | "left" | "front" | "right" | "bottom" | "back";
type QstPlacementPair = readonly [QstPosition, QstPosition];

interface QstPatternDefinition {
  readonly caption: string;
  readonly lineBeats?: number;
  readonly reference: `${QstCollectionKey}-${number}`;
}

interface ViteServerLike {
  ssrLoadModule(path: string): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

interface ViteModule {
  createServer(options: Record<string, unknown>): Promise<ViteServerLike>;
}

interface TranslatedMotion {
  readonly hand: "left" | "right";
  readonly motionType: "anti";
  readonly rotationDirection: "cw" | "ccw";
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly turns: 1;
  readonly startOrientation: "out";
  readonly endOrientation: "out";
  readonly plane: PlaneValue;
}

interface TranslatedStep {
  readonly stepNumber: number;
  readonly letter: string;
  readonly startPlacement: string;
  readonly endPlacement: string;
  readonly duration: 1;
  readonly motions: {
    readonly left: TranslatedMotion;
    readonly right: TranslatedMotion;
  };
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const OUTPUT_PATH = resolve(
  REPO_ROOT,
  "docs/research/spiroanim/qst-228-sequences.json"
);
const CSV_PATH = resolve(
  REPO_ROOT,
  "static/data/pictographs/DiamondPictographDataframe.csv"
);

const SOURCE_PATHS = [
  "src/features/quarter-space-tech",
  "src/math/animation/AnimFunc.ts",
  "src/math/animation/OrthogonalFunc.ts",
  "src/domain/animation/AnimStruct.ts",
] as const;

const COLLECTION_INFO = {
  breaks: {
    title: 'Quarter "Time" Breaks',
    level: "Intermediate",
    sourceDocument: "https://quarterspace.tech/?library=qs-qtb",
  },
  advanced: {
    title: 'Quarter "Time" Advanced',
    level: "Advanced",
    sourceDocument: "https://quarterspace.tech/?library=qs-qta",
  },
  beyond: {
    title: "Quarter Space Beyond",
    level: "Master",
    sourceDocument: "https://quarterspace.tech/?library=qs-beyond",
  },
} as const;

const PRIMARY_PLANES = [Plane.wall, Plane.wheel, Plane.floor] as const;

/**
 * The exact six-axis bridge between SpiroAnim's qstPositionVectors and TKA's
 * documented canonical viewpoints. A source point belongs to two planes, but
 * an orthogonal source transition belongs to exactly one primary plane.
 */
const LOCAL_LOCATION: Readonly<
  Record<PlaneValue, Partial<Record<QstPosition, GridLocation>>>
> = {
  [Plane.wall]: {
    top: GridLocation.NORTH,
    right: GridLocation.EAST,
    bottom: GridLocation.SOUTH,
    left: GridLocation.WEST,
  },
  [Plane.wheel]: {
    top: GridLocation.NORTH,
    front: GridLocation.EAST,
    bottom: GridLocation.SOUTH,
    back: GridLocation.WEST,
  },
  [Plane.floor]: {
    front: GridLocation.NORTH,
    right: GridLocation.EAST,
    back: GridLocation.SOUTH,
    left: GridLocation.WEST,
  },
  [Plane.rightShield]: {},
  [Plane.leftShield]: {},
  [Plane.forwardRamp]: {},
  [Plane.backwardRamp]: {},
  [Plane.rightWing]: {},
  [Plane.leftWing]: {},
};

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function git(sourceRoot: string, ...args: string[]): string {
  return execFileSync("git", ["-C", sourceRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function sourceCollection(reference: string): QstCollectionKey {
  const key = reference.split("-", 1)[0];
  if (key === "breaks" || key === "advanced" || key === "beyond") return key;
  throw new Error(`Unknown QST collection in ${reference}`);
}

function localLocation(
  sourcePosition: QstPosition,
  plane: PlaneValue
): GridLocation | null {
  return LOCAL_LOCATION[plane][sourcePosition] ?? null;
}

function resolvePlaneTransition(
  start: QstPosition,
  end: QstPosition
): {
  plane: PlaneValue;
  startLocation: GridLocation;
  endLocation: GridLocation;
} {
  const matches = PRIMARY_PLANES.flatMap((plane) => {
    const startLocation = localLocation(start, plane);
    const endLocation = localLocation(end, plane);
    return startLocation && endLocation && startLocation !== endLocation
      ? [{ plane, startLocation, endLocation }]
      : [];
  });

  if (matches.length !== 1) {
    throw new Error(
      `Expected one primary plane for ${start}->${end}, found ${matches.length}`
    );
  }
  return matches[0]!;
}

function translateMotion(
  start: QstPosition,
  end: QstPosition,
  hand: "left" | "right"
): TranslatedMotion {
  const transition = resolvePlaneTransition(start, end);
  const handPath = calculateHandpathDirection(
    transition.startLocation,
    transition.endLocation
  );
  if (handPath !== "cw" && handPath !== "ccw") {
    throw new Error(`Expected a quarter-shift hand path for ${start}->${end}`);
  }

  const rotationDirection = handPath === "cw" ? "ccw" : "cw";
  const endOrientation = calculateEndOrientation({
    motionType: "anti",
    turns: 1,
    rotationDirection,
    startLocation: transition.startLocation,
    endLocation: transition.endLocation,
    startOrientation: "out",
  });
  if (endOrientation !== "out") {
    throw new Error(
      `TKA orientation algebra did not preserve out for ${start}->${end}`
    );
  }

  return {
    hand,
    motionType: "anti",
    rotationDirection,
    startLocation: transition.startLocation,
    endLocation: transition.endLocation,
    turns: 1,
    startOrientation: "out",
    endOrientation: "out",
    plane: transition.plane,
  };
}

async function main(): Promise<void> {
  const sourceRoot = resolve(
    readArg("--source") ?? resolve(REPO_ROOT, "../spiroanim")
  );
  const sourceRef = readArg("--source-ref") ?? "origin/main";
  const shouldWrite = process.argv.includes("--write");

  if (!existsSync(sourceRoot)) {
    throw new Error(`SpiroAnim checkout not found at ${sourceRoot}`);
  }

  // The Vite loader reads the checkout. Refuse to label it with another commit
  // unless every QST input is byte-identical to the requested source ref.
  execFileSync(
    "git",
    [
      "-C",
      sourceRoot,
      "diff",
      "--quiet",
      `HEAD..${sourceRef}`,
      "--",
      ...SOURCE_PATHS,
    ],
    { stdio: "inherit" }
  );
  const sourceCommit = git(sourceRoot, "rev-parse", sourceRef);

  const viteEntry = pathToFileURL(
    resolve(sourceRoot, "node_modules/vite/dist/node/index.js")
  ).href;
  const { createServer } = (await import(viteEntry)) as ViteModule;
  const server = await createServer({
    root: sourceRoot,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });

  try {
    const catalog = await server.ssrLoadModule(
      "/src/features/quarter-space-tech/data/qstPatternCatalog.ts"
    );
    const animationFactory = await server.ssrLoadModule(
      "/src/features/quarter-space-tech/createQstAnimation.ts"
    );
    const analyzer = await server.ssrLoadModule(
      "/src/features/quarter-space-tech/math/analyzeQstAnimation.ts"
    );

    const patterns =
      catalog.qstPatternDefinitions as readonly QstPatternDefinition[];
    const createDefaultQstAnimation =
      animationFactory.createDefaultQstAnimation as (selection: {
        concept: "qst";
        reference: string;
      }) => unknown;
    const analyzeQstPlacementPairs = analyzer.analyzeQstPlacementPairs as (
      animation: unknown
    ) => readonly QstPlacementPair[];
    const edges = parseCsvEdges(readFileSync(CSV_PATH, "utf8"));

    const sequences = patterns.map((pattern) => {
      const animation = createDefaultQstAnimation({
        concept: "qst",
        reference: pattern.reference,
      });
      if (!animation)
        throw new Error(`SpiroAnim could not build ${pattern.reference}`);

      const pairs = analyzeQstPlacementPairs(animation);
      if (pairs.length < 2)
        throw new Error(`${pattern.reference} has no content steps`);

      const steps: TranslatedStep[] = Array.from(
        { length: pairs.length - 1 },
        (_, index) => {
          const current = pairs[index]!;
          const next = pairs[index + 1]!;
          const left = translateMotion(current[0], next[0], "left");
          const right = translateMotion(current[1], next[1], "right");
          const startPlacement = getGridPlacementFromLocations(
            left.startLocation,
            right.startLocation
          );
          const endPlacement = getGridPlacementFromLocations(
            left.endLocation,
            right.endLocation
          );
          const letter = lookupLetter(edges, {
            startPlacement,
            endPlacement,
            left,
            right,
          });
          if (!letter) {
            throw new Error(
              `${pattern.reference} step ${index + 1} has no canonical TKA letter`
            );
          }

          return {
            stepNumber: index + 1,
            letter,
            startPlacement,
            endPlacement,
            duration: 1,
            motions: { left, right },
          };
        }
      );

      const collectionKey = sourceCollection(pattern.reference);
      const collection = COLLECTION_INFO[collectionKey];
      const firstStep = steps[0]!;

      return {
        word: steps.map((step) => step.letter).join(""),
        displayName: pattern.caption,
        tags: ["quarter-space-tech", `qst-${collectionKey}`, "3d", "level-8"],
        metadata: {
          source: "spiroanim-quarter-space-tech",
          sourceReference: pattern.reference,
          sourceCollection: collection.title,
          sourceLevel: collection.level,
          sourceRepository: "https://github.com/rbgirard/spiroanim",
          sourceCommit,
          sourceDocument: collection.sourceDocument,
          attribution: {
            credit:
              "Quarter Space Tech source documents by Mentive (@rbgirard), based on Alex Kurowski's grid",
            note: "These sequences translate Mentive's documented patterns from SpiroAnim into Flow Arts Composer.",
          },
          translation: {
            coordinateViews: {
              wall: "back view",
              wheel: "right-side view",
              floor: "top view",
            },
            motion:
              "Each source 90-degree arc maps to a one-turn antispin shift.",
            planes:
              "Each hand stores its primary Wall, Wheel, or Floor plane per step.",
          },
        },
        gridMode: "diamond",
        startPlacement: {
          letter: null,
          gridPlacement: firstStep.startPlacement,
          motions: {
            left: {
              hand: "left",
              motionType: "static",
              rotationDirection: "noRotation",
              startLocation: firstStep.motions.left.startLocation,
              endLocation: firstStep.motions.left.startLocation,
              turns: 0,
              startOrientation: "out",
              endOrientation: "out",
              plane: firstStep.motions.left.plane,
            },
            right: {
              hand: "right",
              motionType: "static",
              rotationDirection: "noRotation",
              startLocation: firstStep.motions.right.startLocation,
              endLocation: firstStep.motions.right.startLocation,
              turns: 0,
              startOrientation: "out",
              endOrientation: "out",
              plane: firstStep.motions.right.plane,
            },
          },
        },
        steps,
      };
    });

    const counts = Object.fromEntries(
      (["breaks", "advanced", "beyond"] as const).map((key) => [
        key,
        sequences.filter(
          (sequence) =>
            sequence.metadata.sourceReference.split("-", 1)[0] === key
        ).length,
      ])
    );
    const stepCount = sequences.reduce(
      (sum, sequence) => sum + sequence.steps.length,
      0
    );
    const lengthCounts = sequences.reduce<Record<number, number>>(
      (countsByLength, sequence) => {
        countsByLength[sequence.steps.length] =
          (countsByLength[sequence.steps.length] ?? 0) + 1;
        return countsByLength;
      },
      {}
    );
    const planeCounts = sequences
      .flatMap((sequence) => sequence.steps)
      .flatMap((step) => [step.motions.left.plane, step.motions.right.plane])
      .reduce<Record<string, number>>((countsByPlane, plane) => {
        countsByPlane[plane] = (countsByPlane[plane] ?? 0) + 1;
        return countsByPlane;
      }, {});

    console.log(`Source: ${sourceCommit}`);
    console.log(`Patterns: ${sequences.length} (${JSON.stringify(counts)})`);
    console.log(
      `Content steps: ${stepCount} (${JSON.stringify(lengthCounts)})`
    );
    console.log(`Authored hand planes: ${JSON.stringify(planeCounts)}`);

    if (sequences.length !== 228 || stepCount !== 1680) {
      throw new Error("Unexpected QST corpus size");
    }

    if (shouldWrite) {
      writeFileSync(OUTPUT_PATH, `${JSON.stringify(sequences, null, 1)}\n`);
      console.log(`Wrote ${OUTPUT_PATH}`);
    } else {
      console.log(
        "Dry run only. Pass --write to replace the checked-in corpus."
      );
    }
  } finally {
    await server.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
