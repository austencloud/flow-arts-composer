import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PictographVisibilityOptions } from "$lib/shared/render/utils/pictograph-to-svg";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { isBuugengFamilyProp } from "$lib/shared/render/core/constants/prop-classification";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  isFanPropType,
  fanAppearanceSignature,
  normalizeFanAppearance,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
// getSettings loaded dynamically to avoid pulling $app/environment into worker bundle

interface MotionKeyData {
  isVisible?: boolean;
  motionType: string;
  startLocation: string;
  endLocation: string;
  turns: number | string;
  startOrientation: string;
  endOrientation: string;
  rotationDirection: string;
  propType: string;
  gridMode: string;
}

interface PictographKeyInput {
  letter: string | undefined;
  left: MotionKeyData | null;
  right: MotionKeyData | null;
  // Reversal dots are BAKED into the rendered blob (LayerCompositor reads
  // stepData.leftReversal/rightReversal), so the flags are image identity. The
  // same letter+motions can carry different reversal flags depending on the
  // preceding step — omitting them served dotted blobs to dot-free steps.
  leftReversal: boolean;
  rightReversal: boolean;
  // betaSwapped changes prepared prop geometry (PictographPreparer keys it);
  // without it two identical-motion pictographs collide across the swap.
  betaSwapped: boolean;
  // Present only when a narrowly-scoped render algorithm revision changes
  // this pictograph's pixels. Unaffected cells keep their established key.
  arrowRenderRevision?: string;
  propGeometryRevision?: string;
  propAppearanceRevision?: string;
  turnGlyphRevision?: string;
  visibility: {
    fanAppearance?: string;
    primaryPropColors?: { left: string; right: string };
    primaryPropColorRevision?: string;
    showTKA: boolean;
    showTnD: boolean;
    showElemental: boolean;
    showPositions: boolean;
    showReversals: boolean;
    showNonRadialPoints: boolean;
    showGrid: boolean;
    darkMode: boolean;
    leftPropType: string | undefined;
    rightPropType: string | undefined;
    handPathMode: boolean;
    handPointVisibility: string;
    printMode: boolean;
    showLeftMotion: boolean;
    showRightMotion: boolean;
    // Chirality is image identity for buugeng-family props only, and only
    // when flipped. Present-when-it-matters keeps every unflipped render
    // byte-identical to the established lsp11/lsp12 key corpus.
    leftBuugengFlipped?: boolean;
    rightBuugengFlipped?: boolean;
  };
}

const BETA_SHIFT_MAP_REVISION = "beta-shift-map-v2";
const CANONICAL_HAND_ARROW_RENDER_REVISION = "canonical-hand-arrows-v1";
const FIRST_QUARTER_TURN_GLYPH_REVISION = "quarter-turn-glyph-v1";
const COMPLETE_QUARTER_TURN_GLYPH_REVISION = "quarter-turn-glyph-v2";
const COMPLETED_QUARTER_TURN_VALUES = new Set([0.75, 1.25, 1.75, 2.25, 2.75]);
const PROP_APPEARANCE_REVISIONS: Readonly<Record<string, string>> = {
  // The original club raster was a single flat silhouette. The regular-club
  // material artwork changes those pixels without changing PropType.CLUB, so
  // old IndexedDB and cloud cells must no longer be valid hits.
  club: "club-art-v2",
  // Torch artwork used to render as a near-black shaft with no flame, which
  // vanished on a dark card. The contrast palette and its approved flame are
  // now baked into the loaded artwork, so cells cached before that must miss.
  torch: "torch-contrast-v2",
  bigtorch: "torch-contrast-v2",
};
const NON_RADIAL_ORIENTATIONS = new Set(["clock", "counter"]);
const SHIFT_MOTION_TYPES = new Set(["pro", "anti", "float"]);
const REVISED_NON_RADIAL_SHIFT_TRANSITIONS = new Set([
  "se>ne",
  "sw>nw",
  "sw>se",
  "nw>ne",
  "nw>sw",
]);
const LETTERS_WITH_INDEPENDENT_BETA_DIRECTION_MAPS = new Set(["G", "H", "I"]);

/**
 * Rekeys only cells affected by a prop geometry repair: legacy orientation
 * spelling or corrected box/non-radial shift-direction entries.
 *
 * Keeping this predicate narrow avoids invalidating the established lsp11
 * cloud corpus for pictographs that never consult those entries.
 */
export function getPictographGeometryRevision(
  data: StepData | PictographData
): string | undefined {
  const legacyCase = Object.values(data.motions ?? {}).some(
    (motion) =>
      motion &&
      motion.isVisible !== false &&
      Object.values(Orientation).some(
        (orientation) =>
          orientation !== motion.endOrientation &&
          orientation.toLowerCase() === motion.endOrientation?.toLowerCase()
      )
  );
  const betaRevision = getBetaShiftGeometryRevision(data);
  return (
    [betaRevision, legacyCase ? "orientation-case-v1" : undefined]
      .filter(Boolean)
      .join("+") || undefined
  );
}

