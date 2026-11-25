/**
 * Fuse state factory.
 *
 * Owns the two discovery decks as one pair. Loads are prepared off-screen and
 * committed with their combined preview, so a late request can never leave the
 * page showing a Blue path, Red path, and preview from different moments.
 */

import {
  PLAYBACK_MAX_BPM,
  PLAYBACK_MIN_BPM,
} from "#lib/shared/animation-engine/domain/constants/timing.js";
import type { ErrorHandler } from "#lib/shared/application/services/error-handler.js";
import {
  createSequenceData,
  updateSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "#lib/shared/foundation/services/sequence-decomposer.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import {
  deriveWordFromBeats,
  deriveWordStatusFromSteps,
  getSequenceDisplayName,
} from "#lib/shared/foundation/services/word-deriver.js";
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { isVisibleMotion } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type {
  HandSide,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { reassignMotionHand } from "#lib/shared/create/services/motion-transforms.js";
import {
  asTurnLevel,
  clampMaxTurnIntensity,
  maxTurnIntensitiesForLevel,
  type TurnLevel,
} from "#lib/shared/create/services/level-turn-values.js";
import { clampToAvailableLevel } from "#lib/shared/create/utils/config-mapper.js";
import { startOrientationsForLevel } from "#lib/features/create/generate/domain/level-orientation-policy.js";
import {
  flipSequence,
  invertSequence,
  mirrorSequence,
  rewindSequence,
  rotateSequence,
  shiftStartPlacement,
} from "#lib/shared/create/services/sequence-transformer.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import { isSeamlesslyLoopable } from "#lib/shared/foundation/services/sequence-loopability-checker.js";
import {
  DEFAULT_SOLO_LOOP_RECIPE,
  fitSoloPathToLoop,
  isStructuredSoloLoop,
  type GeneratedSoloLoop,
  type SoloLoopGenerationRecipe,
  type SoloLoopTraversalDirection,
} from "../services/solo-loop-generator";
import {
  DEFAULT_RULE,
  fuseRuleKey,
  fuseRuleLabel,
  fuseRulesEqual,
  inverseFuseRule,
  parseFuseRule,
  type FuseRule,
} from "../domain/fuse-rule";
import { checkFuseTnD, type FuseTnDCheck } from "../domain/fuse-tnd-check";
import {
  classifyFuseRule,
  coerceToTnDRule,
  DEFAULT_TND_SELECTION,
  resolveFuseRule,
  type FuseTnDSelection,
} from "../domain/fuse-tnd-rule";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import { fusedDisplayName, fuseSequences } from "../services/sequence-fuser";
import { createCircularFuseSoloSequence } from "../services/fuse-solo-sequence";
import {
  createFuseShufflePool,
  type FuseBrowseLoader,
  type FuseShufflePool,
  type FuseSide,
} from "./fuse-shuffle-pool.svelte";
import { normalizeLegacyHandPair } from "@tka/tka-types";
import { DEFAULT_GENERATION_STYLE } from "#lib/shared/create/domain/generation-style.js";
import { announcePictographEdit } from "#lib/shared/pictograph/shared/state/pictograph-edit-motion.svelte.js";
import type { PictographEdit } from "#lib/shared/pictograph/shared/services/pictograph-edit-travel.js";

const STORAGE_KEY = "fuse-tab-state";
const STYLE_DEFAULTS_VERSION = 1;
const DEFAULT_BPM = 60;
// Persist the live playback step at most this often while the clock runs, so a
// remount can resume near where playback was without writing on every frame.
const STEP_PERSIST_INTERVAL_MS = 1000;
// A tapped Start waits at its pose this long before it plays, as a tapped Start
// does in the Sequence Viewer (playback-controller's startHoldTimer).
const START_HOLD_MS = 700;

export const FUSE_LENGTHS = [2, 4, 8, 12, 16, 24, 32] as const;
export type FuseLength = (typeof FUSE_LENGTHS)[number];

/** The longest fused result Fuse builds. Each hand keeps its own length and the
 * pair runs until both line up again, the least common multiple of the two.
 * The longest pair the length list allows (12 with 32, or 24 with 32) needs 96
 * steps, so nothing the recipes can ask for is ever cut short. */
export const FUSE_MAX_FUSED_STEPS = 96;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/** How many steps the fused result runs for a pair of hand lengths. */
export function fusedLengthFor(left: number, right: number): number {
  if (left <= 0 || right <= 0) return Math.max(left, right, 0);
  return (left / greatestCommonDivisor(left, right)) * right;
}

function isFuseLength(value: unknown): value is FuseLength {
  return FUSE_LENGTHS.includes(value as FuseLength);
}

/**
 * One hand's settings for making a new path. They shape the next Regenerate on
 * that hand only; the path already on screen never changes when they do.
 * Changing the current path is a transform (adjustSource), not a setting.
 */
export interface FuseHandRecipe {
  length: FuseLength;
  level: TurnLevel;
  maxTurnIntensity: number;
  gridMode: GridMode;
  constraintPreset: SoloLoopGenerationRecipe["constraintPreset"];
  handPathMode: SoloLoopGenerationRecipe["handPathMode"];
  motionTypeFilter: SoloLoopGenerationRecipe["motionTypeFilter"];
  startLocation: GridLocation | null;
  startOrientation: Orientation | null;
  traversalDirection: SoloLoopTraversalDirection | null;
}

/** The reactive view of one hand's recipe the settings editors bind to. Field
 * names match the editors' long-standing reads so one editor serves either hand. */
export interface FuseHandRecipeControls {
  readonly side: FuseSide;
  readonly requestedLength: FuseLength;
  readonly generationLevel: TurnLevel;
  readonly maxTurnIntensity: number;
  readonly gridMode: GridMode;
  readonly constraintPreset: SoloLoopGenerationRecipe["constraintPreset"];
  readonly handPathMode: SoloLoopGenerationRecipe["handPathMode"];
  readonly motionTypeFilter: SoloLoopGenerationRecipe["motionTypeFilter"];
  readonly startLocation: GridLocation | null;
  readonly startOrientation: Orientation | null;
  readonly traversalDirection: SoloLoopTraversalDirection | null;
  setLength(value: FuseLength): void;
  setGenerationLevel(value: number): void;
  setMaxTurnIntensity(value: number): void;
  setGridMode(value: GridMode): void;
  setConstraintPreset(
    value: SoloLoopGenerationRecipe["constraintPreset"]
  ): void;
  setHandPathMode(value: SoloLoopGenerationRecipe["handPathMode"]): void;
  setMotionTypeFilter(
    value: SoloLoopGenerationRecipe["motionTypeFilter"]
  ): void;
  setStartLocation(value: GridLocation | null): void;
  setStartOrientation(value: Orientation | null): void;
  setTraversalDirection(value: SoloLoopTraversalDirection | null): void;
}

/** Top-of-tab Fuse mode. `shuffle` = two independent paths (the original
 * behavior); `symmetry` = one driver path with the follower derived from it via
 * a transform. Persisted per-device. */
export type FuseMode = "shuffle" | "symmetry";

/**
 * The rule the symmetry follower derives through. Its four axes and the order
 * they apply in live in domain/fuse-rule.ts; this state owns only which rule is
 * active and how it reaches the transform layer.
 */
export type { FuseRule, FuseReflection } from "../domain/fuse-rule";

export type FuseErrorKind =
  | "catalog"
  | "empty"
  | "candidate"
  | "preview"
  | "derivation"
  | "viewer";

export interface FuseErrorState {
  kind: FuseErrorKind;
  message: string;
  side?: FuseSide;
}

export interface FuseStateDeps {
  browseLoader: FuseBrowseLoader;
  deriveLetters: (sequence: SequenceData) => Promise<SequenceData>;
  errorHandler: Pick<ErrorHandler, "showUserError">;
  initialLength?: FuseLength;
  random?: () => number;
  prefersReducedMotion?: () => boolean;
  /** Browser-backed one-prop generator. Optional so state tests and non-browser
   * consumers can still exercise the legacy injected catalog seam. FuseTab
   * always supplies it. */
  generateSoloLoop?: (
    length: FuseLength,
    recipe: SoloLoopGenerationRecipe
  ) => Promise<GeneratedSoloLoop>;
}

/** Kind of a non-shuffle source injected via {@link setSource}. */
export type FuseSourceKind =
  | "generated"
  | "library"
  | "vtg"
  | "custom"
  | "adjusted";

/** Where an injected (non-shuffle) source came from. Persisted per-side so a
 * restored injected source can be labeled and, for future producers, re-derived.
 * `id`/`word`/`name` identify a library pick; `label` names a VTG/custom path. */
export interface SourceOrigin {
  kind: FuseSourceKind;
  id?: string;
  word?: string;
  name?: string;
  label?: string;
  loopSpec?: GeneratedSoloLoop["loopSpec"];
}

export type FuseSourceAdjustment =
  | { kind: "rotate"; rotationSteps: -1 | 1 }
  | { kind: "mirror" }
  | { kind: "flip" }
  | { kind: "invert" }
  | { kind: "rewind" }
  | { kind: "first-step"; step: number }
  | { kind: "reset" };

/** The motion each transform draws, as Construct announces it. Rewind, a new
 * start and Reset have no single motion of their own, so the drawings travel
 * from where they stood. */
function pictographEditFor(
  adjustment: FuseSourceAdjustment
): PictographEdit | null {
  switch (adjustment.kind) {
    case "rotate":
      return {
        kind: "rotate",
        direction:
          adjustment.rotationSteps > 0 ? "clockwise" : "counterclockwise",
        steps: Math.abs(adjustment.rotationSteps),
      };
    case "mirror":
      return { kind: "reflect", axis: "vertical" };
    case "flip":
      return { kind: "reflect", axis: "horizontal" };
    case "invert":
      return { kind: "spin" };
    default:
      return null;
  }
}

/** The injected side's solo path serialized for a self-contained restore — no
 * library round-trip or producer dependency needed to rebuild it after HMR. */
interface PersistedSolo {
  steps: SoloPropStepData[];
  startLocation: GridLocation;
  startOrientation: Orientation;
}

/** Identity of one persisted source pick. The three identity fields are kept so
 * restore can hydrate a shuffled pick by id (the disambiguating key) and fall
 * back to word/name. An injected source additionally carries its `origin` and
 * the serialized `solo`, which together restore it without the browse pool. */
interface FusePersistedSelection {
  id: string;
  word: string;
  name: string;
  origin?: SourceOrigin;
  solo?: PersistedSolo;
}

interface PersistedFuseState {
  styleDefaultsVersion?: number;
  bpm?: number;
  length?: number;
  left?: FusePersistedSelection;
  right?: FusePersistedSelection;
  currentStep?: number;
  mode?: FuseMode;
  driverSide?: FuseSide;
  rule?: FuseRule;
  /** Each hand's settings for its next new path. A store written before the
   * hands had their own settings held one shared set at the top level; reading
   * it gives both hands that set. */
  recipes?: Record<FuseSide, FuseHandRecipe>;
}

const DEFAULT_HAND_RECIPE: FuseHandRecipe = {
  length: 8,
  level: DEFAULT_SOLO_LOOP_RECIPE.level,
  maxTurnIntensity: DEFAULT_SOLO_LOOP_RECIPE.maxTurnIntensity,
  gridMode: DEFAULT_SOLO_LOOP_RECIPE.gridMode,
  constraintPreset: DEFAULT_SOLO_LOOP_RECIPE.constraintPreset,
  handPathMode: DEFAULT_SOLO_LOOP_RECIPE.handPathMode,
  motionTypeFilter: DEFAULT_SOLO_LOOP_RECIPE.motionTypeFilter,
  startLocation: DEFAULT_SOLO_LOOP_RECIPE.startLocation,
  startOrientation: DEFAULT_SOLO_LOOP_RECIPE.startOrientation,
  traversalDirection: DEFAULT_SOLO_LOOP_RECIPE.traversalDirection,
};

/**
 * Read one recipe out of a stored record, keeping each field only when it is
 * still valid and falling back to `base` field by field. The same reader serves
 * the legacy shared recipe at the top of the store and each hand's own recipe.
 */
function parseHandRecipe(
  record: Record<string, unknown>,
  base: FuseHandRecipe,
  { migrateLegacyStyle = false }: { migrateLegacyStyle?: boolean } = {}
): FuseHandRecipe {
  const recipe: FuseHandRecipe = { ...base };
  if (isFuseLength(record.length)) recipe.length = record.length;
  if (isFuseGridMode(record.gridMode)) recipe.gridMode = record.gridMode;
  const storedLevel = record.level ?? record.generationLevel;
  if (typeof storedLevel === "number" && Number.isFinite(storedLevel)) {
    recipe.level = asTurnLevel(clampToAvailableLevel(storedLevel));
  }
  recipe.maxTurnIntensity = clampMaxTurnIntensity(
    typeof record.maxTurnIntensity === "number" &&
      Number.isFinite(record.maxTurnIntensity)
      ? record.maxTurnIntensity
      : recipe.maxTurnIntensity,
    recipe.level
  );
  // Fuse originally persisted Mixed/Mixed/Mixed as its untouched style while
  // Generate correctly began at Smooth/Mixed/Mixed. Migrate only that exact
  // legacy baseline (including stores that predate the two secondary keys),
  // so an explicitly customized Hands or Dashes choice keeps its Prop value.
  const hasLegacyUntouchedStyle =
    migrateLegacyStyle &&
    record.styleDefaultsVersion === undefined &&
    record.constraintPreset === "mixed" &&
    (record.handPathMode === undefined || record.handPathMode === "mixed") &&
    (record.motionTypeFilter === undefined || record.motionTypeFilter === null);
  if (hasLegacyUntouchedStyle) {
    recipe.constraintPreset = DEFAULT_GENERATION_STYLE.constraintPreset;
  } else if (isContinuityPreference(record.constraintPreset)) {
    recipe.constraintPreset = record.constraintPreset;
  }
  if (isContinuityPreference(record.handPathMode)) {
    recipe.handPathMode = record.handPathMode;
  }
  if (isMotionTypeFilter(record.motionTypeFilter)) {
    recipe.motionTypeFilter = record.motionTypeFilter;
  }
  if (
    record.startLocation === null ||
    isFuseStartLocation(record.startLocation, recipe.gridMode)
  ) {
    recipe.startLocation = record.startLocation as GridLocation | null;
  } else if (
    recipe.startLocation !== null &&
    !isFuseStartLocation(recipe.startLocation, recipe.gridMode)
  ) {
    recipe.startLocation = null;
  }
  if (
    record.startOrientation === null ||
    (typeof record.startOrientation === "string" &&
      startOrientationsForLevel(recipe.level).includes(
        record.startOrientation as Orientation
      ))
  ) {
    recipe.startOrientation = record.startOrientation as Orientation | null;
  } else if (
    recipe.startOrientation !== null &&
    !startOrientationsForLevel(recipe.level).includes(recipe.startOrientation)
  ) {
    recipe.startOrientation = null;
  }
  if (
    record.traversalDirection === null ||
    isSoloTraversalDirection(record.traversalDirection)
  ) {
    recipe.traversalDirection = record.traversalDirection;
  }
  return recipe;
}

export const FUSE_DIAMOND_START_LOCATIONS = [
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
] as const;

export const FUSE_BOX_START_LOCATIONS = [
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

export function startLocationsForFuseGrid(
  gridMode: GridMode
): readonly GridLocation[] {
  return gridMode === GridMode.BOX
    ? FUSE_BOX_START_LOCATIONS
    : FUSE_DIAMOND_START_LOCATIONS;
}

function isFuseGridMode(value: unknown): value is GridMode {
  return value === GridMode.DIAMOND || value === GridMode.BOX;
}

function isContinuityPreference(
  value: unknown
): value is SoloLoopGenerationRecipe["constraintPreset"] {
  return value === "smooth" || value === "mixed" || value === "choppy";
}

function isMotionTypeFilter(
  value: unknown
): value is SoloLoopGenerationRecipe["motionTypeFilter"] {
  return value === null || value === "no-dash" || value === "prefer-dash";
}

function isFuseStartLocation(
  value: unknown,
  gridMode: GridMode
): value is GridLocation {
  return startLocationsForFuseGrid(gridMode).includes(value as GridLocation);
}

function isSoloTraversalDirection(
  value: unknown
): value is SoloLoopTraversalDirection {
  return value === "clockwise" || value === "counterclockwise";
}

/** What initialize() hands setLength so a persisted pair is restored only on the
 * mount-time load, never on a deliberate length change. */
interface FuseRestoreRequest {
  left?: FusePersistedSelection;
  right?: FusePersistedSelection;
  currentStep?: number;
}

function parseSourceOrigin(value: unknown): SourceOrigin | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const kind = record.kind;
  if (
    kind !== "generated" &&
    kind !== "library" &&
    kind !== "vtg" &&
    kind !== "custom" &&
    kind !== "adjusted"
  ) {
    return undefined;
  }
  const origin: SourceOrigin = { kind };
  if (typeof record.id === "string") origin.id = record.id;
  if (typeof record.word === "string") origin.word = record.word;
  if (typeof record.name === "string") origin.name = record.name;
  if (typeof record.label === "string") origin.label = record.label;
  if (record.loopSpec && typeof record.loopSpec === "object") {
    origin.loopSpec = record.loopSpec as GeneratedSoloLoop["loopSpec"];
  }
  return origin;
}

function parsePersistedSolo(value: unknown): PersistedSolo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const { steps, startLocation, startOrientation } = record;
  // Enum values are strings; the steps array is stored verbatim (all its fields
  // are enum/number/null, so the round-trip is lossless).
  if (
    !Array.isArray(steps) ||
    steps.length === 0 ||
    typeof startLocation !== "string" ||
    typeof startOrientation !== "string"
  ) {
    return undefined;
  }
  return {
    steps: steps as SoloPropStepData[],
    startLocation: startLocation as GridLocation,
    startOrientation: startOrientation as Orientation,
  };
}

