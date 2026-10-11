import {
  calculateEndOrientation,
  type MotionData as EngineMotionData,
} from "@tka/sequence-engine";
import {
  allocateTurns,
  getHandpathDirection,
  HandPath,
} from "@tka/sequence-engine/generation";
import { materializeTurn } from "@tka/sequence-engine/generation/turn-materializer";
import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
  LOCATION_MAP_CLOCKWISE,
  LOOPComponent,
  loopSpecToWire,
  reflectLocation,
  type PropLOOPSpecWire,
} from "@tka/sequence-engine/loop";
import {
  buildInvertedSoloLoop,
  buildReflectedSoloLoop,
  buildRewoundSoloLoop,
  buildRotatedSoloLoop,
  detectSoloLOOP,
  rewindSoloMotion,
} from "@tka/sequence-engine/loop/solo";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { extractLeftSoloProp } from "#lib/shared/foundation/services/sequence-decomposer.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  HandSide,
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Flower } from "#lib/shared/shape-matrix/domain/flower-signature.js";
import type { TurnLevel } from "#lib/shared/create/services/level-turn-values.js";
import {
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { startOrientationsForLevel } from "#lib/features/create/generate/domain/level-orientation-policy.js";
import {
  DEFAULT_GENERATION_STYLE,
  type GenerationMotionTypeFilter,
  type GenerationStyleAxis,
} from "#lib/shared/create/domain/generation-style.js";

export interface GeneratedSoloLoop {
  readonly solo: SoloPropData;
  readonly loopSpec: PropLOOPSpecWire;
}

export interface SoloLoopGenerationRecipe {
  readonly gridMode: GridMode;
  readonly level: TurnLevel;
  readonly maxTurnIntensity: number;
  readonly constraintPreset: GenerationStyleAxis;
  readonly handPathMode: GenerationStyleAxis;
  readonly motionTypeFilter: GenerationMotionTypeFilter;
  readonly startLocation: GridLocation | null;
  readonly startOrientation: Orientation | null;
  readonly traversalDirection: SoloLoopTraversalDirection | null;
}

export type SoloLoopTraversalDirection = "clockwise" | "counterclockwise";

export const DEFAULT_SOLO_LOOP_RECIPE: SoloLoopGenerationRecipe = Object.freeze(
  {
    gridMode: GridMode.DIAMOND,
    level: 2,
    maxTurnIntensity: 1,
    ...DEFAULT_GENERATION_STYLE,
    startLocation: null,
    startOrientation: null,
    traversalDirection: null,
  }
);

function soloStepsToEngineMotions(
  steps: readonly SoloPropStepData[]
): EngineMotionData[] {
  return steps.map((step) => ({
    motionType: step.motionType,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    rotationDirection: step.rotationDirection,
    turns: step.turns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
    ...(step.prefloatMotionType
      ? { prefloatMotionType: step.prefloatMotionType }
      : {}),
  })) as EngineMotionData[];
}

export function isStructuredSoloLoop(solo: SoloPropData): boolean {
  return detectSoloLOOP(soloStepsToEngineMotions(solo.steps)).isLoop;
}

const motionTemplatesByGrid = new Map<
  GridMode,
  Promise<readonly MotionData[]>
>();

function motionSignature(motion: MotionData): string {
  return [
    motion.motionType,
    motion.startLocation,
    motion.endLocation,
    motion.rotationDirection,
    motion.turns,
    motion.handPath ?? "",
  ].join(":");
}

async function loadMotionTemplatesForGrid(
  gridMode: GridMode
): Promise<readonly MotionData[]> {
  const cached = motionTemplatesByGrid.get(gridMode);
  if (cached) return cached;

  const pending = letterQueryHandler
    .getAllPictographVariations(gridMode)
    .then((pictographs) => {
      const unique = new Map<string, MotionData>();
      for (const pictograph of pictographs) {
        for (const color of [HandSide.LEFT, HandSide.RIGHT] as const) {
          const motion = pictograph.motions[color];
          if (!isVisibleMotion(motion)) continue;
          // Float is allocated from a pro/anti shift at Level 3. Treating an
          // already-floated variation as a base motion would let it leak into
          // Levels 1 and 2 or receive a numeric turn value.
          if (motion.motionType === "float") continue;
          unique.set(motionSignature(motion), motion);
        }
      }
      return [...unique.values()];
    })
    .catch((error) => {
      motionTemplatesByGrid.delete(gridMode);
      throw error;
    });
  motionTemplatesByGrid.set(gridMode, pending);
  return pending;
}

function randomItem<T>(items: readonly T[], random: () => number): T {
  if (items.length === 0)
    throw new RangeError("Cannot pick from an empty list");
  return items[Math.floor(random() * items.length) % items.length]!;
}

const DIAMOND_START_LOCATIONS: readonly GridLocation[] = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
];

