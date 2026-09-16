/**
 * sequence-content-hasher - Computes a deterministic SHA-256 hash from motion content
 *
 * The hash is the sequence's identity as a physical movement pattern.
 * Same hash = same variation. Different hash = different variation.
 *
 * Only motion-defining fields contribute to the hash. Everything that's a user
 * annotation (name, tags, visibility, thumbnails) is excluded.
 *
 * ## Hash versions
 *
 * - **V1** (`HASH_VERSION_V1`) — the original basis. Includes `blueReversal`,
 *   `redReversal`, and `gridMode`. These three are RE-DERIVED on every
 *   `hydrate()` (reversal flags via `processReversals`; `gridMode` via
 *   `deriveStepGridMode`), so the hashed value can change between load and save
 *   even when nothing the user did changed — which mismatches the stored
 *   contentHash and silently FORKS the sequence on resave
 *   (`library-repository.ts` fork detection). See findings doc
 *   `docs/superpowers/specs/active/2026-06-30-reversal-derivation-reconciliation-findings.md`.
 * - **V2** (`HASH_VERSION_V2`) — excludes those round-trip-derived fields, so the
 *   identity is invariant under re-derivation (load→save can't fork). Proven
 *   collision-safe over the published corpus: every reversal *variant* already
 *   differs in flipped motion content (`reversal-seed-service.ts` flips pro↔anti
 *   + cw↔ccw), so dropping the redundant reversal flag merges nothing.
 * - **V3** (`HASH_VERSION_V3`) — adds the authored motion plane. Plane was
 *   previously dropped by composition, so no V1/V2 stored identity could
 *   distinguish physically different multi-plane choreography.
 *
 * `CONTENT_HASH_VERSION` is the ACTIVE version — **V3** since 2026-09-04. The
 * version-aware compare + lazy rehash introduced for V2 keeps mixed-version
 * data consistent; existing plane-less V2 documents upgrade on their next save.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { isHandPathSequence } from "$lib/shared/foundation/domain/models/sequence-kind";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { Plane } from "@tka/tka-types";

export const HASH_VERSION_V1 = 1;
export const HASH_VERSION_V2 = 2;
export const HASH_VERSION_V3 = 3;

/**
 * ACTIVE identity-hash version — V3 as of 2026-09-04.
 *   1. version-aware fork detection + lazy rehash already compares
 *      same-version hashes; recomputes on version mismatch instead of forking),
 *   2. V1 and V2 preimages remain byte-stable,
 *   3. plane-less V2 documents self-heal to V3 on their next save.
 * No bulk migration is required because absence of a plane was the complete V2
 * corpus state; only newly authored multi-plane content needs the new field.
 */
export const CONTENT_HASH_VERSION = HASH_VERSION_V3;

interface ExtractOptions {
  /** V2: drop round-trip-derived fields (reversal flags, gridMode) so the hash
   *  is invariant under hydrate re-derivation. */
  readonly excludeDerived: boolean;
  /** V3: authored planes distinguish physical movement in 3D space. */
  readonly includePlane: boolean;
}

const V1_OPTS: ExtractOptions = { excludeDerived: false, includePlane: false };
const V2_OPTS: ExtractOptions = { excludeDerived: true, includePlane: false };
const V3_OPTS: ExtractOptions = { excludeDerived: true, includePlane: true };

