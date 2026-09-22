//
// Pre-warm the OffscreenCanvas card-render pool the moment a deck's sequences
// are known (before the print preview mounts), so the ~5s asset-bundle seed
// overlaps the user's navigation and every cold deck — small or large — hits the
// warm worker path. Fire-and-forget; any failure leaves canUseWorker()===false
// and the render falls back to the main thread (no regression).

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { CompositionDispatcher } from "./composition-dispatcher";
import { getCompositionDispatcher } from "../get-composition-dispatcher";
import { getCardAssetBundle } from "./get-card-asset-bundle";
import { buildOverridePlacementBundle } from "./override-placement-bundle";
import { canonicalJSON } from "$lib/shared/foundation/utils/canonical-json";

export interface PrewarmOptions {
  sequences: SequenceData[];
  leftPropType: PropType;
  rightPropType: PropType;
  theme: string;
  iconPaths?: string[];
  /** Seed HAND and hand-path arrow assets instead of the operator's live props. */
  handPathMode?: boolean;
}

// Bumped when the worker render contract changes in a way that invalidates a
// seeded pool. Mirrors the spirit of PrintPreviewPages' CARD_RENDER_SCHEMA.
const SEED_SCHEMA = "v2";

/**
 * Deterministic signature of the asset bundle a deck needs. Sequence order does
 * not matter (ids are sorted); prop types and the seed schema do. Two decks with
 * the same signature can share a seeded pool; a different signature forces a
 * re-seed.
 */
export function computeBundleSignature(opts: {
  sequences: SequenceData[];
  leftPropType: PropType;
  rightPropType: PropType;
  theme: string;
  iconPaths?: string[];
  handPathMode?: boolean;
}): string {
  const propTypes = resolvePrewarmPropTypes(opts);
  // A TnD deck can reuse a base sequence ID for several variations. The worker
  // needs assets from every variation, so identity alone would incorrectly keep
  // an old pool warm and leave a later deck missing props, arrows, or labels.
  const sequences = opts.sequences
    .map((sequence) => canonicalJSON(sequence))
    .sort()
    .join("\n");
  const iconPaths = [...new Set((opts.iconPaths ?? []).filter(Boolean))]
    .sort()
    .join(",");
  return [
    SEED_SCHEMA,
    propTypes.leftPropType,
    propTypes.rightPropType,
    opts.theme,
    iconPaths,
    sequences,
  ].join("|");
}

export function resolvePrewarmPropTypes(
  opts: Pick<PrewarmOptions, "leftPropType" | "rightPropType" | "handPathMode">
): { leftPropType: PropType; rightPropType: PropType } {
  return opts.handPathMode
    ? { leftPropType: PropType.HAND, rightPropType: PropType.HAND }
    : {
        leftPropType: opts.leftPropType,
        rightPropType: opts.rightPropType,
      };
}

/**
 * Strictly probe, build, and seed the worker pool. Diagnostic callers await
 * this so a broken worker setup becomes a visible failure instead of comparing
 * two main-thread renders. A changed deck signature tears down the stale pool
 * before preparing the fresh bundle.
 */
export async function seedCardPool(opts: PrewarmOptions): Promise<void> {
  if (opts.sequences.length === 0) {
    throw new Error("Cannot seed a card pool without sequences");
  }

  const dispatcher = getCompositionDispatcher();
  const signature = computeBundleSignature(opts);
  const propTypes = resolvePrewarmPropTypes(opts);
  if (dispatcher.getSeededSignature() === signature) return; // already hot

  // Reserve the seed SYNCHRONOUSLY — raise the gate (and tear down a stale-deck
  // pool) the instant prewarm is called, BEFORE any await. This guarantees a
  // composeFrontBitmap that races in (e.g. the preview mounting) waits for this
  // bundle via the gate in ensureInitialized instead of seeding the pool empty.
  const finishSeed = dispatcher.beginSeed(signature);
  try {
    const ok = await CompositionDispatcher.probeWorkerSupport();
    if (!ok) throw new Error("Composition worker probe failed");
    const bundle = await getCardAssetBundle(opts.sequences, {
      leftPropType: propTypes.leftPropType,
      rightPropType: propTypes.rightPropType,
      theme: opts.theme,
      iconPaths: opts.iconPaths,
    });
    dispatcher.setAssetBundle(bundle);
    dispatcher.setOverrideBundle(buildOverridePlacementBundle());
  } finally {
    // Open the gate after the bundle has been installed, or after a failure so
    // callers never hang behind a failed pre-warm.
    finishSeed();
  }
  await dispatcher.ensureInitialized();
  if (dispatcher.getSeededSignature() !== signature) {
    throw new Error(
      "Composition worker pool did not accept the requested bundle"
    );
  }
}

/**
 * Fire-and-forget production pre-warm. Rendering retains its main-thread
 * fallback if setup fails; diagnostics use seedCardPool so that fallback cannot
 * look like a passing worker comparison.
 */
export function prewarmCardPool(opts: PrewarmOptions): void {
  if (opts.sequences.length === 0) return;
  void seedCardPool(opts).catch((err) => {
    console.warn(
      "[prewarmCardPool] pre-warm failed (main-thread fallback stays):",
      err
    );
  });
}