const BOX_START_LOCATIONS: readonly GridLocation[] = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
];

function startLocationsForGrid(gridMode: GridMode): readonly GridLocation[] {
  return gridMode === GridMode.BOX
    ? BOX_START_LOCATIONS
    : DIAMOND_START_LOCATIONS;
}

export interface FuseFlowerGenerationVariation {
  readonly flower: Flower;
  readonly firstBeat: number;
  readonly startOrientation: Orientation;
  readonly startLocation?: GridLocation;
  readonly reverseTraversal: boolean;
}

/**
 * Pick the hand path, first step, prop orientation, and traversal independently.
 * Regenerating the same flower can therefore start elsewhere, present a
 * different prop pose, or travel around the flower in the opposite direction.
 */
export function chooseFuseFlowerGenerationVariation(
  flowers: readonly Flower[],
  random: () => number = Math.random,
  recipe: SoloLoopGenerationRecipe = DEFAULT_SOLO_LOOP_RECIPE
): FuseFlowerGenerationVariation {
  const allowedOrientations = startOrientationsForLevel(recipe.level);
  return {
    flower: randomItem(flowers, random),
    firstBeat: randomItem([1, 2, 3, 4] as const, random),
    startOrientation:
      recipe.startOrientation ?? randomItem(allowedOrientations, random),
    ...(recipe.startLocation ? { startLocation: recipe.startLocation } : {}),
    reverseTraversal:
      recipe.traversalDirection === "counterclockwise" ||
      (recipe.traversalDirection === null && random() >= 0.5),
  };
}

/**
 * Play a closed one-hand LOOP in the opposite direction. The sequence engine's
 * canonical rewind primitive reverses both the step order and each motion, so
 * the first location and prop orientation still meet the final step exactly.
 */
export function reverseSoloLoopTraversal(source: SoloPropData): SoloPropData {
  const reversed = [...soloStepsToEngineMotions(source.steps)]
    .reverse()
    .map(rewindSoloMotion);
  return generatedFromMotions(reversed, source.name ?? "Generated solo LOOP")
    .solo;
}

function instantiateMotion(
  template: MotionData,
  startOrientation: string,
  assignedTurns: number | "fl",
  previousRotation: string | undefined,
  random: () => number,
  recipe: SoloLoopGenerationRecipe
): EngineMotionData {
  const materialized = materializeTurn(template, assignedTurns, {
    previousRotation,
    propContinuity:
      recipe.constraintPreset === "smooth"
        ? "maximize"
        : recipe.constraintPreset === "choppy"
          ? "force-reversals"
          : "allow-reversals",
    random,
  });
  const motion: EngineMotionData = {
    motionType: materialized.motionType as EngineMotionData["motionType"],
    startLocation: template.startLocation,
    endLocation: template.endLocation,
    rotationDirection:
      materialized.rotationDirection as EngineMotionData["rotationDirection"],
    turns: materialized.turns as EngineMotionData["turns"],
    startOrientation: startOrientation as EngineMotionData["startOrientation"],
    endOrientation: startOrientation as EngineMotionData["endOrientation"],
    ...(materialized.prefloatMotionType
      ? {
          prefloatMotionType:
            materialized.prefloatMotionType as EngineMotionData["motionType"],
        }
      : {}),
    ...(materialized.prefloatRotationDirection
      ? {
          prefloatRotationDirection:
            materialized.prefloatRotationDirection as EngineMotionData["rotationDirection"],
        }
      : {}),
  };
  return {
    ...motion,
    endOrientation: calculateEndOrientation(motion),
  };
}