async function digest(content: unknown): Promise<string> {
  const json = JSON.stringify(content);
  const buffer = new TextEncoder().encode(json);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Identity hash at the given version (defaults to the active version). V1 output
 * is byte-identical to the original implementation; V2 excludes the
 * round-trip-derived fields; V3 adds authored plane. Pass a version explicitly
 * when validating a stored historical preimage.
 */
export async function computeHash(
  sequence: SequenceData,
  version: number = CONTENT_HASH_VERSION
): Promise<string> {
  const opts =
    version >= HASH_VERSION_V3
      ? V3_OPTS
      : version >= HASH_VERSION_V2
        ? V2_OPTS
        : V1_OPTS;
  const content = extractContent(sequence, opts);
  // Namespace the new artifact without changing any existing prop preimage.
  return digest(
    isHandPathSequence(sequence)
      ? { sequenceKind: "hand-path", content }
      : content
  );
}

function extractContent(sequence: SequenceData, opts: ExtractOptions): unknown {
  // Resolve the sequence-level grid mode once. Steps and start positions
  // that don't specify their own gridMode inherit this value. Normalizing
  // here prevents undefined-vs-"diamond" from producing different hashes
  // for sequences that are physically identical.
  //
  // V2: gridMode is re-derived on hydrate, so it is dropped entirely from the
  // identity; physical sameness is already fully captured by the step
  // locations, which are stable.
  const seqGridMode = sequence.gridMode ?? null;

  return {
    ...(opts.excludeDerived ? {} : { gridMode: seqGridMode }),
    // Preimage property names are a persistence protocol. Stored V1 and V2
    // hashes were minted under the older "startPosition" label, so the key
    // stays as is while the value comes from the canonical startPlacement.
    startPosition: extractStartPlacement(
      sequence.startPlacement ?? sequence.startingPlacement,
      seqGridMode,
      opts
    ),
    steps: sequence.steps.map((step) => extractStep(step, seqGridMode, opts)),
  };
}

function extractStartPlacement(
  sp: StartPlacementData | undefined,
  inheritedGridMode: string | null,
  opts: ExtractOptions
): unknown {
  if (!sp) return null;
  return {
    motions: extractMotions(sp.motions, opts),
    ...(opts.excludeDerived
      ? {}
      : { gridMode: sp.gridMode ?? inheritedGridMode }),
  };
}

function extractStep(
  step: StepData,
  inheritedGridMode: string | null,
  opts: ExtractOptions
): unknown {
  // V2 drops blueReversal/redReversal (re-derived by processReversals on every
  // load) and gridMode (re-derived by deriveStepGridMode). letter is kept: it is
  // identity-bearing and is NOT re-derived on hydrate (deriveSteps reads the
  // persisted pairing letter).
  if (opts.excludeDerived) {
    return {
      letter: step.letter ?? null,
      isBlank: step.isBlank,
      duration: step.duration,
      motions: extractMotions(step.motions, opts),
    };
  }
  return {
    letter: step.letter ?? null,
    // V1's serialized property names are immutable. Existing Firestore hashes
    // were minted from blue/red labels even though the values now come from
    // performer-relative hand fields.
    blueReversal: step.leftReversal,
    redReversal: step.rightReversal,
    isBlank: step.isBlank,
    duration: step.duration,
    motions: extractMotions(step.motions, opts),
    gridMode: step.gridMode ?? inheritedGridMode,
  };
}

function extractMotions(
  motions: Partial<Record<HandSide, MotionData | undefined>>,
  opts: ExtractOptions
): unknown {
  // Hash labels and order are a persistence protocol. Keep the original blue
  // then red preimage while reading from canonical left/right channels.
  return Object.fromEntries(
    [
      ["blue", motions[HandSide.LEFT]],
      ["red", motions[HandSide.RIGHT]],
    ]
      .filter((entry): entry is [string, MotionData] => entry[1] !== undefined)
      .map(([legacyLabel, motion]) => [
        legacyLabel,
        extractMotion(motion, opts),
      ])
  );
}

// Intentionally excluded from hash:
// - arrowPlacementData, propPlacementData: rendering/layout concerns derived from motion fields
// - propType: viewer preference, not sequence identity (overridden by global settings)
// - isVisible, hand, arrowLocation: rendering state, not motion definition
function extractMotion(m: MotionData, opts: ExtractOptions): unknown {
  return {
    motionType: m.motionType,
    rotationDirection: m.rotationDirection,
    startLocation: m.startLocation,
    endLocation: m.endLocation,
    turns: m.turns,
    startOrientation: m.startOrientation,
    endOrientation: m.endOrientation,
    handPath: m.handPath ?? null,
    // V2: motion-level gridMode is re-derived on hydrate — drop it too.
    ...(opts.excludeDerived ? {} : { gridMode: m.gridMode }),
    skewSteps: m.skewSteps ?? null,
    skewDir: m.skewDir ?? null,
    ...(opts.includePlane ? { plane: m.plane ?? Plane.wall } : {}),
  };
}
