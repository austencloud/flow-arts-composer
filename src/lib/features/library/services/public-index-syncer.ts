/**
 * PublicIndexSyncer - Public Sequence Index Management
 *
 * Handles syncing sequences to/from the publicSequences collection.
 * Includes content moderation - flagged content cannot be synced to public.
 * Auto-detects circularity and LOOP type at publish time using the
 * existing detection singletons (loopDetector, sequenceLoopabilityChecker).
 * Extracted from LibraryRepository for single responsibility.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
  type DocumentData,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { getUserTagsPath } from "$lib/shared/library/data/firestore-paths";
import {
  normalizeSequenceForPersistence,
  type NormalizedSequenceWrite,
} from "$lib/shared/library/services/sequence-persistence-normalizer";
import type { ProjectionSourceSequence } from "$lib/shared/library/services/public-sequence-projection";
import {
  publishPublicSequence,
  unpublishPublicSequence,
  updatePublicThumbnails,
} from "$lib/shared/library/services/public-sequence-persister";
import type { LibrarySequence } from "$lib/shared/library/domain/models/library-sequence";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";
import type { FlaggedTerm } from "$lib/features/moderation/domain/models/content-moderation-models";

interface ContentModerator {
  checkWord(word: string): { isAllowed: boolean; flaggedTerms: FlaggedTerm[] };
}
interface ContentAppealManager {
  isWhitelisted(contentType: 'sequence' | 'act', contentId: string): Promise<boolean>;
}
import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { ContentModerationError } from "$lib/features/moderation/errors/content-moderation-error";
import { getPublicSequenceHashMatcher } from "$lib/shared/sequence-viewer/get-public-sequence-hash-matcher";
import type { ErrorHandler } from '$lib/shared/application/services/error-handler'
import { LOOP_LABELS_COLLECTION } from "$lib/features/loop-labeler/domain/constants/firebase-collections";
import { calculateDifficultyLevel as calculateSequenceDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
import { periodToNumber } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import { MIN_COMMUNITY_STEPS } from "$lib/shared/library/domain/sequence-min-length";

export class PublicIndexSyncer {

  constructor(
    private readonly contentModerator?: ContentModerator,
    private readonly contentAppealManager?: ContentAppealManager,
    private readonly browseLoader?: PublicSequencesLoader
  ) {}

  /**
   * Sync a public sequence to the publicSequences collection.
   *
   * The document is produced by `buildPublicSequenceProjection` from a
   * `normalizeSequenceForPersistence` result — never assembled by hand. That
   * ends the field-loss class (a consumer-read field the literal forgot),
   * the `publishedAt` re-stamp, the counter resets, `sequenceLength: 0`, and
   * auto-titles stored as words.
   *
   * Throws ContentModerationError if content is flagged and not whitelisted;
   * IncompleteWordError / SequenceNormalizationError when the sequence cannot
   * be safely persisted (all thrown BEFORE any Firestore write).
   */
  async syncToPublicIndex(
    sequence: LibrarySequence,
    userId: string
  ): Promise<void> {
    // Normalize FIRST: hydrate, strip legacy start entries, refuse
    // empty/unhydratable/blank data, derive the exact word, canonical count,
    // and V2 identity hash. Every value the public document carries comes from
    // this result, never from the raw input's possibly-stale fields. Pure and
    // local — refusals cost no Firestore reads and skip the generic error
    // modal below (they are typed, caller-handled errors).
    const normalized = await normalizeSequenceForPersistence(sequence);
    const hydrated = normalized.hydrated;

    // Moderate the DERIVED word. The stored `sequence.word` can be an
    // auto-title (or empty, which previously skipped moderation entirely);
    // what the gallery actually displays is the derived word, so that is what
    // gets checked.
    if (this.contentModerator) {
      const result = this.contentModerator.checkWord(normalized.exactWord);

      if (!result.isAllowed) {
        // Check if this content has been whitelisted via appeal
        const isWhitelisted = this.contentAppealManager
          ? await this.contentAppealManager.isWhitelisted("sequence", sequence.id)
          : false;

        if (!isWhitelisted) {
          throw new ContentModerationError(
            "Content flagged by moderation",
            result.flaggedTerms,
            normalized.exactWord,
            sequence.id
          );
        }
      }
    }

    // Authoritative community gate: nothing under the minimum ever enters the
    // public mirror, regardless of which path called us (save with public
    // visibility, fork-default-public, explicit publish). Uses the canonical
    // count — `meetsCommunityMinimum(sequence)` on the raw input could read a
    // stale stored `sequenceLength`.
    if (normalized.sequenceLength < MIN_COMMUNITY_STEPS) {
      throw new Error(
        `Needs at least ${MIN_COMMUNITY_STEPS} steps to post to the community gallery.`
      );
    }

    const firestore = await getFirestoreInstance();

    try {
      // Get user display info for denormalization
      const userDoc = await getDoc(doc(firestore, `users/${userId}`));
      const userData = userDoc.data() ?? {};

      // Detect circularity and LOOP type from the HYDRATED sequence: it always
      // carries steps, and its `word` is the derived word — so the curated
      // loop-labels lookup can no longer miss on a junk stored word.
      const { isCircular, loopType, period, components } =
        await this.detectLoopInfo(firestore, hydrated);

      // Hydrated steps are guaranteed non-empty past the normalizer.
      const level = calculateSequenceDifficultyLevel([...hydrated.steps]);

      // Encoder hash for URL-to-library matching. Fails CLOSED: the projection
      // context requires it, and silently publishing without it is how URL
      // matching went dormant corpus-wide. A failure here signals malformed
      // motion data, which the normalizer should have refused — surface it.
      const matcher = getPublicSequenceHashMatcher();
      const encoderHash = await matcher.computeEncoderHash(hydrated);

      // Resolve human-readable tag names. Also fails closed — see
      // resolveTagNames for why an empty list must mean "untagged", never
      // "the read failed".
      const tagNames = await this.resolveTagNames(firestore, userId, sequence);

      // The atomic write: prior-state read, duplicate claim check, projection
      // build, public setDoc, hash-claim create, stale-claim release, and
      // owner projection stamps — one serializable transaction
      // (public-sequence-persister). Two clients racing an identical
      // publication can no longer both slip past a preflight query: the loser
      // re-runs against the winner's committed claim and gets a typed
      // PublicDuplicateError.
      await publishPublicSequence(
        firestore,
        normalized as NormalizedSequenceWrite<ProjectionSourceSequence>,
        {
          ownerId: userId,
          ownerDisplayName:
            typeof userData["displayName"] === "string" &&
            userData["displayName"].length > 0
              ? userData["displayName"]
              : "Unknown",
          ...(typeof userData["photoURL"] === "string" && {
            ownerAvatarUrl: userData["photoURL"],
          }),
          tagNames,
          encoderHash,
          loop: {
            isCircular,
            loopType,
            ...(period !== undefined && { period }),
            ...(components &&
              components.length > 0 && {
                components: components as SequenceData["components"],
              }),
            ...(hydrated.componentDomains && {
              componentDomains: hydrated.componentDomains,
            }),
            ...(hydrated.loopSpec && { loopSpec: hydrated.loopSpec }),
          },
          ...(sequence.difficultyLevel !== undefined && {
            difficultyLevel: sequence.difficultyLevel,
          }),
          level,
        },
        userId
      );

      // Fire-and-forget: write decomposed artifacts to public collections so
      // hand paths and solo props are independently discoverable in the gallery.
      this.syncArtifactsToPublic(firestore, sequence, userId).catch((err) =>
        console.warn("[PublicIndexSyncer] Public artifact sync failed (non-blocking):", err)
      );

      // Inject the newly published sequence into the browse gallery cache so it
      // shows up immediately without a Firestore round-trip. Sourced from the
      // NORMALIZED result so the cache shows exactly what was stored — the raw
      // input's word/steps/length are what used to leak stale values here.
      if (this.browseLoader) {
        const cachedEntry: SequenceData = {
          id: sequence.id,
          name: sequence.name,
          displayName: sequence.displayName,
          word: normalized.exactWord,
          steps: [...hydrated.steps],
          thumbnails: sequence.thumbnails?.slice(0, 3) ?? [],
          leftSoloProp: normalized.ownerData.leftSoloProp,
          rightSoloProp: normalized.ownerData.rightSoloProp,
          stepPairings: normalized.ownerData.stepPairings,
          leftPathHash: normalized.ownerData.leftPathHash,
          rightPathHash: normalized.ownerData.rightPathHash,
          leftSoloHash: normalized.ownerData.leftSoloHash,
          rightSoloHash: normalized.ownerData.rightSoloHash,
          sequenceLength: normalized.sequenceLength,
          difficultyLevel: sequence.difficultyLevel,
          level,
          isCircular,
          loopType: loopType as SequenceData["loopType"],
          isFavorite: false,
          tags: tagNames,
          metadata: {},
          ownerId: userId,
          ownerDisplayName: (userData["displayName"] as string | undefined) ?? "Unknown",
          ownerAvatarUrl: userData["photoURL"] as string | undefined,
          birthday: sequence.birthday ?? sequence.createdAt ?? new Date(),
          dateAdded: new Date(),
          ...(sequence.source === "forked" && sequence.forkAttribution && {
            source: "forked" as const,
            forkAttribution: sequence.forkAttribution,
          }),
        };
        this.browseLoader.addToCache(cachedEntry);
      }
    } catch (error) {
      console.error(
        "[PublicIndexSyncer] Failed to sync to public index:",
        error
      );
      // Don't show a generic error modal for moderation failures - those have their own UI
      if (!(error instanceof ContentModerationError)) {
        const errorHandler = getErrorHandler() as ErrorHandler;
        errorHandler.showUserError({
          message: "Couldn't publish your sequence",
          technicalDetails: error instanceof Error ? error.message : String(error),
          error: error instanceof Error ? error : new Error(String(error)),
          severity: "error",
          context: {
            module: "library",
            action: "publish-sequence",
            additionalData: { sequenceId: sequence.id, userId },
          },
        });
      }
      throw error; // Re-throw so callers know the sync failed
    }
  }

  /**
   * Patch a completed background thumbnail without replaying a full public
   * sequence snapshot that may already be stale. The persister's narrow
   * transaction restamps the projection digest/revision on schema-2 documents
   * (and mirrors them onto the owner doc) so the stamps keep describing the
   * stored content.
   */
  async updateThumbnails(
    sequenceId: string,
    thumbnails: string[]
  ): Promise<void> {
    const firestore = await getFirestoreInstance();
    const publicThumbnails = thumbnails.slice(0, 3);

    await updatePublicThumbnails(firestore, sequenceId, publicThumbnails);
    this.browseLoader?.updateThumbnailsInCache(
      sequenceId,
      publicThumbnails
    );
  }

  /**
   * Remove a sequence from the public index. Atomic: public document, its
   * owned hash claim, and the owner document's projection stamps go together
   * (public-sequence-persister.unpublishPublicSequence). An absent mirror is
   * success — out-of-sync visibility or a prior removal leaves nothing to do.
   */
  async removeFromPublicIndex(sequenceId: string): Promise<void> {
    const firestore = await getFirestoreInstance();

    try {
      await unpublishPublicSequence(firestore, sequenceId);

      // Remove from cache immediately so the gallery reflects the change.
      this.browseLoader?.removeFromCache(sequenceId);
    } catch (error) {
      console.error(
        "[PublicIndexSyncer] Failed to remove from public index:",
        error
      );
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Couldn't unpublish your sequence",
        technicalDetails: error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: {
          module: "library",
          action: "unpublish-sequence",
          additionalData: { sequenceId },
        },
      });
      throw error; // Re-throw so callers know the removal failed
    }
  }

  /**
   * Write decomposed hand paths and solo props to public collections.
   * Each artifact is stored by its content hash so identical shapes across
   * different sequences converge to a single document.
   */
  private async syncArtifactsToPublic(
    firestore: Firestore,
    sequence: LibrarySequence,
    userId: string
  ): Promise<void> {
    const { leftSoloProp, rightSoloProp } = sequence;
    if (!leftSoloProp || !rightSoloProp) return;

    const timestamp = serverTimestamp();

    const artifacts: Array<{ collectionPath: string; docId: string; data: Record<string, unknown> }> = [];

    // Hand paths
    for (const soloProp of [leftSoloProp, rightSoloProp]) {
      const hp = soloProp.handPath;
      if (hp?.contentHash) {
        artifacts.push({
          collectionPath: "publicHandPaths",
          docId: hp.contentHash,
          data: {
            contentHash: hp.contentHash,
            locations: hp.locations,
            startLocation: hp.startLocation,
            endLocation: hp.endLocation,
            length: hp.length,
            bigrams: hp.bigrams,
            uniqueLocations: hp.uniqueLocations,
            impliedGridMode: hp.impliedGridMode,
            isClosed: hp.isClosed,
            ownerId: userId,
            publishedAt: timestamp,
          },
        });
      }
    }

    // Solo props
    for (const soloProp of [leftSoloProp, rightSoloProp]) {
      if (soloProp?.contentHash) {
        artifacts.push({
          collectionPath: "publicSoloProps",
          docId: soloProp.contentHash,
          data: {
            contentHash: soloProp.contentHash,
            steps: soloProp.steps,
            startLocation: soloProp.startLocation,
            startOrientation: soloProp.startOrientation,
            handPath: soloProp.handPath,
            length: soloProp.length,
            bigrams: soloProp.bigrams,
            impliedGridMode: soloProp.impliedGridMode,
            ownerId: userId,
            publishedAt: timestamp,
          },
        });
      }
    }

    // Write all artifacts in parallel - merge so we don't overwrite existing documents
    await Promise.allSettled(
      artifacts.map((a) =>
        setDoc(doc(firestore, a.collectionPath, a.docId), a.data, { merge: true })
      )
    );
  }

  /**
   * Resolve human-readable tag names for the sequence being published.
   *
   * A SequenceTag (and the legacy tagId) only carries the tag's document ID —
   * the display name lives on the LibraryTag doc at users/{userId}/tags/{tagId}.
   * We read the owner's tag collection once and map each applied id to its name,
   * preferring the structured `sequenceTags` and falling back to legacy
   * `tagIds`. Missing/unresolvable ids (e.g. a since-deleted tag) are dropped.
   *
   * A COLLECTION READ FAILURE fails the publish (parity-repair spec, section
   * 5): on the projection, an empty `tags` means "untagged" — a failed read
   * degrading to `[]` writes that lie into the public document, and the parity
   * audit cannot tell the two apart. The old degrade-to-empty contract
   * predates the projection builder; a dropped since-deleted id is still fine
   * (the id resolves to nothing by design), a failed read is not.
   *
   * We read the collection directly here rather than via tag-manager: those
   * functions are scoped to the *authenticated* user (authState) and surface
   * toasts on error, both wrong for a background publish keyed on an explicit
   * ownerId. The path helper (`getUserTagsPath`) is the shared source of truth.
   */
  private async resolveTagNames(
    firestore: Firestore,
    userId: string,
    sequence: LibrarySequence
  ): Promise<string[]> {
    // Prefer the structured sequenceTags; fall back to legacy tagIds.
    const tagIds = sequence.sequenceTags?.length
      ? sequence.sequenceTags.map((t) => t.tagId)
      : [...(sequence.tagIds ?? [])];

    if (tagIds.length === 0) return [];

    let snapshot: QuerySnapshot<DocumentData, DocumentData>;
    try {
      snapshot = await getDocs(collection(firestore, getUserTagsPath(userId)));
    } catch (error) {
      throw new Error(
        `Couldn't resolve tag names for "${sequence.word}" — the tag read failed, ` +
          "and publishing with an empty tag list would store 'untagged' as fact.",
        { cause: error }
      );
    }

    const nameById = new Map<string, string>();
    snapshot.forEach((d) => {
      const name = d.data()["name"];
      if (typeof name === "string" && name.length > 0) {
        nameById.set(d.id, name);
      }
    });

    const names: string[] = [];
    const seen = new Set<string>();
    for (const id of tagIds) {
      const name = nameById.get(id);
      // Skip ids that no longer resolve to a tag doc; dedup by name.
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Detect circularity and LOOP type using a layered strategy:
   * 1. Trust sequence.loopType if already set (generator-created LOOPs)
   * 2. Check loop-labels collection for human-curated override
   * 3. Run live algorithmic detection from step/motion data
   */
  private async detectLoopInfo(
    firestore: Firestore,
    sequence: LibrarySequence
  ): Promise<{ isCircular: boolean; loopType: string | null; period?: number; components?: string[] }> {
    // Layer 1: Trust existing loopType on the sequence (set by LOOP generator)
    if (sequence.loopType) {
      // Run detection anyway to get the period and components
      try {
        const detection = loopDetector.detectLOOPType(sequence);
        const display = resolveLoopDisplay(sequence);
        return {
          isCircular: true,
          loopType: sequence.loopType,
          period: detection.period ? periodToNumber(detection.period) : undefined,
          components: display.components.size > 0 ? [...display.components] : undefined,
        };
      } catch {
        return { isCircular: true, loopType: sequence.loopType };
      }
    }

    // Layer 2: Check loop-labels collection for human-curated override.
    // Loop labels are keyed by the sequence's bare letters, not its skew span.
    const curatedLoopType = await this.fetchLoopType(
      firestore,
      stripWordNotation(sequence.word)
    );
    if (curatedLoopType) {
      try {
        const detection = loopDetector.detectLOOPType(sequence);
        const display = resolveLoopDisplay(sequence);
        return {
          isCircular: true,
          loopType: curatedLoopType,
          period: detection.period ? periodToNumber(detection.period) : undefined,
          components: display.components.size > 0 ? [...display.components] : undefined,
        };
      } catch {
        return { isCircular: true, loopType: curatedLoopType };
      }
    }

    // Layer 3: Run live algorithmic detection
    const isCircular = isSeamlesslyLoopable(sequence);
    if (!isCircular) {
      return { isCircular: false, loopType: null };
    }

    // Sequence is circular - run full LOOP type detection
    try {
      const detection = loopDetector.detectLOOPType(sequence);
      const display = resolveLoopDisplay(sequence);
      return {
        isCircular: true,
        loopType: detection.loopType,
        period: detection.period ? periodToNumber(detection.period) : undefined,
        components: display.components.size > 0 ? [...display.components] : undefined,
      };
    } catch (error) {
      console.warn(
        `[PublicIndexSyncer] LOOP detection failed for "${sequence.word}", marking as circular with no type:`,
        error
      );
      return { isCircular: true, loopType: null };
    }
  }

  /**
   * Fetch LOOP type from the loop-labels collection.
   * Returns a string like "rotated", "mirrored+swapped", or null if not labeled or freeform.
   */
  private async fetchLoopType(
    firestore: Firestore,
    word: string
  ): Promise<string | null> {
    if (!word) return null;

    try {
      const labelDoc = await getDoc(doc(firestore, LOOP_LABELS_COLLECTION, word));

      if (!labelDoc.exists()) {
        return null;
      }

      const data = labelDoc.data();

      // If explicitly marked as freeform, return null (no recognized pattern)
      if (data.isFreeform) {
        return null;
      }

      // If has designations, join the components
      const designations = data.designations as Array<{
        loopType: string;
        components: string[];
      }> | undefined;

      if (designations && designations.length > 0) {
        const firstDesignation = designations[0];
        if (firstDesignation) {
          // Take the first designation's components and join them
          const components = firstDesignation.components;
          if (components && components.length > 0) {
            return components.join("+");
          }
          // Or use the loopType directly if no components (returns null for freeform)
          return firstDesignation.loopType || null;
        }
      }

      return null;
    } catch (error) {
      console.warn(
        `[PublicIndexSyncer] Failed to fetch LOOP label for "${word}":`,
        error
      );
      return null;
    }
  }
}