function isDashMotion(motion: Pick<MotionData, "motionType">): boolean {
  return motion.motionType === MotionType.DASH;
}

function isDirectionalHandPath(path: HandPath): boolean {
  return path === HandPath.CLOCKWISE || path === HandPath.COUNTER_CLOCKWISE;
}

function isRealRotation(rotation: string | undefined): boolean {
  return Boolean(
    rotation && rotation !== "noRotation" && rotation !== "no_rot"
  );
}

function scoreTemplate(
  template: MotionData,
  previous: EngineMotionData | undefined,
  recipe: SoloLoopGenerationRecipe
): number {
  let score = 0;

  if (recipe.motionTypeFilter === "prefer-dash" && isDashMotion(template)) {
    score += 8;
  }

  if (!previous) return score;

  const previousHandPath = getHandpathDirection(
    previous.startLocation,
    previous.endLocation
  );
  const candidateHandPath = getHandpathDirection(
    template.startLocation,
    template.endLocation
  );
  const handReversal =
    isDirectionalHandPath(previousHandPath) &&
    isDirectionalHandPath(candidateHandPath) &&
    previousHandPath !== candidateHandPath;

  if (recipe.handPathMode === "smooth") score += handReversal ? -4 : 4;
  if (recipe.handPathMode === "choppy") score += handReversal ? 4 : -2;

  const propReversal =
    isRealRotation(previous.rotationDirection) &&
    isRealRotation(template.rotationDirection) &&
    previous.rotationDirection !== template.rotationDirection;

  if (recipe.constraintPreset === "smooth") score += propReversal ? -3 : 3;
  if (recipe.constraintPreset === "choppy") score += propReversal ? 3 : -2;

  return score;
}

function chooseMotionTemplate(
  candidates: readonly MotionData[],
  previous: EngineMotionData | undefined,
  recipe: SoloLoopGenerationRecipe,
  random: () => number
): MotionData | null {
  const viable =
    recipe.motionTypeFilter === "no-dash"
      ? candidates.filter((candidate) => !isDashMotion(candidate))
      : [...candidates];
  if (viable.length === 0) return null;

  let bestScore = Number.NEGATIVE_INFINITY;
  const best: MotionData[] = [];
  for (const candidate of viable) {
    const score = scoreTemplate(candidate, previous, recipe);
    if (score > bestScore) {
      bestScore = score;
      best.length = 0;
      best.push(candidate);
    } else if (score === bestScore) {
      best.push(candidate);
    }
  }
  return randomItem(best, random);
}

function startLocationsWithMotions(
  byStart: ReadonlyMap<string, readonly MotionData[]>,
  recipe: SoloLoopGenerationRecipe
): readonly GridLocation[] {
  if (recipe.startLocation) {
    return byStart.has(recipe.startLocation) ? [recipe.startLocation] : [];
  }
  return startLocationsForGrid(recipe.gridMode).filter((location) =>
    byStart.has(location)
  );
}

function chooseStartOrientation(
  recipe: SoloLoopGenerationRecipe,
  random: () => number
): Orientation {
  return (
    recipe.startOrientation ??
    randomItem(startOrientationsForLevel(recipe.level), random)
  );
}

