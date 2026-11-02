/**
 * "Apply this look to my published sequences" (Settings > Props).
 *
 * Public cards render the look the creator saved on each sequence
 * (`creatorIntent.presentation`), never the viewer's settings. Changing prop
 * colors in Settings therefore leaves already-published sequences as they
 * were. This is the one deliberate way to move them: copy the current look
 * onto every public sequence the signed-in creator owns, with an undo.
 *
 * Only the look moves. `propConfig` / `intendedProp` stay as they are: the
 * prop pair is part of what the creator made, not how it is dressed.
 *
 * Cost: one owner query, then per public sequence one owner write and one
 * mirror transaction (LibraryRepository.updateSequence patches the mirror for
 * a creator-intent change on a public sequence). Writes run a few at a time
 * and one failure never stops the rest.
 */

import type { CreatorIntent } from "#lib/shared/foundation/domain/models/creator-intent.js";
import type { PresentationIntent } from "#lib/shared/foundation/domain/models/presentation-intent.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { LibraryRepository } from "#lib/shared/library/services/library-repository.js";
import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
import { LibraryError } from "#lib/shared/library/domain/library-error.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { stripUndefined } from "#lib/shared/firestore/firestore-helpers.js";
import { captureSettingsPresentation } from "./settings-presentation";

const RESTAMP_CONCURRENCY = 4;

/**
 * Each sequence's `presentation` before the restamp. `undefined` means the
 * key was absent (never recorded), which restore keeps distinct from `null`
 * (the creator chose the default look): resolvePresentation treats them
 * differently at the next publish.
 */
export type PreviousLooks = Map<string, PresentationIntent | null | undefined>;

export interface RestampResult {
  updated: number;
  failed: number;
  previous: PreviousLooks;
}

export interface RestoreResult {
  restored: number;
  failed: number;
}

export interface PublishedLookDeps {
  repository: Pick<
    LibraryRepository,
    "getUserSequences" | "getSequence" | "updateSequence"
  >;
  /** The signed-in full account, or null for a guest or nobody. */
  ownerId: string | null;
  capture: () => PresentationIntent;
}

function defaultDeps(): PublishedLookDeps {
  return {
    repository: getLibraryRepository(),
    ownerId: authState.isFullAccount ? authState.effectiveUserId : null,
    capture: captureSettingsPresentation,
  };
}

function requireOwner(ownerId: string | null): string {
  if (!ownerId) {
    throw new LibraryError(
      "Sign in with a full account to change published sequences",
      "UNAUTHORIZED"
    );
  }
  return ownerId;
}

/** The intent with `presentation` set, or removed when `presentation` is undefined. */
function withPresentation(
  intent: CreatorIntent | null | undefined,
  presentation: PresentationIntent | null | undefined
): CreatorIntent {
  const { presentation: _replaced, ...rest } = intent ?? {};
  const next: CreatorIntent =
    presentation === undefined ? rest : { ...rest, presentation };
  // Firestore rejects undefined, and the mirror digest is computed from
  // exactly what is written.
  return stripUndefined(next as Record<string, unknown>) as CreatorIntent;
}

/** Runs `work` over `items` a few at a time; counts outcomes, never aborts. */
async function settleInChunks<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (let index = 0; index < items.length; index += RESTAMP_CONCURRENCY) {
    const chunk = items.slice(index, index + RESTAMP_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(work));
    for (const result of results) {
      if (result.status === "fulfilled") {
        ok += 1;
      } else {
        failed += 1;
        console.warn("[published-look-restamp] write failed:", result.reason);
      }
    }
  }
  return { ok, failed };
}

/**
 * Stamp the current Settings look onto every public sequence the signed-in
 * creator owns. Throws only when nobody eligible is signed in or the owner
 * query itself fails; per-sequence failures are counted.
 */
export async function restampPublishedLook(
  deps: PublishedLookDeps = defaultDeps()
): Promise<RestampResult> {
  const ownerId = requireOwner(deps.ownerId);
  // A soft-deleted sequence has no mirror and is not "published" to the
  // creator, so it keeps whatever it had.
  const sequences: LibrarySequence[] = (
    await deps.repository.getUserSequences(ownerId, { visibility: "public" })
  ).filter((sequence) => !sequence.isDeleted && !sequence.deletedAt);
  const look = deps.capture();

  const previous: PreviousLooks = new Map();
  for (const sequence of sequences) {
    previous.set(sequence.id, sequence.creatorIntent?.presentation);
  }

  const { ok, failed } = await settleInChunks(sequences, async (sequence) => {
    await deps.repository.updateSequence(
      sequence.id,
      { creatorIntent: withPresentation(sequence.creatorIntent, look) },
      ownerId
    );
  });

  // A failed sequence stays in `previous`: its owner write may have landed
  // before the mirror patch failed, and restoring an unchanged one is harmless.
  return { updated: ok, failed, previous };
}

/**
 * Undo a restamp: put each sequence's earlier `presentation` back, removing
 * the key where it was absent. Reads each sequence first so anything else in
 * its intent (the prop pair) is kept as it is now.
 */
export async function restorePublishedLook(
  previous: PreviousLooks,
  deps: PublishedLookDeps = defaultDeps()
): Promise<RestoreResult> {
  const ownerId = requireOwner(deps.ownerId);
  const entries = [...previous.entries()];

  const { ok, failed } = await settleInChunks(
    entries,
    async ([sequenceId, presentation]) => {
      const current = await deps.repository.getSequence(sequenceId, ownerId);
      if (!current) {
        throw new LibraryError("Sequence not found", "NOT_FOUND", sequenceId);
      }
      await deps.repository.updateSequence(
        sequenceId,
        {
          creatorIntent: withPresentation(current.creatorIntent, presentation),
        },
        ownerId
      );
    }
  );

  return { restored: ok, failed };
}