function getBetaShiftGeometryRevision(
  data: StepData | PictographData
): string | undefined {
  const left = data.motions?.left;
  const right = data.motions?.right;
  if (
    !left ||
    !right ||
    left.isVisible === false ||
    right.isVisible === false
  ) {
    return undefined;
  }

  if (left.endLocation.toLowerCase() !== right.endLocation.toLowerCase()) {
    return undefined;
  }

  if (
    !NON_RADIAL_ORIENTATIONS.has(left.endOrientation.toLowerCase()) ||
    !NON_RADIAL_ORIENTATIONS.has(right.endOrientation.toLowerCase())
  ) {
    return undefined;
  }

  if (LETTERS_WITH_INDEPENDENT_BETA_DIRECTION_MAPS.has(data.letter ?? "")) {
    return undefined;
  }

  const leftIsShift = SHIFT_MOTION_TYPES.has(left.motionType.toLowerCase());
  const rightIsShift = SHIFT_MOTION_TYPES.has(right.motionType.toLowerCase());
  const letter = data.letter ?? "";

  // Direction routing intentionally has one source motion. Y/Z prefer red;
  // ordinary dual shifts use blue; mixed shift/non-shift cells use the shift.
  const directionSource =
    letter === "Y" || letter === "Z" || letter === "Y-" || letter === "Z-"
      ? rightIsShift
        ? right
        : leftIsShift
          ? left
          : undefined
      : leftIsShift && rightIsShift
        ? left
        : leftIsShift
          ? left
          : rightIsShift
            ? right
            : undefined;

  const transition = directionSource
    ? `${directionSource.startLocation.toLowerCase()}>${directionSource.endLocation.toLowerCase()}`
    : "";
  const usesRevisedTransition =
    REVISED_NON_RADIAL_SHIFT_TRANSITIONS.has(transition);

  return usesRevisedTransition ? BETA_SHIFT_MAP_REVISION : undefined;
}

/**
 * Rekeys only pictographs whose rasterized TKA tuple changed when quarter-turn
 * number assets were introduced. The original 0.25 asset keeps its established
 * revision; the remaining Level 4 values use v2 so cached blank columns cannot
 * survive after their assets become available.
 */
export function getTurnGlyphRevision(
  data: StepData | PictographData,
  showTKA: boolean
): string | undefined {
  if (!showTKA) return undefined;

  const visibleTurns = Object.values(data.motions ?? {}).flatMap((motion) =>
    !motion || motion.isVisible === false ? [] : [Number(motion.turns)]
  );

  if (visibleTurns.some((turns) => COMPLETED_QUARTER_TURN_VALUES.has(turns))) {
    return COMPLETE_QUARTER_TURN_GLYPH_REVISION;
  }

  return visibleTurns.includes(0.25)
    ? FIRST_QUARTER_TURN_GLYPH_REVISION
    : undefined;
}

/**
 * Returns only the authored-art revisions that can affect the selected props.
 *
 * Prop types are already part of the cache identity. This extra seam covers a
 * different case: the SVG behind an existing prop type changes while its enum
 * value stays stable. Keeping the revision prop-scoped avoids throwing away
 * the established cloud corpus for every unrelated prop.
 */
export function getPropAppearanceRevision(
  leftPropType: string,
  rightPropType: string
): string | undefined {
  const revisions = [leftPropType, rightPropType]
    .map((propType) => PROP_APPEARANCE_REVISIONS[propType.toLowerCase()])
    .filter((revision): revision is string => Boolean(revision));

  const uniqueRevisions = [...new Set(revisions)].sort();
  return uniqueRevisions.length > 0 ? uniqueRevisions.join("+") : undefined;
}

export class PictographKeyHasher {
  deriveKey(
    data: StepData | PictographData,
    visibility: PictographVisibilityOptions
  ): string {
    const input = this.buildKeyInput(data, visibility);
    return JSON.stringify(input, this.sortedReplacer);
  }