function applyTraversalPreference(
  generated: GeneratedSoloLoop,
  recipe: SoloLoopGenerationRecipe,
  random: () => number
): GeneratedSoloLoop {
  const reverse =
    recipe.traversalDirection === "counterclockwise" ||
    (recipe.traversalDirection === null && random() >= 0.5);
  if (!reverse) return generated;
  const reversed = reverseSoloLoopTraversal(generated.solo);
  return generatedFromMotions(
    soloStepsToEngineMotions(reversed.steps),
    generated.solo.name ?? "Generated solo LOOP"
  );
}

function allocateSoloTurns(
  count: number,
  recipe: SoloLoopGenerationRecipe,
  random: () => number
): (number | "fl")[] {
  return allocateTurns(
    count,
    recipe.level,
    recipe.level === 1 ? 0 : recipe.maxTurnIntensity,
    { random }
  ).left;
}

function toSoloStep(motion: EngineMotionData): SoloPropStepData {
  return {
    startLocation: motion.startLocation as GridLocation,
    endLocation: motion.endLocation as GridLocation,
    startOrientation: motion.startOrientation as Orientation,
    endOrientation: motion.endOrientation as Orientation,
    motionType: motion.motionType as SoloPropStepData["motionType"],
    rotationDirection:
      motion.rotationDirection as SoloPropStepData["rotationDirection"],
    turns: motion.turns,
    duration: 1,
    ...(motion.prefloatMotionType
      ? {
          prefloatMotionType:
            motion.prefloatMotionType as SoloPropStepData["prefloatMotionType"],
        }
      : {}),
  };
}

function generatedFromMotions(
  motions: readonly EngineMotionData[],
  name = "Generated solo LOOP"
): GeneratedSoloLoop {
  const detection = detectSoloLOOP(motions);
  if (!detection.isLoop || !detection.spec) {
    throw new Error("Generated solo path failed structured LOOP validation");
  }
  const steps = motions.map(toSoloStep);
  const solo = createSoloProp(
    steps,
    steps[0]!.startLocation,
    steps[0]!.startOrientation,
    { name }
  );
  const loopSpec = loopSpecToWire({ left: detection.spec }).left;
  if (!loopSpec)
    throw new Error("Generated solo LOOP is missing its prop spec");
  return { solo, loopSpec };
}

/**
 * Generate a genuine color-neutral one-prop LOOP from the canonical motion
 * vocabulary. It never samples a public or paired sequence. A free seed walk
 * is generated first, then closed through the REWOUND primitive.
 */
export function generateRewoundSoloLoopFromMotions(
  templates: readonly MotionData[],
  length: number,
  random: () => number = Math.random,
  recipe: SoloLoopGenerationRecipe = DEFAULT_SOLO_LOOP_RECIPE
): GeneratedSoloLoop {
  if (!Number.isInteger(length) || length < 2 || length % 2 !== 0) {
    throw new RangeError("A generated solo LOOP needs a positive even length");
  }
  if (templates.length === 0) {
    throw new Error(
      "No canonical motions are available for solo LOOP generation"
    );
  }

  const byStart = new Map<string, MotionData[]>();
  for (const template of templates) {
    const bucket = byStart.get(template.startLocation) ?? [];
    bucket.push(template);
    byStart.set(template.startLocation, bucket);
  }

  const availableStartLocations = startLocationsWithMotions(byStart, recipe);
  if (availableStartLocations.length === 0) {
    throw new Error("No canonical motions are available at that start point");
  }

  const seedLength = length / 2;
  const firstLocation = randomItem(availableStartLocations, random);
  const firstTemplate = chooseMotionTemplate(
    byStart.get(firstLocation) ?? [],
    undefined,
    recipe,
    random
  );
  if (!firstTemplate) {
    throw new Error("No canonical motions match this generation recipe");
  }
  const seed: EngineMotionData[] = [];
  let nextLocation = firstLocation;
  let nextOrientation = chooseStartOrientation(recipe, random);
  let previousRotation: string | undefined;
  const turns = allocateSoloTurns(seedLength, recipe, random);

  for (let index = 0; index < seedLength; index += 1) {
    const candidates = byStart.get(nextLocation) ?? [];
    if (candidates.length === 0) {
      throw new Error(`The solo motion graph has no exit from ${nextLocation}`);
    }
    const template =
      index === 0
        ? firstTemplate
        : chooseMotionTemplate(candidates, seed.at(-1), recipe, random);
    if (!template) {
      throw new Error(`No solo motion matches the recipe from ${nextLocation}`);
    }
    const motion = instantiateMotion(
      template,
      nextOrientation,
      turns[index]!,
      previousRotation,
      random,
      recipe
    );
    seed.push(motion);
    nextLocation = motion.endLocation;
    nextOrientation = motion.endOrientation;
    previousRotation = motion.rotationDirection;
  }

  return generatedFromMotions(buildRewoundSoloLoop(seed));
}