function parsePersistedSelection(
  value: unknown
): FusePersistedSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const word = typeof record.word === "string" ? record.word : "";
  const name = typeof record.name === "string" ? record.name : "";
  const origin = parseSourceOrigin(record.origin);
  const solo = parsePersistedSolo(record.solo);
  // Need at least one identifier to hydrate the sequence later — unless an
  // injected solo makes the selection self-contained.
  if (!id && !word && !name && !solo) return undefined;
  const selection: FusePersistedSelection = { id, word, name };
  if (origin) selection.origin = origin;
  if (solo) selection.solo = solo;
  return selection;
}

function readPersistedState(): PersistedFuseState {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const record = parsed as Record<string, unknown>;
    const handPair = normalizeLegacyHandPair(record);

    // Every field is optional, so an older store holding only { bpm } still
    // parses cleanly into this widened shape.
    const result: PersistedFuseState = {};
    if (typeof record.bpm === "number") result.bpm = record.bpm;
    if (typeof record.length === "number") result.length = record.length;
    if (typeof record.currentStep === "number") {
      result.currentStep = record.currentStep;
    }
    if (record.mode === "shuffle" || record.mode === "symmetry") {
      result.mode = record.mode;
    }
    if (record.driverSide === "left" || record.driverSide === "right") {
      result.driverSide = record.driverSide;
    } else if (record.driverSide === "blue") {
      result.driverSide = "left";
    } else if (record.driverSide === "red") {
      result.driverSide = "right";
    }
    // `transformId` is the legacy key — one of nine flat ids. parseFuseRule
    // maps it onto the rule it always meant, so an existing device keeps its
    // pairing instead of snapping back to the default.
    const storedRule = parseFuseRule(record.rule ?? record.transformId);
    if (storedRule) {
      result.rule = storedRule;
    }
    if (
      typeof record.styleDefaultsVersion === "number" &&
      Number.isFinite(record.styleDefaultsVersion)
    ) {
      result.styleDefaultsVersion = record.styleDefaultsVersion;
    }
    // The shared recipe a store held before each hand had its own: both hands
    // start from it, so an existing device keeps the settings it had.
    const legacyRecipe = parseHandRecipe(record, DEFAULT_HAND_RECIPE, {
      migrateLegacyStyle: true,
    });
    const storedRecipes =
      record.recipes && typeof record.recipes === "object"
        ? (record.recipes as Record<string, unknown>)
        : {};
    const handRecipe = (side: FuseSide): FuseHandRecipe => {
      const stored = storedRecipes[side];
      return stored && typeof stored === "object"
        ? parseHandRecipe(stored as Record<string, unknown>, legacyRecipe)
        : { ...legacyRecipe };
    };
    const recipeKeys = [
      "recipes",
      "length",
      "gridMode",
      "level",
      "generationLevel",
      "maxTurnIntensity",
      "constraintPreset",
      "handPathMode",
      "motionTypeFilter",
      "startLocation",
      "startOrientation",
      "traversalDirection",
    ];
    if (recipeKeys.some((key) => key in record)) {
      result.recipes = { left: handRecipe("left"), right: handRecipe("right") };
    }
    const left = parsePersistedSelection(handPair.left);
    if (left) result.left = left;
    const right = parsePersistedSelection(handPair.right);
    if (right) result.right = right;
    return result;
  } catch {
    return {};
  }
}

function writePersistedState(data: PersistedFuseState): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...data,
          styleDefaultsVersion: STYLE_DEFAULTS_VERSION,
        })
      );
    }
  } catch {
    // A private or full browser store should not stop the current session.
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeBpm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_BPM;
  return Math.max(PLAYBACK_MIN_BPM, Math.min(PLAYBACK_MAX_BPM, value));
}

function createHydrationCache(
  browseLoader: FuseBrowseLoader
): FuseBrowseLoader {
  const hydratedSequences = new Map<string, Promise<SequenceData | null>>();

  return {
    loadSequenceMetadata: () => browseLoader.loadSequenceMetadata(),
    loadFullSequenceData: (sequenceName, sequenceId) => {
      const key = sequenceId ? `id:${sequenceId}` : `name:${sequenceName}`;
      const existing = hydratedSequences.get(key);
      if (existing) return existing;

      const request = browseLoader
        .loadFullSequenceData(sequenceName, sequenceId)
        .then((sequence) => {
          // The loader reports both a missing document and a transient read
          // failure as null. Keep the in-flight deduplication, but let a later
          // length change retry either case.
          if (!sequence) hydratedSequences.delete(key);
          return sequence;
        })
        .catch((loadError) => {
          hydratedSequences.delete(key);
          throw loadError;
        });
      hydratedSequences.set(key, request);
      return request;
    },
  };
}

