/**
 * The Fuse preview's new pairs, made the way Fuse's Regenerate makes one: one
 * hand gets a new path from Fuse's own path maker while the other keeps its
 * own, and the two fuse again at Fuse's default length. The scene loads this
 * only after it first draws, so the front door's first paint carries none of
 * Fuse's generator.
 *
 * Local data only (spec: Scenes). At eight steps the path maker builds from
 * the bundled motion tables; the flower catalog it reads from Firestore is
 * for four-step paths alone.
 */
import { createCircularFuseSoloSequence } from "#lib/features/fuse/services/fuse-solo-sequence.js";
import { fuseSequences } from "#lib/features/fuse/services/sequence-fuser.js";
import {
  DEFAULT_SOLO_LOOP_RECIPE,
  generateSoloLoop,
} from "#lib/features/fuse/services/solo-loop-generator.js";
import type { FuseSide } from "#lib/features/fuse/state/fuse-shuffle-pool.svelte.js";
import type { FusePictographMotionFrame } from "#lib/features/fuse/services/fuse-pictograph-motion-frame.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropData } from "#lib/shared/foundation/domain/models/solo-prop-data.js";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "#lib/shared/foundation/services/sequence-decomposer.js";
import { deriveLettersForSequence } from "#lib/shared/navigation/services/letter-deriver.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { DEMO_SEQUENCE } from "./method-preview-demo";
import { fusePreviewFrames } from "./method-preview-fuse";

/** Fuse's default length, which a new pair fuses to. */
export const FUSE_PREVIEW_LENGTH = 8;

/** One blue path and one red path, and the fused steps the scene plays. */
export interface FusePreviewPair {
  blue: SoloPropData;
  red: SoloPropData;
  frames: FusePictographMotionFrame[];
  /** The hand whose path is new in this pair. Null for the demo's hands. */
  changed: HandSide | null;
}

/** What Fuse makes a new pair with. Tests pass their own. */
export interface FusePathMaker {
  /** A new one-hand path, as Regenerate asks for one. */
  newPath(length: number): Promise<SoloPropData>;
  /** The fused steps' letters, as Fuse names its combined preview. */
  deriveLetters(sequence: SequenceData): Promise<SequenceData>;
}

export const FUSE_PATH_MAKER: FusePathMaker = {
  newPath: async (length) =>
    (await generateSoloLoop(length, DEFAULT_SOLO_LOOP_RECIPE)).solo,
  deriveLetters: deriveLettersForSequence,
};

/** The demo sequence's own two hands: the pair the scene first rests on. */
export function demoFusePair(): FusePreviewPair {
  return {
    blue: extractLeftSoloProp(DEMO_SEQUENCE),
    red: extractRightSoloProp(DEMO_SEQUENCE),
    frames: fusePreviewFrames(DEMO_SEQUENCE),
    changed: null,
  };
}

/**
 * Regenerate on one hand: `side` gets a new path, the other hand keeps its
 * own, and the two fuse at Fuse's default length. The kept hand's steps are
 * the ones it already showed, so only the new hand changes on screen.
 */
export async function swapFuseHand(
  pair: FusePreviewPair,
  side: FuseSide,
  maker: FusePathMaker = FUSE_PATH_MAKER
): Promise<FusePreviewPair> {
  // Fuse wraps a new path as its hand's card and fuses the card's path.
  const card = createCircularFuseSoloSequence(
    side,
    await maker.newPath(FUSE_PREVIEW_LENGTH)
  );
  const blue = side === "left" ? card.leftSoloProp : pair.blue;
  const red = side === "right" ? card.rightSoloProp : pair.red;
  if (!blue || !red) throw new Error("The new path has no hand data");
  const fused = fuseSequences(blue, red, { maxSteps: FUSE_PREVIEW_LENGTH });
  if (fused.steps.length !== FUSE_PREVIEW_LENGTH) {
    throw new Error(
      `The pair fused to ${fused.steps.length} steps instead of ${FUSE_PREVIEW_LENGTH}`
    );
  }
  return {
    blue,
    red,
    frames: fusePreviewFrames(await maker.deriveLetters(fused)),
    changed: side === "left" ? HandSide.LEFT : HandSide.RIGHT,
  };
}