type GeneratedComponent =
  | "rotated-quartered"
  | "rotated-halved"
  | "mirrored"
  | "flipped"
  | "inverted";

function rotateQuarterTurns(location: string, amount: number): string {
  let result = location;
  for (let index = 0; index < amount; index += 1) {
    result = LOCATION_MAP_CLOCKWISE[result] ?? result;
  }
  return result;
}

function findSeedToTarget(
  templates: readonly MotionData[],
  seedLength: number,
  targetForStart: (start: string) => string,
  random: () => number,
  recipe: SoloLoopGenerationRecipe
): EngineMotionData[] | null {
  const byStart = new Map<string, MotionData[]>();
  for (const template of templates) {
    const bucket = byStart.get(template.startLocation) ?? [];
    bucket.push(template);
    byStart.set(template.startLocation, bucket);
  }

  const availableStartLocations = startLocationsWithMotions(byStart, recipe);
  if (availableStartLocations.length === 0) return null;

  for (let attempt = 0; attempt < 96; attempt += 1) {
    const firstLocation = randomItem(availableStartLocations, random);
    const first = chooseMotionTemplate(
      byStart.get(firstLocation) ?? [],
      undefined,
      recipe,
      random
    );
    if (!first) continue;
    const target = targetForStart(firstLocation);
    const seed: EngineMotionData[] = [];
    let location = firstLocation;
    let orientation = chooseStartOrientation(recipe, random);
    let previousRotation: string | undefined;
    let failed = false;
    const turns = allocateSoloTurns(seedLength, recipe, random);

    for (let index = 0; index < seedLength; index += 1) {
      const allCandidates = byStart.get(location) ?? [];
      const candidates =
        index === seedLength - 1
          ? allCandidates.filter((motion) => motion.endLocation === target)
          : allCandidates;
      if (candidates.length === 0) {
        failed = true;
        break;
      }
      const template =
        index === 0
          ? first
          : chooseMotionTemplate(candidates, seed.at(-1), recipe, random);
      if (!template) {
        failed = true;
        break;
      }
      if (index === seedLength - 1 && template.endLocation !== target) {
        failed = true;
        break;
      }
      const motion = instantiateMotion(
        template,
        orientation,
        turns[index]!,
        previousRotation,
        random,
        recipe
      );
      seed.push(motion);
      location = motion.endLocation;
      orientation = motion.endOrientation;
      previousRotation = motion.rotationDirection;
    }
    if (!failed && seed.length === seedLength && location === target)
      return seed;
  }
  return null;
}