function sourceReadyMessage(
  side: FuseSide,
  sequence: SequenceData,
  restored: boolean
): string {
  const left = side === "left";
  const name = simplifyRepeatedWord(getSequenceDisplayName(sequence)).trim();
  if (!name) {
    if (restored) {
      return t(
        left ? "fuse_status_left_restored" : "fuse_status_right_restored"
      );
    }
    return t(left ? "fuse_status_left_ready" : "fuse_status_right_ready");
  }
  if (restored) {
    return t(
      left
        ? "fuse_status_left_named_restored"
        : "fuse_status_right_named_restored",
      { name }
    );
  }
  return t(
    left ? "fuse_status_left_named_ready" : "fuse_status_right_named_ready",
    { name }
  );
}

export function createFuseState({
  browseLoader,
  deriveLetters,
  errorHandler,
  initialLength = 8,
  random = Math.random,
  prefersReducedMotion = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  generateSoloLoop,
}: FuseStateDeps) {
  let persisted = readPersistedState();
  const cachedBrowseLoader = createHydrationCache(browseLoader);
  const leftPool = createFuseShufflePool({
    browseLoader: cachedBrowseLoader,
    side: "left",
    random,
  });
  const rightPool = createFuseShufflePool({
    browseLoader: cachedBrowseLoader,
    side: "right",
    random,
  });

  // Each hand's settings for its next new path. A device with no stored recipe
  // starts both hands at `initialLength`.
  let recipes = $state<Record<FuseSide, FuseHandRecipe>>(
    persisted.recipes ?? {
      left: { ...DEFAULT_HAND_RECIPE, length: initialLength },
      right: { ...DEFAULT_HAND_RECIPE, length: initialLength },
    }
  );
  // How long the fused result runs once both hands are loaded: the least
  // common multiple of the two hands' own lengths. Null while a pair loads.
  let appliedLength = $state<number | null>(null);
  let bpm = $state(normalizeBpm(persisted.bpm));
  let previewSequence = $state<SequenceData | null>(null);
  // The result's word. A new result's motion arrives before its letters, and
  // the last word stays until the new one is whole, so the heading goes from
  // word to word. Null while a step has no letter.
  let previewWord = $state<string | null>(null);
  let isLoadingLength = $state(false);
  let pendingSide = $state<FuseSide | null>(null);
  let isFusing = $state(false);
  let error = $state<FuseErrorState | null>(null);
  let readyMessage = $state(t("fuse_status_both_ready"));

  let catalog: SequenceData[] | null = null;
  let catalogPromise: Promise<SequenceData[]> | null = null;
  let initialLoadPromise: Promise<void> | null = null;
  let lengthGeneration = 0;
  let buildGeneration = 0;
  let previewLetterGeneration = 0;
  let activePreviewLetterDerivation: {
    generation: number;
    promise: Promise<SequenceData>;
  } | null = null;
  let leftGeneration = 0;
  let rightGeneration = 0;
  let disposed = false;
  let hasLoadedPair = false;

  // A side that was fed a non-shuffle source (library / VTG / custom) holds its
  // origin plus the live solo here, so persistSelection can write the source
  // back and a following shuffle knows to drop it. Null = the side is on the
  // random pool. Not reactive: only persistence and shuffle read it.
  let leftOrigin: { origin: SourceOrigin; solo: SoloPropData } | null = null;
  let rightOrigin: { origin: SourceOrigin; solo: SoloPropData } | null = null;
  let leftBaseSolo: SoloPropData | null = null;
  let rightBaseSolo: SoloPropData | null = null;

  function injectedOriginFor(side: FuseSide) {
    return side === "left" ? leftOrigin : rightOrigin;
  }

  function setInjectedOrigin(
    side: FuseSide,
    origin: SourceOrigin,
    solo: SoloPropData
  ): void {
    if (side === "left") leftOrigin = { origin, solo };
    else rightOrigin = { origin, solo };
  }

  function clearInjectedOrigin(side: FuseSide): void {
    if (side === "left") leftOrigin = null;
    else rightOrigin = null;
  }

  function setBaseSolo(side: FuseSide, solo: SoloPropData): void {
    if (side === "left") leftBaseSolo = solo;
    else rightBaseSolo = solo;
  }

  function baseSoloFor(side: FuseSide): SoloPropData | null {
    return side === "left" ? leftBaseSolo : rightBaseSolo;
  }

  async function generateSource(
    side: FuseSide
  ): Promise<{ sequence: SequenceData; origin: SourceOrigin }> {
    if (!generateSoloLoop) {
      throw new Error("The solo LOOP generator is unavailable");
    }
    const generated = await generateSoloLoop(
      recipes[side].length,
      generationRecipe(side)
    );
    return {
      sequence: createCircularFuseSoloSequence(side, generated.solo),
      origin: {
        kind: "generated",
        label: "Generated solo LOOP",
        loopSpec: generated.loopSpec,
      },
    };
  }

  // Symmetry mode: one driver side keeps a source, the follower is derived from
  // it via a transform. `symmetryPreview` is the fused derived result rendered by
  // the follower card and animated (it is also assigned to previewSequence while
  // symmetry is active). The pools underneath stay untouched, so exiting symmetry
  // just rebuilds the independent preview from them.
  let mode = $state<FuseMode>(persisted.mode ?? "shuffle");
  let driverSide = $state<FuseSide>(persisted.driverSide ?? "left");
  // A persisted rule may carry a 45-degree rotation the mode picker cannot
  // express. Round it once on restore and remember that it happened, so the
  // panel can say so until the next rule change.
  const restoredRule = coerceToTnDRule(persisted.rule ?? DEFAULT_RULE);
  let rule = $state<FuseRule>(
    restoredRule.adjusted
      ? resolveFuseRule(restoredRule.selection)
      : (persisted.rule ?? DEFAULT_RULE)
  );
  let ruleAdjusted = $state(restoredRule.adjusted);
  if (restoredRule.adjusted) {
    persisted = { ...persisted, rule };
    writePersistedState(persisted);
  }

  const tndSelection = $derived<FuseTnDSelection>(
    classifyFuseRule(rule) ?? DEFAULT_TND_SELECTION
  );

  const tndCheck = $derived<FuseTnDCheck | null>(
    mode === "symmetry" && previewSequence
      ? checkFuseTnD(previewSequence, tndSelection.mode)
      : null
  );
  let symmetryPreview = $state<SequenceData | null>(null);
  let symmetryGeneration = 0;
  let relationshipDraftKey: string | null = null;
  // The draft the pairing editor is currently showing. While it is set, the
  // follower card reads these instead of the committed values, so picking a
  // rule rebuilds the follower's steps in place rather than only the fused
  // canvas. Cancel restores both halves of the baseline.
  // `source` is the path the drafted leader plays when that is not its own
  // deck's: a hand takes the lead with the path it already has on screen.
  let relationshipDraft = $state<{
    driver: FuseSide;
    transform: FuseRule;
    source: SequenceData | null;
  } | null>(null);
  let relationshipRequest = 0;
  let relationshipApplying = false;
  let activeDerive: Promise<void> | null = null;
  let relationshipPreviewBaseline: {
    preview: SequenceData | null;
    symmetry: SequenceData | null;
  } | null = null;
  // True while a symmetry follower derive is in flight. Blocks Fuse so a tap
  // mid-derive can't build the driver's stale independent preview — deriveFollower
  // is the sole writer of previewSequence in symmetry mode.
  let isDeriving = $state(false);

  let currentStep = $state(0);
  let clockRunning = $state(false);
  let clockFrame: number | null = null;
  let lastClockTimestamp: number | null = null;
  let lastStepPersistAt: number | null = null;
  let startHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let waitingAtStart = $state(false);

  function poolFor(side: FuseSide): FuseShufflePool {
    return side === "left" ? leftPool : rightPool;
  }

  function otherPool(side: FuseSide): FuseShufflePool {
    return side === "left" ? rightPool : leftPool;
  }

  function sideGeneration(side: FuseSide): number {
    return side === "left" ? leftGeneration : rightGeneration;
  }

  function incrementSideGeneration(side: FuseSide): number {
    if (side === "left") return ++leftGeneration;
    return ++rightGeneration;
  }

  async function getCatalog(): Promise<SequenceData[]> {
    if (catalog) return catalog;
    if (catalogPromise) return catalogPromise;

    catalogPromise = browseLoader.loadSequenceMetadata();
    try {
      catalog = await catalogPromise;
      return catalog;
    } finally {
      catalogPromise = null;
    }
  }

  /** Steps in one hand's solo path. */
  function soloLength(solo: SoloPropData): number {
    return solo.steps.length;
  }

  /** How long a pair of hand sources fuses to, or null when either is missing
   * its one-hand path. */
  function pairLength(left: SequenceData, right: SequenceData): number | null {
    if (!left.leftSoloProp || !right.rightSoloProp) return null;
    return fusedLengthFor(
      soloLength(left.leftSoloProp),
      soloLength(right.rightSoloProp)
    );
  }

  /** Fuse two hand sources. Each hand keeps its own length; the result runs for
   * the least common multiple of the two, which always fits under
   * FUSE_MAX_FUSED_STEPS for lengths the recipes can ask for. */
  function createPreview(
    left: SequenceData,
    right: SequenceData
  ): SequenceData {
    if (!left.leftSoloProp || !right.rightSoloProp) {
      throw new Error(
        "The selected sources are missing compositional path data"
      );
    }

    const length = pairLength(left, right)!;
    if (length > FUSE_MAX_FUSED_STEPS) {
      throw new Error(
        `The two paths would fuse to ${length} steps, past the ${FUSE_MAX_FUSED_STEPS}-step limit`
      );
    }
    const preview = fuseSequences(left.leftSoloProp, right.rightSoloProp, {
      maxSteps: FUSE_MAX_FUSED_STEPS,
    });
    if (preview.steps.length !== length) {
      throw new Error(
        `Combined preview has ${preview.steps.length} steps instead of ${length}`
      );
    }
    return preview;
  }

  /** The sequence's word, or null while any of its steps has no letter. */
  function wholeWord(sequence: SequenceData): string | null {
    const status = deriveWordStatusFromSteps(sequence.steps);
    return status.complete && status.word ? status.word : null;
  }

  /**
   * Publish motion immediately, then decorate that exact preview with the
   * canonical fused letters. Letter derivation must never hold up an in-place
   * path swap, and the generation guard prevents a late result from replacing
   * a newer Shuffle, Back, or relationship preview.
   */
  function publishPreview(
    preview: SequenceData,
    { syncSymmetry = false }: { syncSymmetry?: boolean } = {}
  ): void {
    const generation = ++previewLetterGeneration;
    previewSequence = preview;
    previewWord = wholeWord(preview) ?? previewWord;
    appliedLength = preview.steps.length;
    if (syncSymmetry) symmetryPreview = preview;
    const derivation = deriveLetters(preview);
    activePreviewLetterDerivation = { generation, promise: derivation };

    void (async () => {
      try {
        const derived = await derivation;
        if (disposed || generation !== previewLetterGeneration) return;
        previewSequence = derived;
        previewWord = wholeWord(derived);
        if (syncSymmetry) symmetryPreview = derived;
      } catch (derivationError) {
        if (disposed || generation !== previewLetterGeneration) return;
        previewWord = null;
        reportUnexpected(
          t("fuse_error_live_letter"),
          derivationError,
          "derive-preview-letters"
        );
      } finally {
        if (activePreviewLetterDerivation?.generation === generation) {
          activePreviewLetterDerivation = null;
        }
      }
    })();
  }

  /**
   * The pool sequence committed for an injected side: the side's own solo
   * projected through the canonical adapter, at the solo's own length. Each hand
   * keeps its length; the fuser tiles the pair to their common multiple, so a
   * source is never stretched to match its partner. Source identity fields stay
   * stable for display and persistence.
   */
  function projectInjectedSide(
    side: FuseSide,
    injected: SequenceData,
    solo: SoloPropData
  ): SequenceData {
    const projected = createCircularFuseSoloSequence(side, solo);
    return {
      ...injected,
      ...projected,
      // Keep the source's identity for display and persistence, but never its
      // paired choreography. The projected sequence is the sole owner of the
      // source steps, start pose, and compositional fields.
      id: injected.id,
      name: injected.name,
      displayName: injected.displayName,
      intendedWord: injected.intendedWord,
      word: injected.word,
      tags: injected.tags,
      metadata: {
        ...injected.metadata,
        ...projected.metadata,
      },
      sequenceLength: soloLength(solo),
      leftSoloProp: side === "left" ? solo : undefined,
      rightSoloProp: side === "right" ? solo : undefined,
      stepPairings: undefined,
      leftPathHash: side === "left" ? projected.leftPathHash : undefined,
      rightPathHash: side === "right" ? projected.rightPathHash : undefined,
      leftSoloHash: side === "left" ? projected.leftSoloHash : undefined,
      rightSoloHash: side === "right" ? projected.rightSoloHash : undefined,
    };
  }

  /** Prepare one side's restored pool sequence. An injected selection re-arms
   * its origin (so persistence and a later shuffle behave) and commits the
   * length-matched solo; a shuffled selection clears any origin and commits its
   * hydrated library sequence unchanged. */
  function commitRestoredSide(
    side: FuseSide,
    selection: FusePersistedSelection,
    rebuilt: SequenceData
  ): SequenceData {
    if (selection.origin && selection.solo) {
      const solo =
        side === "left" ? rebuilt.leftSoloProp : rebuilt.rightSoloProp;
      if (solo) {
        setInjectedOrigin(side, selection.origin, solo);
        return projectInjectedSide(side, rebuilt, solo);
      }
      return rebuilt;
    }
    clearInjectedOrigin(side);
    return rebuilt;
  }

  function reportUnexpected(
    message: string,
    technicalError: unknown,
    action: string
  ): void {
    const cause = asError(technicalError);
    errorHandler.showUserError({
      message,
      technicalDetails: cause.message,
      error: cause,
      severity: "warning",
      context: { module: "create", tab: "fuse", action },
    });
  }

  function isCurrentLengthGeneration(generation: number): boolean {
    return !disposed && generation === lengthGeneration;
  }

  function isCurrentSideGeneration(
    side: FuseSide,
    generation: number
  ): boolean {
    return !disposed && generation === sideGeneration(side);
  }

  /** How long the playing preview should run. Separate: the common multiple
   * of the two hands. Linked: the leading hand's own length, since the
   * follower is rebuilt from it step for step. */
  function expectedPreviewLength(
    left: SequenceData,
    right: SequenceData
  ): number | null {
    if (mode === "symmetry") {
      const driverSolo =
        driverSide === "left" ? left.leftSoloProp : right.rightSoloProp;
      return driverSolo ? soloLength(driverSolo) : null;
    }
    return pairLength(left, right);
  }

  function canFuseNow(): boolean {
    const leftSequence = leftPool.sequence;
    const rightSequence = rightPool.sequence;
    const preview = previewSequence;

    return (
      !!leftSequence?.leftSoloProp &&
      !!rightSequence?.rightSoloProp &&
      !!preview &&
      appliedLength !== null &&
      preview.steps.length === appliedLength &&
      preview.steps.length ===
        expectedPreviewLength(leftSequence, rightSequence) &&
      !isLoadingLength &&
      pendingSide === null &&
      !isFusing &&
      !isDeriving &&
      (error === null || error.kind === "viewer")
    );
  }

  function statusMessage(): string {
    if (isFusing) return t("fuse_status_building");
    if (isLoadingLength) return t("fuse_status_loading_two");
    if (pendingSide) {
      return t(
        pendingSide === "left"
          ? "fuse_status_loading_left"
          : "fuse_status_loading_right"
      );
    }
    if (isDeriving) return t("fuse_status_previewing_linked");
    if (error) return error.message;
    if (canFuseNow()) return readyMessage;
    return t("fuse_status_generate_each");
  }

  function serializeSolo(solo: SoloPropData): PersistedSolo {
    return {
      steps: solo.steps.map((step) => ({ ...step })),
      startLocation: solo.startLocation,
      startOrientation: solo.startOrientation,
    };
  }

  function persistedSelectionFor(
    side: FuseSide,
    sequence: SequenceData
  ): FusePersistedSelection {
    const selection: FusePersistedSelection = {
      id: sequence.id,
      word: sequence.word,
      name: sequence.name,
    };
    const injected = injectedOriginFor(side);
    if (injected) {
      selection.origin = injected.origin;
      selection.solo = serializeSolo(injected.solo);
    }
    return selection;
  }

  function persistSelection(
    leftSequence: SequenceData,
    rightSequence: SequenceData
  ): void {
    // Merge into the current store so writing the pair never drops bpm or the
    // persisted step. Each side carries its injected origin when it has one.
    // The pair's combined length is not stored: each restored hand brings its
    // own length back with its path.
    const { length: _staleLength, ...rest } = persisted;
    persisted = {
      ...rest,
      left: persistedSelectionFor("left", leftSequence),
      right: persistedSelectionFor("right", rightSequence),
    };
    writePersistedState(persisted);
  }

  function persistStep(): void {
    // Merge so the step write never drops the persisted pair, length, or bpm.
    persisted = { ...persisted, currentStep };
    writePersistedState(persisted);
  }

  function persistModeState(): void {
    // Merge so the mode write never drops the persisted pair, length, or step.
    persisted = { ...persisted, mode, driverSide, rule };
    writePersistedState(persisted);
  }

  function generationRecipe(side: FuseSide): SoloLoopGenerationRecipe {
    const recipe = recipes[side];
    return {
      gridMode: recipe.gridMode,
      level: recipe.level,
      maxTurnIntensity: recipe.level === 1 ? 0 : recipe.maxTurnIntensity,
      constraintPreset: recipe.constraintPreset,
      handPathMode: recipe.handPathMode,
      motionTypeFilter: recipe.motionTypeFilter,
      startLocation: recipe.startLocation,
      startOrientation: recipe.startOrientation,
      traversalDirection: recipe.traversalDirection,
    };
  }

  function persistRecipes(): void {
    persisted = {
      ...persisted,
      recipes: {
        left: { ...recipes.left },
        right: { ...recipes.right },
      },
    };
    writePersistedState(persisted);
  }

  /** Change one hand's settings for its next new path. Never touches the path
   * on screen: Regenerate is what applies them. */
  function updateRecipe(side: FuseSide, patch: Partial<FuseHandRecipe>): void {
    recipes[side] = { ...recipes[side], ...patch };
    persistRecipes();
  }

  function setRecipeLength(side: FuseSide, value: FuseLength): void {
    if (!isFuseLength(value)) return;
    updateRecipe(side, { length: value });
  }

  function setGenerationLevel(side: FuseSide, value: number): void {
    const nextLevel = asTurnLevel(value);
    const current = recipes[side];
    updateRecipe(side, {
      level: nextLevel,
      maxTurnIntensity: clampMaxTurnIntensity(
        current.maxTurnIntensity,
        nextLevel
      ),
      startOrientation:
        current.startOrientation !== null &&
        !startOrientationsForLevel(nextLevel).includes(current.startOrientation)
          ? null
          : current.startOrientation,
    });
  }

  function setMaxTurnIntensity(side: FuseSide, value: number): void {
    const level = recipes[side].level;
    if (level === 1) return;
    if (!maxTurnIntensitiesForLevel(level).includes(value)) return;
    updateRecipe(side, { maxTurnIntensity: value });
  }

  function setGridMode(side: FuseSide, value: GridMode): void {
    if (!isFuseGridMode(value)) return;
    const current = recipes[side];
    updateRecipe(side, {
      gridMode: value,
      startLocation:
        current.startLocation !== null &&
        !isFuseStartLocation(current.startLocation, value)
          ? null
          : current.startLocation,
    });
  }

  function setStartLocation(side: FuseSide, value: GridLocation | null): void {
    if (value !== null && !isFuseStartLocation(value, recipes[side].gridMode)) {
      return;
    }
    updateRecipe(side, { startLocation: value });
  }

  function setStartOrientation(
    side: FuseSide,
    value: Orientation | null
  ): void {
    if (
      value !== null &&
      !startOrientationsForLevel(recipes[side].level).includes(value)
    ) {
      return;
    }
    updateRecipe(side, { startOrientation: value });
  }

  /** The reactive controls one hand's settings editor binds to. */
  function createRecipeControls(side: FuseSide): FuseHandRecipeControls {
    return {
      side,
      get requestedLength() {
        return recipes[side].length;
      },
      get generationLevel() {
        return recipes[side].level;
      },
      get maxTurnIntensity() {
        return recipes[side].maxTurnIntensity;
      },
      get gridMode() {
        return recipes[side].gridMode;
      },
      get constraintPreset() {
        return recipes[side].constraintPreset;
      },
      get handPathMode() {
        return recipes[side].handPathMode;
      },
      get motionTypeFilter() {
        return recipes[side].motionTypeFilter;
      },
      get startLocation() {
        return recipes[side].startLocation;
      },
      get startOrientation() {
        return recipes[side].startOrientation;
      },
      get traversalDirection() {
        return recipes[side].traversalDirection;
      },
      setLength: (value) => setRecipeLength(side, value),
      setGenerationLevel: (value) => setGenerationLevel(side, value),
      setMaxTurnIntensity: (value) => setMaxTurnIntensity(side, value),
      setGridMode: (value) => setGridMode(side, value),
      setConstraintPreset: (value) =>
        updateRecipe(side, { constraintPreset: value }),
      setHandPathMode: (value) => updateRecipe(side, { handPathMode: value }),
      setMotionTypeFilter: (value) =>
        updateRecipe(side, { motionTypeFilter: value }),
      setStartLocation: (value) => setStartLocation(side, value),
      setStartOrientation: (value) => setStartOrientation(side, value),
      setTraversalDirection: (value) =>
        updateRecipe(side, { traversalDirection: value }),
    };
  }

  const recipeControls: Record<FuseSide, FuseHandRecipeControls> = {
    left: createRecipeControls("left"),
    right: createRecipeControls("right"),
  };

  /** Rebuild an injected side from its persisted solo alone — self-contained,
   * so a picked/built path survives HMR without the browse pool or a producer.
   * The returned sequence carries only the side's soloProp; the restore path
   * length-matches it against the freshly-built preview before committing. */
  function rebuildInjectedSide(
    side: FuseSide,
    persistedSolo: PersistedSolo
  ): SequenceData | null {
    try {
      const solo = createSoloProp(
        persistedSolo.steps,
        persistedSolo.startLocation,
        persistedSolo.startOrientation
      );
      return createSequenceData(
        side === "left" ? { leftSoloProp: solo } : { rightSoloProp: solo }
      );
    } catch {
      return null;
    }
  }

  async function hydrateRestoredSide(
    side: FuseSide,
    selection: FusePersistedSelection
  ): Promise<SequenceData | null> {
    // An injected source (library / VTG / custom) restores from its serialized
    // solo, self-contained — no browse hydrate needed.
    if (selection.origin && selection.solo) {
      return rebuildInjectedSide(side, selection.solo);
    }

    let hydrated: SequenceData | null;
    try {
      hydrated = await cachedBrowseLoader.loadFullSequenceData(
        selection.word || selection.name,
        selection.id || undefined
      );
    } catch {
      // Restore is best-effort; a failed hydrate falls back to a random pick.
      return null;
    }
    if (!hydrated) return null;

    // A library side restores only at the length its hand currently asks for.
    const length = recipes[side].length;
    const matchesLength =
      hydrated.steps.length === length || hydrated.sequenceLength === length;
    const hasSideData =
      side === "left" ? !!hydrated.leftSoloProp : !!hydrated.rightSoloProp;
    return matchesLength && hasSideData ? hydrated : null;
  }

  async function hydrateRestoredPair(
    leftSelection: FusePersistedSelection,
    rightSelection: FusePersistedSelection
  ): Promise<{ left: SequenceData; right: SequenceData } | null> {
    const [left, right] = await Promise.all([
      hydrateRestoredSide("left", leftSelection),
      hydrateRestoredSide("right", rightSelection),
    ]);
    return left && right ? { left, right } : null;
  }

  function tickClock(now: number): void {
    if (!clockRunning) return;
    if (lastClockTimestamp !== null) {
      const elapsed = now - lastClockTimestamp;
      currentStep += elapsed * (bpm / 60_000);
    }
    lastClockTimestamp = now;
    if (
      lastStepPersistAt === null ||
      now - lastStepPersistAt >= STEP_PERSIST_INTERVAL_MS
    ) {
      lastStepPersistAt = now;
      persistStep();
    }
    clockFrame = requestAnimationFrame(tickClock);
  }

  function clearStartHold(): void {
    if (startHoldTimer !== null) clearTimeout(startHoldTimer);
    startHoldTimer = null;
    waitingAtStart = false;
  }

  function startClock(): void {
    clearStartHold();
    if (
      clockRunning ||
      !previewSequence ||
      typeof requestAnimationFrame === "undefined"
    ) {
      return;
    }
    clockRunning = true;
    lastClockTimestamp = null;
    clockFrame = requestAnimationFrame(tickClock);
  }

  function stopClock(): void {
    clearStartHold();
    clockRunning = false;
    if (clockFrame !== null && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(clockFrame);
    }
    clockFrame = null;
    lastClockTimestamp = null;
    // Don't persist here: setLength resets currentStep to 0 and then calls
    // stopClock, so persisting in this path would clobber the stored step
    // before restore can read it. Callers that mean "pause" persist explicitly.
    lastStepPersistAt = null;
  }

  function toggleClock(): void {
    if (clockRunning) {
      stopClock();
      // Capture where playback paused so a remount resumes near it.
      persistStep();
    } else startClock();
  }

  /**
   * Take both hands and the result to one step of a path that is `pathSteps`
   * long, keeping the moment within the step and whether the clock was running.
   * A path shorter than the result repeats, and the step lands in the repeat
   * already playing.
   */
  function seekToStep(stepIndex: number, pathSteps: number): void {
    if (!previewSequence || stepIndex < 0 || stepIndex >= pathSteps) return;
    const wholeStep = Math.floor(currentStep);
    const pass = Math.floor(wholeStep / pathSteps);
    currentStep = pass * pathSteps + stepIndex + (currentStep - wholeStep);
    clearStartHold();
    persistStep();
  }

  /** Park at the starting position, hold a moment, then play. */
  function seekToStart(): void {
    if (!previewSequence) return;
    stopClock();
    currentStep = 0;
    persistStep();
    waitingAtStart = true;
    startHoldTimer = setTimeout(startClock, START_HOLD_MS);
  }

  /**
   * Load a fresh pair: each hand gets a new path from its own settings, at its
   * own length. A mount-time restore request brings back the exact two paths
   * that were on screen instead.
   */
  async function loadPair(restore?: FuseRestoreRequest): Promise<void> {
    const generation = ++lengthGeneration;
    leftGeneration += 1;
    rightGeneration += 1;
    buildGeneration += 1;
    appliedLength = null;
    isLoadingLength = true;
    pendingSide = null;
    isFusing = false;
    error = null;
    readyMessage = t("fuse_status_both_ready");
    previewLetterGeneration += 1;
    activePreviewLetterDerivation = null;
    previewSequence = null;
    previewWord = null;
    leftPool.reset([], recipes.left.length);
    rightPool.reset([], recipes.right.length);
    // A fresh pair loads new paths; drop any injected origins. The restore path
    // below re-sets them for a side it rehydrates as injected.
    leftOrigin = null;
    rightOrigin = null;
    currentStep = 0;

    const resumeAfterLoad =
      clockRunning || (!hasLoadedPair && !prefersReducedMotion());
    stopClock();

    try {
      if (!generateSoloLoop) {
        const sequences = await getCatalog();
        if (!isCurrentLengthGeneration(generation)) return;

        leftPool.reset(sequences, recipes.left.length);
        rightPool.reset(sequences, recipes.right.length);
        if (leftPool.poolSize === 0 || rightPool.poolSize === 0) {
          const missing: FuseSide = leftPool.poolSize === 0 ? "left" : "right";
          error = {
            kind: "empty",
            message: t(
              missing === "left"
                ? "fuse_error_no_paths_left"
                : "fuse_error_no_paths_right",
              { length: recipes[missing].length }
            ),
          };
          return;
        }
      }

      // Mount-time restore: hydrate the two persisted sources instead of
      // landing on a fresh pick. Any miss (hydrate returns null, wrong length,
      // missing side data, or the preview can't be built) falls through to the
      // fresh path below.
      if (restore?.left && restore.right) {
        const restoredPair = await hydrateRestoredPair(
          restore.left,
          restore.right
        );
        if (!isCurrentLengthGeneration(generation)) return;

        if (restoredPair) {
          try {
            // Re-establish per-side injected origins. An injected side's
            // rebuilt sequence carries only its solo, so it is projected at its
            // own length; a shuffled side commits its library sequence as is.
            const leftRestored = commitRestoredSide(
              "left",
              restore.left,
              restoredPair.left
            );
            const rightRestored = commitRestoredSide(
              "right",
              restore.right,
              restoredPair.right
            );
            const preview = createPreview(leftRestored, rightRestored);
            if (!isCurrentLengthGeneration(generation)) return;

            leftPool.commitRestored(leftRestored);
            rightPool.commitRestored(rightRestored);
            if (leftRestored.leftSoloProp) {
              setBaseSolo("left", leftRestored.leftSoloProp);
            }
            if (rightRestored.rightSoloProp) {
              setBaseSolo("right", rightRestored.rightSoloProp);
            }
            publishPreview(preview);
            hasLoadedPair = true;
            persistSelection(leftRestored, rightRestored);
            // The Fuse clock is a local rAF accumulator (see tickClock); its
            // step value is just this `currentStep` state, so assigning it here
            // IS the seek — FuseAnimationPreview's reactive effect re-derives the
            // visible beat from currentStep. No separate clock/seek API exists.
            if (
              typeof restore.currentStep === "number" &&
              Number.isFinite(restore.currentStep)
            ) {
              currentStep = restore.currentStep;
            }
            // Warm the next Shuffle for both sides so the first tap is instant.
            leftPool.prefetchNext();
            rightPool.prefetchNext();
            // A persisted symmetry session derives the follower over the restored
            // independent pair once both pools are committed.
            if (mode === "symmetry") void deriveFollower();
            if (resumeAfterLoad) startClock();
            return;
          } catch {
            if (!isCurrentLengthGeneration(generation)) return;
            // Restore is best-effort: if the persisted sources can no longer
            // form a valid preview, fall through to a fresh pair.
          }
        }
      }

      const [leftCandidate, rightCandidate] = generateSoloLoop
        ? await Promise.all([
            generateSource("left").then((generated) => ({
              sequence: generated.sequence,
              poolPosition: 0,
              nextCursor: 0,
              origin: generated.origin,
            })),
            generateSource("right").then((generated) => ({
              sequence: generated.sequence,
              poolPosition: 0,
              nextCursor: 0,
              origin: generated.origin,
            })),
          ])
        : await Promise.all([leftPool.stageNext(), rightPool.stageNext()]);
      if (!isCurrentLengthGeneration(generation)) return;

      if (!leftCandidate || !rightCandidate) {
        const missing: FuseSide = leftCandidate ? "right" : "left";
        error = {
          kind: "empty",
          message: t(
            missing === "left"
              ? "fuse_error_no_paths_left"
              : "fuse_error_no_paths_right",
            { length: recipes[missing].length }
          ),
        };
        return;
      }

      const preview = createPreview(
        leftCandidate.sequence,
        rightCandidate.sequence
      );
      if (!isCurrentLengthGeneration(generation)) return;

      leftPool.commit(leftCandidate, true);
      rightPool.commit(rightCandidate, true);
      const leftGeneratedOrigin = (
        leftCandidate as typeof leftCandidate & { origin?: SourceOrigin }
      ).origin;
      const rightGeneratedOrigin = (
        rightCandidate as typeof rightCandidate & { origin?: SourceOrigin }
      ).origin;
      if (leftCandidate.sequence.leftSoloProp) {
        setBaseSolo("left", leftCandidate.sequence.leftSoloProp);
        if (leftGeneratedOrigin) {
          setInjectedOrigin(
            "left",
            leftGeneratedOrigin,
            leftCandidate.sequence.leftSoloProp
          );
        }
      }
      if (rightCandidate.sequence.rightSoloProp) {
        setBaseSolo("right", rightCandidate.sequence.rightSoloProp);
        if (rightGeneratedOrigin) {
          setInjectedOrigin(
            "right",
            rightGeneratedOrigin,
            rightCandidate.sequence.rightSoloProp
          );
        }
      }
      publishPreview(preview);
      hasLoadedPair = true;
      persistSelection(leftCandidate.sequence, rightCandidate.sequence);
      if (!generateSoloLoop) {
        // The legacy browse deck can hydrate its next candidate ahead of time.
        leftPool.prefetchNext();
        rightPool.prefetchNext();
      }
      if (mode === "symmetry") void deriveFollower();
      if (resumeAfterLoad) startClock();
    } catch (loadError) {
      if (!isCurrentLengthGeneration(generation)) return;
      error = {
        kind: "catalog",
        message: generateSoloLoop
          ? t("fuse_error_generate_failed")
          : t("fuse_error_load_failed"),
      };
      reportUnexpected(error.message, loadError, "load-paths");
    } finally {
      if (isCurrentLengthGeneration(generation)) isLoadingLength = false;
    }
  }

  /** Set both hands to one length and load a fresh pair at it. Kept for
   * callers that think in one shared length; the hand settings are the owner. */
  async function setLength(length: FuseLength): Promise<void> {
    if (!isFuseLength(length)) return;
    recipes = {
      left: { ...recipes.left, length },
      right: { ...recipes.right, length },
    };
    persistRecipes();
    await loadPair();
  }

  function initialize(): Promise<void> {
    // Only the mount-time load restores a persisted pair. Snapshot the persisted
    // fields by value now (loadPair resets currentStep before it reads them, so
    // passing them as an argument protects them from that reset).
    return (initialLoadPromise ??= loadPair({
      left: persisted.left,
      right: persisted.right,
      currentStep: persisted.currentStep,
    }));
  }

  async function shuffle(side: FuseSide): Promise<void> {
    if (
      disposed ||
      isLoadingLength ||
      pendingSide !== null ||
      isFusing ||
      appliedLength === null
    ) {
      return;
    }

    const generation = incrementSideGeneration(side);
    const pool = poolFor(side);
    const counterpart = otherPool(side);
    pendingSide = side;
    error = null;

    try {
      const candidate = generateSoloLoop
        ? await generateSource(side).then((generated) => ({
            sequence: generated.sequence,
            poolPosition: 0,
            nextCursor: 0,
            origin: generated.origin,
          }))
        : await pool.stageNext();
      if (!isCurrentSideGeneration(side, generation)) return;

      if (!candidate || !counterpart.sequence) {
        error = {
          kind: "candidate",
          side,
          message: t(
            side === "left"
              ? "fuse_error_another_left"
              : "fuse_error_another_right"
          ),
        };
        return;
      }

      const left = side === "left" ? candidate.sequence : counterpart.sequence;
      const right =
        side === "right" ? candidate.sequence : counterpart.sequence;
      const preview = createPreview(left, right);
      if (!isCurrentSideGeneration(side, generation)) return;

      pool.commit(candidate, false);
      const generatedSolo =
        side === "left"
          ? candidate.sequence.leftSoloProp
          : candidate.sequence.rightSoloProp;
      const generatedOrigin = (
        candidate as typeof candidate & { origin?: SourceOrigin }
      ).origin;
      if (generateSoloLoop && generatedSolo && generatedOrigin) {
        setBaseSolo(side, generatedSolo);
        setInjectedOrigin(side, generatedOrigin, generatedSolo);
      } else {
        // The legacy browse shuffle returns this side to its catalog deck.
        clearInjectedOrigin(side);
      }
      // In symmetry the driver's independent fusion is never shown — deriveFollower
      // owns previewSequence — so skip publishing it (isDeriving keeps Fuse blocked
      // until the derive lands).
      if (!(mode === "symmetry" && side === driverSide))
        publishPreview(preview);
      persistSelection(left, right);
      if (!generateSoloLoop) pool.prefetchNext();
      // Shuffling changes one path at the beat already on screen. Resetting the
      // shared beat here made both props jump back to the start of the loop.
      readyMessage = sourceReadyMessage(side, candidate.sequence, false);
      // In symmetry, a new driver source re-derives the follower over the top of
      // the independent preview shuffle just published.
      if (mode === "symmetry" && side === driverSide) void deriveFollower();
    } catch (shuffleError) {
      if (!isCurrentSideGeneration(side, generation)) return;
      error = {
        kind: "candidate",
        side,
        message: t(
          side === "left"
            ? "fuse_error_another_left"
            : "fuse_error_another_right"
        ),
      };
      reportUnexpected(error.message, shuffleError, `shuffle-${side}`);
    } finally {
      if (isCurrentSideGeneration(side, generation) && pendingSide === side) {
        pendingSide = null;
      }
    }
  }

  /**
   * Inject a non-shuffle source into one side: a library pick, a VTG path, or a
   * custom-built solo. The side's solo is extracted (a two-hand source is
   * decomposed; a single-hand source already carries the field), fused against
   * the counterpart's current path via createPreview (which tiles to the applied
   * length), committed through the pool's restore seam, and persisted with its
   * origin so it survives an HMR restore. A later shuffle(side) drops it and
   * returns the side to the random pool.
   */
  async function setSource(
    side: FuseSide,
    source: SequenceData,
    origin: SourceOrigin
  ): Promise<void> {
    if (
      disposed ||
      isLoadingLength ||
      pendingSide !== null ||
      isFusing ||
      appliedLength === null
    ) {
      return;
    }

    // A VTG path closes at the length this hand's settings ask for.
    const length = recipes[side].length;
    const counterpart = otherPool(side);
    const counterpartSeq = counterpart.sequence;
    if (!counterpartSeq) return;

    const generation = incrementSideGeneration(side);
    const pool = poolFor(side);
    pendingSide = side;
    error = null;

    try {
      // Extract this side's solo. A two-hand source is decomposed; a single-hand
      // source already carries the field. VTG sources carry the varied path in
      // `steps` — buildFlowerSequence rewrites steps, not solo-props — so any
      // solo-prop on them is the pre-variation archetype's; re-extract from steps
      // for VTG so the flower's turns + start orientation aren't dropped.
      const carriedSolo =
        side === "left" ? source.leftSoloProp : source.rightSoloProp;
      let solo =
        origin.kind === "vtg" || !carriedSolo
          ? side === "left"
            ? extractLeftSoloProp(source)
            : extractRightSoloProp(source)
          : carriedSolo;
      let effectiveOrigin = origin;
      if (origin.kind === "vtg") {
        const closed = fitSoloPathToLoop(solo, length);
        solo = closed.solo;
        effectiveOrigin = { ...origin, loopSpec: closed.loopSpec };
      } else if (
        origin.kind === "custom"
          ? !isSeamlesslyLoopable(soloPropToSequence(solo, side))
          : !isStructuredSoloLoop(solo)
      ) {
        throw new Error(
          origin.kind === "custom"
            ? "The built one-hand path does not close cleanly"
            : "The selected one-hand path is not a structured LOOP"
        );
      }

      const injected: SequenceData =
        side === "left"
          ? { ...source, leftSoloProp: solo }
          : { ...source, rightSoloProp: solo };

      const leftSeq = side === "left" ? injected : counterpartSeq;
      const rightSeq = side === "right" ? injected : counterpartSeq;
      const committed = projectInjectedSide(side, injected, solo);
      const preview = createPreview(
        side === "left" ? committed : leftSeq,
        side === "right" ? committed : rightSeq
      );
      if (!isCurrentSideGeneration(side, generation)) return;

      pool.commitRestored(committed);
      // Record the origin before persisting so the injected solo is written.
      setInjectedOrigin(side, effectiveOrigin, solo);
      setBaseSolo(side, solo);
      // Symmetry: deriveFollower owns previewSequence; don't flash the driver's
      // independent fusion (isDeriving keeps Fuse blocked until it resolves).
      if (!(mode === "symmetry" && side === driverSide))
        publishPreview(preview);
      const leftForPersist = side === "left" ? committed : counterpartSeq;
      const rightForPersist = side === "right" ? committed : counterpartSeq;
      persistSelection(leftForPersist, rightForPersist);
      readyMessage = sourceReadyMessage(side, committed, false);
      // A newly injected driver source re-derives the symmetry follower.
      if (mode === "symmetry" && side === driverSide) void deriveFollower();
    } catch (sourceError) {
      if (!isCurrentSideGeneration(side, generation)) return;
      error = {
        kind: "candidate",
        side,
        message: t(
          side === "left" ? "fuse_error_use_left" : "fuse_error_use_right"
        ),
      };
      reportUnexpected(error.message, sourceError, `set-source-${side}`);
    } finally {
      if (isCurrentSideGeneration(side, generation) && pendingSide === side) {
        pendingSide = null;
      }
    }
  }

  /** Apply a nondestructive transform to one source. The source's base solo is
   * retained separately so Reset can return to the exact generated or selected
   * LOOP. Every materialized result is rechecked for seamless closure before it
   * replaces the visible source. */
  async function adjustSource(
    side: FuseSide,
    adjustment: FuseSourceAdjustment
  ): Promise<void> {
    if (
      disposed ||
      isLoadingLength ||
      pendingSide !== null ||
      isFusing ||
      appliedLength === null
    ) {
      return;
    }

    const current = poolFor(side).sequence;
    const currentSolo =
      side === "left" ? current?.leftSoloProp : current?.rightSoloProp;
    const counterpart = otherPool(side).sequence;
    if (!currentSolo || !counterpart) return;

    const generation = incrementSideGeneration(side);
    pendingSide = side;
    error = null;

    try {
      const base = baseSoloFor(side) ?? currentSolo;
      let transformed = createCircularFuseSoloSequence(
        side,
        adjustment.kind === "reset" ? base : currentSolo
      );

      switch (adjustment.kind) {
        case "rotate":
          transformed = await rotateSequence(
            transformed,
            adjustment.rotationSteps,
            side
          );
          break;
        case "mirror":
          transformed = await mirrorSequence(transformed, side);
          break;
        case "flip":
          transformed = await flipSequence(transformed, side);
          break;
        case "invert":
          transformed = await invertSequence(transformed, side);
          break;
        case "rewind":
          transformed = await rewindSequence(transformed, side);
          break;
        case "first-step":
          transformed = shiftStartPlacement(transformed, adjustment.step);
          break;
        case "reset":
          break;
      }
      if (!isCurrentSideGeneration(side, generation)) return;
      if (!isSeamlesslyLoopable(transformed)) {
        throw new Error("The adjustment broke the one-hand LOOP boundary");
      }

      const solo =
        side === "left"
          ? extractLeftSoloProp(transformed)
          : extractRightSoloProp(transformed);
      const injected = createCircularFuseSoloSequence(side, solo);
      const leftSequence = side === "left" ? injected : counterpart;
      const rightSequence = side === "right" ? injected : counterpart;
      const preview = createPreview(leftSequence, rightSequence);
      const committed = projectInjectedSide(side, injected, solo);
      const edit = pictographEditFor(adjustment);
      if (edit) announcePictographEdit(edit);
      poolFor(side).commit(
        { sequence: committed, poolPosition: 0, nextCursor: 0 },
        false
      );
      const previousOrigin = injectedOriginFor(side)?.origin;
      setInjectedOrigin(
        side,
        {
          kind: "adjusted",
          label: "Adjusted solo LOOP",
          ...(previousOrigin?.loopSpec
            ? { loopSpec: previousOrigin.loopSpec }
            : {}),
        },
        solo
      );
      if (!(mode === "symmetry" && side === driverSide)) {
        publishPreview(preview);
      }
      const leftForPersist = side === "left" ? committed : counterpart;
      const rightForPersist = side === "right" ? committed : counterpart;
      persistSelection(leftForPersist, rightForPersist);
      readyMessage = t(
        side === "left"
          ? "fuse_status_left_adjusted"
          : "fuse_status_right_adjusted"
      );
      if (mode === "symmetry" && side === driverSide) void deriveFollower();
    } catch (adjustmentError) {
      if (!isCurrentSideGeneration(side, generation)) return;
      error = {
        kind: "candidate",
        side,
        message: t(
          side === "left" ? "fuse_error_adjust_left" : "fuse_error_adjust_right"
        ),
      };
      reportUnexpected(error.message, adjustmentError, `adjust-${side}`);
    } finally {
      if (isCurrentSideGeneration(side, generation) && pendingSide === side) {
        pendingSide = null;
      }
    }
  }

  /**
   * Apply a rule to just the driver hand, one axis at a time in the order the
   * rule declares: rotate, reflect, invert, rewind. The nine curated ids this
   * replaced each composed the same operations in this order, so every one of
   * them still produces the sequence it always did — the difference is that the
   * rotation is now whatever amount the rule carries instead of a hardcoded 90°.
   */
  async function applyDriverRule(
    sequence: SequenceData,
    nextRule: FuseRule,
    hand: FuseSide
  ): Promise<SequenceData> {
    let result = sequence;
    if (nextRule.rotationSteps > 0) {
      result = await rotateSequence(result, nextRule.rotationSteps, hand);
    }
    if (nextRule.reflect === "mirror")
      result = await mirrorSequence(result, hand);
    if (nextRule.reflect === "flip") result = await flipSequence(result, hand);
    if (nextRule.invert) result = await invertSequence(result, hand);
    if (nextRule.rewind) result = await rewindSequence(result, hand);
    return result;
  }

  /**
   * Derive the follower's solo path from the driver's sequence: transform the
   * driver hand in place, reassign those transformed motions to the follower via
   * reassignMotionHand, then extract the follower solo from the reassigned steps.
   * fuseSequences re-stamps the hand when it fuses, but reassignment here keeps
   * the extraction reading the right slot.
   */
  async function deriveFollowerSolo(
    driverSequence: SequenceData,
    driver: FuseSide,
    nextRule: FuseRule
  ): Promise<SoloPropData> {
    const follower: FuseSide = driver === "left" ? "right" : "left";
    const transformed = await applyDriverRule(driverSequence, nextRule, driver);

    // Only the driver hand was transformed, so `transformed`'s start placement and
    // its other-hand (follower) motions still hold the original source's
    // untouched follower hand. Reassign the transformed driver motions into the
    // follower slot on every step, and drop the start placement so extraction
    // reads the path start from the reassigned first step (not the stale source
    // follower hand that would otherwise sit in startPlacement.motions[follower]).
    const reassigned = updateSequenceData(transformed, {
      steps: transformed.steps.map((step) => {
        const driverMotion = step.motions[driver];
        if (!isVisibleMotion(driverMotion)) return step;
        const followerMotion = reassignMotionHand(
          driverMotion,
          follower as HandSide
        );
        return {
          ...step,
          motions: {
            left: driver === "left" ? driverMotion : followerMotion,
            right: driver === "right" ? driverMotion : followerMotion,
          },
        };
      }),
      startPlacement: undefined,
      startingPlacement: undefined,
    });

    return follower === "left"
      ? extractLeftSoloProp(reassigned)
      : extractRightSoloProp(reassigned);
  }

  function symmetryReadyMessage(): string {
    return t(
      driverSide === "left"
        ? "fuse_status_left_leads_follows"
        : "fuse_status_right_leads_follows",
      { rule: fuseRuleLabel(rule) }
    );
  }

  function soloOf(
    sequence: SequenceData | null | undefined,
    side: FuseSide
  ): SoloPropData | undefined {
    return side === "left" ? sequence?.leftSoloProp : sequence?.rightSoloProp;
  }

  function sameSolo(a: SoloPropData, b: SoloPropData): boolean {
    return (
      JSON.stringify(serializeSolo(a)) === JSON.stringify(serializeSolo(b))
    );
  }

  /** The relationship on screen: the editor's draft, or the applied one. Null
   * while the two paths are separate. */
  function shownRelationship() {
    if (relationshipDraft) return relationshipDraft;
    return mode === "symmetry"
      ? { driver: driverSide, transform: rule, source: null }
      : null;
  }

  /**
   * The path a hand leads with, when that is not its own deck's. Taking the lead
   * never swaps the path a person is looking at: the hand keeps the one on
   * screen, which until now was rebuilt from the other hand. Null means its own
   * deck already holds it.
   */
  function leadSourceFor(side: FuseSide): SequenceData | null {
    const shown = shownRelationship();
    if (!shown) return null;
    if (shown.driver === side) return shown.source;
    const solo = soloOf(symmetryPreview, side);
    if (!solo) return null;
    const own = soloOf(poolFor(side).sequence, side);
    if (own && sameSolo(own, solo)) return null;
    return projectInjectedSide(
      side,
      createCircularFuseSoloSequence(side, solo),
      solo
    );
  }

  /** Put a hand's on-screen path into its deck as the path it leads with. Its
   * earlier path stays one Previous away. */
  function commitLeadSource(side: FuseSide, source: SequenceData | null): void {
    const solo = soloOf(source, side);
    if (!source || !solo) return;
    poolFor(side).commit(
      { sequence: source, poolPosition: 0, nextCursor: 0 },
      false,
      { announce: false }
    );
    setInjectedOrigin(
      side,
      {
        kind: "adjusted",
        label: `Built from the ${side === "left" ? "Right" : "Left"} path`,
      },
      solo
    );
    setBaseSolo(side, solo);
    const left = leftPool.sequence;
    const right = rightPool.sequence;
    if (left && right) persistSelection(left, right);
  }

  /** Going Separate keeps both paths as they are on screen: a path that was
   * built from the other hand becomes that hand's own, and its earlier path
   * stays one Previous away. Must run while the relationship is still shown. */
  function keepShownPaths(): void {
    const sources = (["left", "right"] as const).map(
      (side) => [side, leadSourceFor(side)] as const
    );
    for (const [side, source] of sources) commitLeadSource(side, source);
  }

  /** Run a relationship change once no follower is being rebuilt, so it always
   * starts from a pair that is really on screen. A later change wins. Runs at
   * once when nothing is being rebuilt. */
  async function whenSettled(
    change: () => void,
    { applying = false }: { applying?: boolean } = {}
  ): Promise<void> {
    const request = ++relationshipRequest;
    relationshipApplying = applying;
    let waitedFor: Promise<void> | null = null;
    while (isDeriving && activeDerive && activeDerive !== waitedFor) {
      waitedFor = activeDerive;
      await waitedFor;
      if (disposed || request !== relationshipRequest) return;
    }
    relationshipApplying = false;
    change();
  }

  async function createRelationshipPreview(
    nextDriver: FuseSide,
    nextRule: FuseRule,
    source: SequenceData | null = null
  ): Promise<SequenceData | null> {
    const driverSequence = source ?? poolFor(nextDriver).sequence;
    const driverSolo =
      nextDriver === "left"
        ? driverSequence?.leftSoloProp
        : driverSequence?.rightSoloProp;
    if (!driverSequence || !driverSolo) return null;

    const followerSolo = await deriveFollowerSolo(
      driverSequence,
      nextDriver,
      nextRule
    );
    const leftSolo = nextDriver === "left" ? driverSolo : followerSolo;
    const rightSolo = nextDriver === "left" ? followerSolo : driverSolo;
    const length = soloLength(driverSolo);
    const preview = fuseSequences(leftSolo, rightSolo, {
      maxSteps: FUSE_MAX_FUSED_STEPS,
    });
    if (preview.steps.length !== length) {
      throw new Error(
        "The linked path did not preserve the selected sequence length"
      );
    }
    return preview;
  }

  /**
   * Recompute the symmetry follower from the current driver source + transform,
   * fuse it against the driver, and publish the result as both the follower
   * card's rendered sequence and the live preview. A generation guard drops a
   * stale derive if the driver, transform, or mode changed while it awaited.
   */
  function deriveFollower(): Promise<void> {
    const derive = rebuildFollower();
    activeDerive = derive;
    return derive;
  }

  async function rebuildFollower(): Promise<void> {
    if (disposed || mode !== "symmetry" || appliedLength === null) return;
    const generation = ++symmetryGeneration;
    isDeriving = true;
    try {
      const preview = await createRelationshipPreview(driverSide, rule);
      if (!preview) return;
      if (
        disposed ||
        generation !== symmetryGeneration ||
        mode !== "symmetry"
      ) {
        return;
      }

      if (
        disposed ||
        generation !== symmetryGeneration ||
        mode !== "symmetry"
      ) {
        return;
      }

      publishPreview(preview, { syncSymmetry: true });
      error = null;
      readyMessage = symmetryReadyMessage();
    } catch (deriveError) {
      if (disposed || generation !== symmetryGeneration) return;
      error = {
        kind: "derivation",
        message: t("fuse_error_derive_symmetric"),
      };
      reportUnexpected(error.message, deriveError, "derive-symmetry");
    } finally {
      // Clear only if this derive is still the current one — a superseding derive
      // (new driver/transform) owns the flag until it settles. Leaving symmetry
      // clears it explicitly in setMode.
      if (generation === symmetryGeneration) isDeriving = false;
    }
  }

  /** Preview a draft relationship on the combined canvas without changing the
   * persisted mode, driver, or transform. The drawer owns the draft values;
   * this method owns only their temporary rendered result. */
  async function previewRelationship(
    nextDriver: FuseSide,
    nextRule: FuseRule
  ): Promise<void> {
    let preview: Promise<void> | null = null;
    await whenSettled(() => {
      preview = rebuildRelationshipPreview(nextDriver, nextRule);
      activeDerive = preview;
    });
    await preview;
  }

  async function rebuildRelationshipPreview(
    nextDriver: FuseSide,
    nextRule: FuseRule
  ): Promise<void> {
    if (disposed || appliedLength === null) return;
    const key = `${nextDriver}:${fuseRuleKey(nextRule)}`;
    const source = leadSourceFor(nextDriver);
    if (relationshipDraftKey === null) {
      relationshipPreviewBaseline = {
        preview: previewSequence,
        symmetry: symmetryPreview,
      };
    }
    relationshipDraftKey = key;
    relationshipDraft = { driver: nextDriver, transform: nextRule, source };
    const generation = ++symmetryGeneration;
    isDeriving = true;

    try {
      const preview = await createRelationshipPreview(
        nextDriver,
        nextRule,
        source
      );
      if (
        !preview ||
        disposed ||
        generation !== symmetryGeneration ||
        relationshipDraftKey !== key
      ) {
        return;
      }
      // syncSymmetry so the follower card re-renders its steps from this draft.
      publishPreview(preview, { syncSymmetry: true });
      error = null;
      readyMessage = t(
        nextDriver === "left"
          ? "fuse_status_previewing_left_leads"
          : "fuse_status_previewing_right_leads",
        { rule: fuseRuleLabel(nextRule) }
      );
    } catch (previewError) {
      if (
        disposed ||
        generation !== symmetryGeneration ||
        relationshipDraftKey !== key
      ) {
        return;
      }
      error = {
        kind: "derivation",
        message: t("fuse_error_preview_relationship"),
      };
      reportUnexpected(error.message, previewError, "preview-relationship");
    } finally {
      if (generation === symmetryGeneration) isDeriving = false;
    }
  }

  function cancelRelationshipPreview(): void {
    if (relationshipApplying) return;
    // A change still waiting for its turn is dropped with the draft.
    relationshipRequest += 1;
    if (relationshipDraftKey === null) return;
    const baseline = relationshipPreviewBaseline;
    relationshipDraftKey = null;
    relationshipDraft = null;
    relationshipPreviewBaseline = null;
    symmetryGeneration += 1;
    isDeriving = false;
    if (baseline?.preview) {
      // Publish without syncSymmetry, then restore the follower's own baseline,
      // so the async letter derivation inside publishPreview cannot overwrite it.
      publishPreview(baseline.preview);
      symmetryPreview = baseline.symmetry;
      error = null;
      readyMessage =
        mode === "symmetry"
          ? symmetryReadyMessage()
          : t("fuse_status_both_ready");
      return;
    }
    if (mode === "symmetry") void deriveFollower();
    else restoreIndependentPreview();
  }

  /** Rebuild the independent (shuffle-mode) preview from the two pools, used when
   * leaving symmetry — the pools were never clobbered, so this restores exactly
   * the two-path state that was showing before symmetry took over the preview. */
  function restoreIndependentPreview(): void {
    const leftSequence = leftPool.sequence;
    const rightSequence = rightPool.sequence;
    if (!leftSequence || !rightSequence || appliedLength === null) return;
    try {
      publishPreview(createPreview(leftSequence, rightSequence));
      error = null;
      readyMessage = t("fuse_status_both_ready");
    } catch (restoreError) {
      reportPreviewFailure(restoreError);
    }
  }

  function setMode(next: FuseMode): void {
    if (next === mode) return;
    if (next !== "symmetry") keepShownPaths();
    relationshipDraftKey = null;
    relationshipDraft = null;
    relationshipPreviewBaseline = null;
    mode = next;
    persistModeState();
    if (next === "symmetry") {
      void deriveFollower();
    } else {
      // Cancel any in-flight derive and return to the independent two-path view.
      // Bumping the generation orphans the derive's finally, so clear isDeriving
      // here or Fuse would stay blocked in shuffle mode.
      symmetryGeneration += 1;
      isDeriving = false;
      symmetryPreview = null;
      restoreIndependentPreview();
    }
  }

  /** Commit the whole pairing decision together. The relationship composer
   * keeps its draft local, so the result does not flicker through a temporary
   * driver or transform while the user is still deciding. */
  function setRelationship(nextDriver: FuseSide, nextRule: FuseRule): void {
    const apply = (): void => {
      const source = leadSourceFor(nextDriver);
      relationshipDraftKey = null;
      relationshipDraft = null;
      relationshipPreviewBaseline = null;
      commitLeadSource(nextDriver, source);
      const changed =
        mode !== "symmetry" ||
        driverSide !== nextDriver ||
        !fuseRulesEqual(rule, nextRule);
      if (changed) {
        driverSide = nextDriver;
        rule = nextRule;
        ruleAdjusted = false;
        mode = "symmetry";
        persistModeState();
      }
      void deriveFollower();
    };
    void whenSettled(apply, { applying: true });
  }

  /**
   * Hand the lead to the other path. Both paths stay exactly as they are on
   * screen: the new leader keeps the path it was showing, and the rule turns
   * round so it still describes the same pair. What changes is which hand a new
   * path, an edit or a rule change starts from.
   */
  function setDriver(side: FuseSide): void {
    const handOver = (): void => {
      if (side === driverSide) return;
      if (mode === "symmetry") {
        commitLeadSource(side, leadSourceFor(side));
        rule = inverseFuseRule(rule);
      }
      driverSide = side;
      persistModeState();
      if (mode !== "symmetry") return;
      if (symmetryPreview) readyMessage = symmetryReadyMessage();
      else void deriveFollower();
    };
    void whenSettled(handOver);
  }

  function setRule(nextRule: FuseRule): void {
    if (fuseRulesEqual(nextRule, rule)) return;
    rule = nextRule;
    ruleAdjusted = false;
    persistModeState();
    if (mode === "symmetry") void deriveFollower();
  }

  function previous(side: FuseSide): void {
    if (
      disposed ||
      isLoadingLength ||
      pendingSide !== null ||
      isFusing ||
      appliedLength === null
    ) {
      return;
    }

    const pool = poolFor(side);
    const counterpart = otherPool(side);
    const previousEntry = pool.peekPrevious();
    if (!previousEntry || !counterpart.sequence) return;

    try {
      const left =
        side === "left" ? previousEntry.sequence : counterpart.sequence;
      const right =
        side === "right" ? previousEntry.sequence : counterpart.sequence;
      const preview = createPreview(left, right);
      pool.commitPrevious();
      const previousSolo =
        side === "left"
          ? previousEntry.sequence.leftSoloProp
          : previousEntry.sequence.rightSoloProp;
      const currentOrigin = injectedOriginFor(side)?.origin;
      if (previousSolo && currentOrigin) {
        setInjectedOrigin(side, currentOrigin, previousSolo);
      }
      if (!(mode === "symmetry" && side === driverSide))
        publishPreview(preview);
      persistSelection(left, right);
      // Back uses the same in-place swap as Shuffle, so playback stays on beat.
      error = null;
      readyMessage = sourceReadyMessage(side, previousEntry.sequence, true);
      if (mode === "symmetry" && side === driverSide) void deriveFollower();
    } catch (previewError) {
      error = {
        kind: "preview",
        message: t("fuse_error_combined_preview"),
      };
      reportUnexpected(error.message, previewError, `previous-${side}`);
    }
  }

  async function retry(): Promise<void> {
    if (!error || isLoadingLength || pendingSide || isFusing) return;
    if (error.side) {
      await shuffle(error.side);
      return;
    }
    await loadPair();
  }

  async function buildFusedSequence(): Promise<SequenceData | null> {
    if (!canFuseNow()) return null;

    const snapshot = previewSequence;
    if (!snapshot) return null;
    const generation = ++buildGeneration;
    isFusing = true;
    error = null;
    stopClock();

    try {
      const pendingPreviewDerivation = activePreviewLetterDerivation;
      const derived = snapshot.steps.every((step) => step.letter)
        ? snapshot
        : pendingPreviewDerivation?.generation === previewLetterGeneration
          ? await pendingPreviewDerivation.promise
          : await deriveLetters(snapshot);
      if (disposed || generation !== buildGeneration) return null;

      const missingLetters = derived.steps.filter(
        (step) => !step.letter
      ).length;
      if (missingLetters > 0) {
        const message = t("fuse_error_identify_steps");
        error = { kind: "derivation", message };
        reportUnexpected(
          message,
          new Error(
            `${missingLetters}/${derived.steps.length} fused steps have no letter`
          ),
          "derive-fused-word"
        );
        return null;
      }

      // The shared builder braces skewed spans. No case change: letter identity
      // includes alphabet and case (α is not Α).
      const word = deriveWordFromBeats(derived.steps);
      const name = fusedDisplayName(word);
      const stepPairings = derived.stepPairings?.map((pair, index) => ({
        ...pair,
        letter: derived.steps[index]?.letter ?? null,
      }));

      return {
        ...derived,
        word,
        name,
        displayName: name,
        ...(stepPairings && { stepPairings }),
      };
    } catch (deriveError) {
      if (disposed || generation !== buildGeneration) return null;
      const message = t("fuse_error_identify_steps");
      error = { kind: "derivation", message };
      reportUnexpected(message, deriveError, "derive-fused-word");
      return null;
    } finally {
      if (!disposed && generation === buildGeneration) isFusing = false;
    }
  }

  function reportPreviewFailure(technicalError: unknown): void {
    if (!previewSequence || error?.kind === "preview") return;
    const message = t("fuse_error_combined_preview");
    error = { kind: "preview", message };
    stopClock();
    reportUnexpected(message, technicalError, "initialize-preview");
  }

  function reportViewerFailure(technicalError: unknown): void {
    const message = t("fuse_error_open_fused");
    error = { kind: "viewer", message };
    reportUnexpected(message, technicalError, "open-viewer");
  }

  function setBpm(value: number): void {
    if (!Number.isFinite(value)) return;
    bpm = Math.max(PLAYBACK_MIN_BPM, Math.min(PLAYBACK_MAX_BPM, value));
    // Merge so the bpm write never drops the persisted pair, length, or step.
    persisted = { ...persisted, bpm };
    writePersistedState(persisted);
  }

  function handleDocumentVisibility(hidden: boolean): void {
    if (hidden) {
      stopClock();
      // Tab hidden is an implicit pause; capture the step before we lose frames.
      persistStep();
    }
  }

  function dispose(): void {
    disposed = true;
    lengthGeneration += 1;
    leftGeneration += 1;
    rightGeneration += 1;
    buildGeneration += 1;
    previewLetterGeneration += 1;
    activePreviewLetterDerivation = null;
    stopClock();
  }

  function sourceState(side: FuseSide, pool: FuseShufflePool) {
    return {
      get sequence() {
        return pool.sequence;
      },
      get poolSize() {
        return pool.poolSize;
      },
      get poolPosition() {
        return pool.poolPosition;
      },
      get canGoBack() {
        return pool.canGoBack;
      },
      get isLoading() {
        return isLoadingLength || pendingSide === side;
      },
      get revision() {
        return pool.revision;
      },
      get nextSequence() {
        return pool.nextSequence;
      },
      /** Steps in this hand's own path, or null while it loads. */
      get length() {
        const solo =
          side === "left"
            ? pool.sequence?.leftSoloProp
            : pool.sequence?.rightSoloProp;
        return solo ? soloLength(solo) : null;
      },
      /** This hand's settings for its next new path. */
      recipe: recipeControls[side],
    };
  }

  const left = sourceState("left", leftPool);
  const right = sourceState("right", rightPool);

  return {
    /** How long the next fresh pair would run: the common multiple of the
     * lengths the two hands' settings ask for. */
    get requestedLength() {
      return fusedLengthFor(recipes.left.length, recipes.right.length);
    },
    get appliedLength() {
      return appliedLength;
    },
    get bpm() {
      return bpm;
    },
    get recipes(): Readonly<Record<FuseSide, Readonly<FuseHandRecipe>>> {
      return recipes;
    },
    recipeFor(side: FuseSide): FuseHandRecipeControls {
      return recipeControls[side];
    },
    get currentStep() {
      return currentStep;
    },
    get clockRunning() {
      return clockRunning;
    },
    /** A tapped Start is holding its pose before it plays. */
    get waitingAtStart() {
      return waitingAtStart;
    },
    get previewSequence() {
      return previewSequence;
    },
    get previewWord() {
      return previewWord;
    },
    get isLoadingLength() {
      return isLoadingLength;
    },
    get pendingSide() {
      return pendingSide;
    },
    get isFusing() {
      return isFusing;
    },
    get error() {
      return error;
    },
    get statusMessage() {
      return statusMessage();
    },
    get canFuse() {
      return canFuseNow();
    },
    get canRetry() {
      return (
        !!error &&
        error.kind !== "empty" &&
        error.kind !== "derivation" &&
        error.kind !== "viewer"
      );
    },
    get mode() {
      return mode;
    },
    get driverSide() {
      return driverSide;
    },
    get rule(): FuseRule {
      return rule;
    },
    get tndSelection(): FuseTnDSelection {
      return tndSelection;
    },
    get tndCheck(): FuseTnDCheck | null {
      return tndCheck;
    },
    get ruleAdjusted(): boolean {
      return ruleAdjusted;
    },
    get symmetryPreview() {
      return symmetryPreview;
    },
    /**
     * What the workspace should show right now. While the pairing editor holds
     * a draft these report the draft; otherwise they report the committed
     * relationship. Display code reads these so the follower card previews the
     * rule under the cursor; anything that persists or fuses reads the
     * committed `mode` / `driverSide` / `rule` above.
     */
    get isPreviewingRelationship() {
      return relationshipDraft !== null;
    },
    get previewDriverSide(): FuseSide {
      return relationshipDraft?.driver ?? driverSide;
    },
    get previewRule(): FuseRule {
      return relationshipDraft?.transform ?? rule;
    },
    left,
    right,
    initialize,
    loadPair: () => loadPair(),
    setLength,
    shuffle,
    setSource,
    adjustSource,
    previous,
    retry,
    setMode,
    setRelationship,
    previewRelationship,
    cancelRelationshipPreview,
    setDriver,
    setRule,
    buildFusedSequence,
    reportPreviewFailure,
    reportViewerFailure,
    setBpm,
    startClock,
    stopClock,
    toggleClock,
    seekToStep,
    seekToStart,
    handleDocumentVisibility,
    dispose,
  };
}

export type FuseState = ReturnType<typeof createFuseState>;