  private buildKeyInput(
    data: StepData | PictographData,
    visibility: PictographVisibilityOptions
  ): PictographKeyInput {
    const motions = data.motions ?? { left: undefined, right: undefined };

    // Callers (ImageComposer.getVisibilitySettings) always resolve prop types before
    // calling deriveKey, so visibility.leftPropType/rightPropType are always set.
    // Default to "staff" for safety. Previously this called getSettings() which pulled
    // $app/environment into the worker bundle via the static import chain.
    const resolvedLeftProp = visibility.leftPropType ?? "staff";
    const resolvedRightProp = visibility.rightPropType ?? "staff";
    const includeMotionVisibility =
      motions.left?.isVisible === false || motions.right?.isVisible === false;
    const hasVisibleMotion = Object.values(motions).some(
      (motion) => motion && motion.isVisible !== false
    );

    // Flags only affect the image when the reversal layer actually draws;
    // neutralize them when showReversals is off so a flagged and unflagged
    // step (identical images) share one cache entry.
    const reversalsVisible = visibility.showReversals ?? true;
    const step = data as Partial<StepData>;
    const propGeometryRevision = getPictographGeometryRevision(data);
    const propAppearanceRevision = getPropAppearanceRevision(
      resolvedLeftProp,
      resolvedRightProp
    );
    const turnGlyphRevision = getTurnGlyphRevision(
      data,
      visibility.showTKA ?? true
    );

    return {
      letter: data.letter ?? undefined,
      left: this.extractMotionKey(motions.left, includeMotionVisibility),
      right: this.extractMotionKey(motions.right, includeMotionVisibility),
      leftReversal: reversalsVisible ? (step.leftReversal ?? false) : false,
      rightReversal: reversalsVisible ? (step.rightReversal ?? false) : false,
      betaSwapped: data.betaSwapped ?? false,
      ...(hasVisibleMotion && {
        arrowRenderRevision: CANONICAL_HAND_ARROW_RENDER_REVISION,
      }),
      ...(propGeometryRevision && { propGeometryRevision }),
      ...(propAppearanceRevision && { propAppearanceRevision }),
      ...(turnGlyphRevision && { turnGlyphRevision }),
      visibility: {
        ...(visibility.fanAppearance &&
          (isFanPropType(resolvedLeftProp) ||
            isFanPropType(resolvedRightProp)) && {
            fanAppearance: fanAppearanceSignature(
              normalizeFanAppearance(visibility.fanAppearance)
            ),
          }),
        ...(visibility.primaryPropColors && {
          primaryPropColors: visibility.primaryPropColors,
          primaryPropColorRevision: "material-colors-v2",
        }),
        showTKA: visibility.showTKA ?? true,
        showTnD: visibility.showTnD ?? false,
        showElemental: visibility.showElemental ?? false,
        showPositions: visibility.showPositions ?? false,
        showReversals: visibility.showReversals ?? true,
        showNonRadialPoints: visibility.showNonRadialPoints ?? true,
        showGrid: visibility.showGrid ?? true,
        darkMode: visibility.darkMode ?? false,
        leftPropType: resolvedLeftProp,
        rightPropType: resolvedRightProp,
        handPathMode: visibility.handPathMode ?? false,
        handPointVisibility: visibility.handPointVisibility ?? "all",
        printMode: visibility.printMode ?? false,
        showLeftMotion: visibility.showLeftMotion ?? true,
        showRightMotion: visibility.showRightMotion ?? true,
        ...(isBuugengFamilyProp(resolvedLeftProp) &&
          visibility.leftBuugengFlipped && { leftBuugengFlipped: true }),
        ...(isBuugengFamilyProp(resolvedRightProp) &&
          visibility.rightBuugengFlipped && { rightBuugengFlipped: true }),
      },
    };
  }

  private extractMotionKey(
    motion: MotionData | undefined,
    includeVisibility: boolean
  ): MotionKeyData | null {
    if (!motion) return null;

    const derivedGridMode = this.deriveGridModeFromLocations(
      motion.startLocation,
      motion.endLocation
    );

    return {
      // Keep fully-visible pictographs byte-identical to the lsp11 key corpus.
      // Once either hand is an invisible placeholder, both values enter the
      // lsp12 identity so visible and hidden versions cannot share a blob.
      ...(includeVisibility && { isVisible: motion.isVisible !== false }),
      motionType: motion.motionType ?? "",
      startLocation: motion.startLocation ?? "",
      endLocation: motion.endLocation ?? "",
      turns: motion.turns ?? 0,
      startOrientation: motion.startOrientation ?? "",
      endOrientation: motion.endOrientation ?? "",
      rotationDirection: motion.rotationDirection ?? "",
      propType: motion.propType ?? "staff",
      gridMode: derivedGridMode,
    };
  }

  private deriveGridModeFromLocations(
    startLocation: GridLocation | undefined,
    endLocation: GridLocation | undefined
  ): string {
    const intercardinalLocations: GridLocation[] = [
      GridLocation.NORTHEAST,
      GridLocation.SOUTHEAST,
      GridLocation.SOUTHWEST,
      GridLocation.NORTHWEST,
    ];

    if (
      (startLocation && intercardinalLocations.includes(startLocation)) ||
      (endLocation && intercardinalLocations.includes(endLocation))
    ) {
      return GridMode.BOX;
    }

    return GridMode.DIAMOND;
  }

  private sortedReplacer = (_key: string, value: unknown): unknown => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce(
          (sorted, key) => {
            sorted[key] = (value as Record<string, unknown>)[key];
            return sorted;
          },
          {} as Record<string, unknown>
        );
    }
    return value;
  };
}

export const pictographKeyHasher = new PictographKeyHasher();