function tryGenerateComponent(
  templates: readonly MotionData[],
  length: number,
  component: GeneratedComponent,
  random: () => number,
  recipe: SoloLoopGenerationRecipe
): GeneratedSoloLoop | null {
  const period = component === "rotated-quartered" ? 4 : 2;
  if (length % period !== 0) return null;
  const seedLength = length / period;
  const targetForStart = (start: string): string => {
    switch (component) {
      case "rotated-quartered":
        return rotateQuarterTurns(start, 1);
      case "rotated-halved":
        return rotateQuarterTurns(start, 2);
      case "mirrored":
        return reflectLocation(start, DEFAULT_MIRRORED_AXIS) ?? start;
      case "flipped":
        return reflectLocation(start, DEFAULT_FLIPPED_AXIS) ?? start;
      case "inverted":
        return start;
    }
  };
  const seed = findSeedToTarget(
    templates,
    seedLength,
    targetForStart,
    random,
    recipe
  );
  if (!seed) return null;

  let motions: EngineMotionData[];
  switch (component) {
    case "rotated-quartered":
      motions = buildRotatedSoloLoop(seed, 4);
      break;
    case "rotated-halved":
      motions = buildRotatedSoloLoop(seed, 2);
      break;
    case "mirrored":
      motions = buildReflectedSoloLoop(seed, LOOPComponent.MIRRORED);
      break;
    case "flipped":
      motions = buildReflectedSoloLoop(seed, LOOPComponent.FLIPPED);
      break;
    case "inverted":
      motions = buildInvertedSoloLoop(seed);
      break;
  }

  try {
    return generatedFromMotions(motions);
  } catch {
    return null;
  }
}

export function generateStructuredSoloLoopFromMotions(
  templates: readonly MotionData[],
  length: number,
  random: () => number = Math.random,
  recipe: SoloLoopGenerationRecipe = DEFAULT_SOLO_LOOP_RECIPE
): GeneratedSoloLoop {
  const components: GeneratedComponent[] = [
    ...(length % 4 === 0 ? (["rotated-quartered"] as const) : []),
    "rotated-halved",
    "mirrored",
    "flipped",
    "inverted",
  ];
  const offset = Math.floor(random() * components.length) % components.length;
  for (let index = 0; index < components.length; index += 1) {
    const component = components[(offset + index) % components.length]!;
    const generated = tryGenerateComponent(
      templates,
      length,
      component,
      random,
      recipe
    );
    if (generated) return applyTraversalPreference(generated, recipe, random);
  }
  return applyTraversalPreference(
    generateRewoundSoloLoopFromMotions(templates, length, random, recipe),
    recipe,
    random
  );
}

export async function generateSoloLoop(
  length: number,
  recipe: SoloLoopGenerationRecipe = DEFAULT_SOLO_LOOP_RECIPE,
  random: () => number = Math.random,
  loadFourCountSolo: (
    random: () => number,
    recipe: SoloLoopGenerationRecipe
  ) => Promise<SoloPropData> = loadRandomFlowerSolo,
  loadMotionTemplates: (
    gridMode: GridMode
  ) => Promise<readonly MotionData[]> = loadMotionTemplatesForGrid
): Promise<GeneratedSoloLoop> {
  if (length === 4 && recipe.gridMode === GridMode.DIAMOND) {
    const prefersGenericPath =
      recipe.constraintPreset === "choppy" ||
      recipe.handPathMode === "choppy" ||
      recipe.motionTypeFilter === "prefer-dash";
    if (!prefersGenericPath) {
      try {
        return fitSoloPathToLoop(
          await loadFourCountSolo(random, recipe),
          length
        );
      } catch {
        // The generic generator below is the canonical fallback when the
        // authored flower pool cannot satisfy the selected recipe.
      }
    }
  }
  const templates = await loadMotionTemplates(recipe.gridMode);
  return generateStructuredSoloLoopFromMotions(
    templates,
    length,
    random,
    recipe
  );
}

async function loadRandomFlowerSolo(
  random: () => number,
  recipe: SoloLoopGenerationRecipe
): Promise<SoloPropData> {
  // Keep the Firestore-backed flower catalog out of non-browser consumers of
  // this otherwise pure generator (including unit tests and SSR).
  const { buildFuseFlowerPath, FUSE_GENERATED_FLOWER_SHAPES } =
    await import("./fuse-flower-path-source");
  const eligibleFlowers = FUSE_GENERATED_FLOWER_SHAPES.filter((flower) =>
    flowerMatchesRecipe(flower, recipe)
  );
  if (eligibleFlowers.length === 0) {
    throw new Error("No four-count flowers match this generation recipe");
  }
  const variation = chooseFuseFlowerGenerationVariation(
    eligibleFlowers,
    random,
    recipe
  );
  const solo = extractLeftSoloProp(
    await buildFuseFlowerPath(variation.flower, "left", variation)
  );
  if (
    recipe.startLocation !== null &&
    solo.startLocation !== recipe.startLocation
  ) {
    throw new Error("That flower cannot start at the selected point");
  }
  return variation.reverseTraversal ? reverseSoloLoopTraversal(solo) : solo;
}

export function flowerMatchesRecipe(
  flower: Pick<Flower, "turns">,
  recipe: SoloLoopGenerationRecipe
): boolean {
  if (recipe.level === 1) return flower.turns === 0;
  // FloatFlower.turns is the literal "fl", not a number — a float path has no
  // turn intensity to compare against a level 2/3 recipe's numeric cap.
  if (typeof flower.turns !== "number") return false;
  if (flower.turns > recipe.maxTurnIntensity) return false;
  return recipe.level === 3 || Number.isInteger(flower.turns);
}

/**
 * Match an authored one-hand path to Fuse's requested length. A closed source
 * repeats in its original order whenever it divides the target length. Only a
 * non-looping or incompatible path is closed through the rewound primitive.
 */
export function fitSoloPathToLoop(
  source: SoloPropData,
  length: number
): GeneratedSoloLoop {
  if (!Number.isInteger(length) || length < 2 || length % 2 !== 0) {
    throw new RangeError("A generated solo LOOP needs a positive even length");
  }
  const sourceMotions = soloStepsToEngineMotions(source.steps);
  const sourceDetection = detectSoloLOOP(sourceMotions);
  if (
    sourceMotions.length > 0 &&
    sourceDetection.isLoop &&
    sourceDetection.spec &&
    length % sourceMotions.length === 0
  ) {
    const repeatCount = length / sourceMotions.length;
    const repeated = Array.from({ length: repeatCount }, () => sourceMotions)
      .flat()
      .map((motion) => ({ ...motion }));
    if (repeatCount === 1) {
      return generatedFromMotions(
        repeated,
        source.name ?? "Selected solo LOOP"
      );
    }

    // The LOOP detector classifies a single primitive period. Repeating that
    // period remains a closed loop, but asking the detector to classify the
    // whole tiled sequence can hide the original component. Preserve the
    // source period's spec while materializing the requested number of steps.
    const loopSpec = loopSpecToWire({ left: sourceDetection.spec }).left;
    if (!loopSpec)
      throw new Error("Selected solo LOOP is missing its prop spec");
    const steps = repeated.map(toSoloStep);
    return {
      solo: createSoloProp(
        steps,
        steps[0]!.startLocation,
        steps[0]!.startOrientation,
        { name: source.name ?? "Selected solo LOOP" }
      ),
      loopSpec,
    };
  }

  const seedLength = length / 2;
  if (source.steps.length < seedLength) {
    throw new RangeError(
      `This path needs at least ${seedLength} steps to make a ${length}-step LOOP`
    );
  }
  const seed = sourceMotions.slice(0, seedLength);
  const motions = buildRewoundSoloLoop(seed);
  const detection = detectSoloLOOP(motions);
  if (!detection.isLoop || !detection.spec) {
    throw new Error(
      "The selected path is not continuous enough to close as a LOOP"
    );
  }
  const steps = motions.map(toSoloStep);
  const solo = createSoloProp(
    steps,
    steps[0]!.startLocation,
    steps[0]!.startOrientation,
    { name: source.name ?? "Selected solo LOOP" }
  );
  const loopSpec = loopSpecToWire({ left: detection.spec }).left;
  if (!loopSpec) throw new Error("Selected solo LOOP is missing its prop spec");
  return { solo, loopSpec };
}
