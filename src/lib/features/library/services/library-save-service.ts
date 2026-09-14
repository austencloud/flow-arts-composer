/**
 * LibrarySaveService - Orchestrates saving sequences to library
 *
 * Handles the multi-step process of saving a sequence:
 * 1. Save to Dexie (instant, works offline)
 * 2. Create any new tags that don't exist
 * 3. Start Firestore sync and thumbnail work in the background
 * 4. Refresh library state
 *
 * The Dexie write in step 2 makes saving work offline. Firestore syncs
 * in the background and fails gracefully if the user is offline - the
 * sequence is already safe in local storage.
 */

import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { warmSequenceCells } from "$lib/shared/render/services/warm-sequence-cells";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SequenceVisibility } from "$lib/shared/library/domain/models/library-sequence";
import { findTagByName, createUserTag } from "./tag-manager";
import type { ArtifactExtractor } from "./artifact-extractor";
import { TAG_COLORS } from "../domain/models/tag";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte.ts";
import type { SaveToLibraryOptions, SaveProgress, SaveResult } from "./types";
import type { ErrorHandler } from "$lib/shared/application/services/error-handler";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import {
  isEmptySequence,
  meetsCommunityMinimum,
  MIN_COMMUNITY_STEPS,
  withCanonicalStepCount,
} from "$lib/shared/library/domain/sequence-min-length";
import { toast } from "$lib/shared/toast/state/toast-state.svelte.ts";
import { db } from "$lib/shared/persistence/database/tka-database";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { isFullAccountUser } from "$lib/shared/auth/domain/access-tier";
import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
import { GUEST_SAVE_CAP } from "$lib/shared/auth/domain/guest-access-config";
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import type { Sharer } from "../../../shared/share/services/sharer";
import type { R2VideoUploader } from "../../../shared/share/services/r2-video-uploader";
import type { LibraryRepository } from "$lib/shared/library/services/library-repository";
import { markSequenceSyncStatus } from "./library-sync-retry";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import { recordSavedSequenceId } from "$lib/shared/library/services/saved-sequence-ledger";
import { clearSequenceDeletionIntent } from "$lib/shared/library/services/sequence-persistence-coordinator";
import { reportPostHogLifecycleEvent } from "$lib/shared/analytics/services/posthog-lifecycle-reporter";
import {
  captureActivePropConfig,
  resolveRecordedPropConfig,
} from "$lib/shared/foundation/services/recorded-prop-intent";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";

/** How long the "Saved!" success state lingers before the overlay dismisses. */
const SUCCESS_STATE_LINGER_MS = 800;

// NOTE: The 'Service' suffix violates the service-naming rule (should be e.g.
// LibrarySaveCoordinator). Rename deferred: this class is imported as a type by
// out-of-scope files (features/create/shared/state/save-panel-state.svelte.ts,
// SaveToLibraryPanel.svelte) and referenced in the shared library contract.
// Renaming would force cross-scope churn into parallel-session areas.
export class LibrarySaveService {
  private readonly shareService: Sharer | null;
  private readonly uploadService: R2VideoUploader | null;
  private readonly libraryRepository: LibraryRepository;
  private readonly artifactExtractor: ArtifactExtractor | null;

  constructor(
    shareService: Sharer | null,
    uploadService: R2VideoUploader | null,
    libraryRepository: LibraryRepository,
    artifactExtractor?: ArtifactExtractor | null
  ) {
    this.shareService = shareService ?? null;
    this.uploadService = uploadService ?? null;
    this.libraryRepository = libraryRepository;
    this.artifactExtractor = artifactExtractor ?? null;
  }

  async saveSequence(
    sequence: SequenceData,
    options: SaveToLibraryOptions,
    onProgress?: (progress: SaveProgress) => void
  ): Promise<SaveResult> {
    // Guests can save: ensure an (anonymous) identity exists so the Firestore
    // sync and thumbnail upload have a uid, regardless of how the user entered
    // Create (Construct already provisions on start-position select; Generate /
    // import do not). Best-effort — ensureGuestIdentity() swallows failures
    // (anon provider disabled, offline), and the Dexie write below keeps the
    // save working even when no identity could be provisioned.
    await ensureGuestIdentity();

    if (isEmptySequence(sequence)) {
      throw new LibraryError(
        "Nothing to save — this sequence has no steps.",
        "INVALID_DATA",
        sequence.id
      );
    }

    const { name, displayName, tags, notes } = options;
    // Community gate: under the minimum, a sequence can still be saved to the
    // user's own library — just not posted to the community gallery. Degrade the
    // requested visibility and tell them, rather than failing the save. The
    // repository + syncer enforce the same invariant as a backstop.
    // Public is the product default. Callers may still opt into private, and
    // the community minimum below remains the authoritative safety gate.
    let visibility = options.visibility ?? "public";
    // Decide the downgrade now (it shapes the Dexie/Firestore write metadata
    // below), but DON'T announce "Saved to your library." until the local write
    // actually lands — otherwise a subsequent Dexie failure that rejects this
    // save would have already flashed a false success. Toast fires post-persist.
    const communityDowngraded =
      visibility === "public" && !meetsCommunityMinimum(sequence);
    if (communityDowngraded) {
      visibility = "private";
    }

    const emitProgress = (step: number) => {
      onProgress?.({
        step,
        stepLabel: this.getStepLabel(step),
      });
    };

    // Resolve the sequence id ONCE up front so the thumbnail upload, the Dexie
    // row, the Firestore doc, and the returned id all reference the same
    // sequence. Previously the thumbnail + Firestore sync received the original
    // (often id-less) `sequence`, so LibraryRepository minted a *different* UUID
    // for the cloud copy — duplicating the cloud doc and orphaning the Dexie row.
    const resolvedSequence: SequenceData = {
      ...sequence,
      id: sequence.id || crypto.randomUUID(),
    };

    // Guest save cap: a guest may keep up to GUEST_SAVE_CAP sequences on this
    // device. Re-saving one already in the library is an update, not a new save,
    // so it's always allowed. A brand-new save past the cap is blocked and routes
    // the guest to sign up. Full accounts are never capped. Gated here (before the
    // expensive thumbnail render) so all callers of saveSequence share the limit.
    const isFullAccount = isFullAccountUser(
      authState.isAuthenticated,
      authState.isAnonymous
    );
    const alreadySavedLocally = await db.sequences.get(resolvedSequence.id);
    if (!isFullAccount) {
      if (!alreadySavedLocally) {
        const guestCount = await db.sequences.count();
        if (guestCount >= GUEST_SAVE_CAP) {
          // The modal explains the limit. A second toast repeats the same ask.
          authDrawerState.show("signup", "save-limit");
          throw new LibraryError(
            `Guest save limit reached (${GUEST_SAVE_CAP}).`,
            "GUEST_CAP",
            resolvedSequence.id
          );
        }
      }
    }

    // Synchronous duplicate pre-check (cheap read, hasMatchingContent) run
    // before the expensive thumbnail render / Dexie write, so the caller's
    // awaited saveSequence() rejects with ALREADY_EXISTS directly instead of
    // relying on the fire-and-forget syncToFirestore() below, which the
    // scan/import path never awaits. Only for brand-new saves. Fails open on
    // any error (offline, unauthenticated guest, hash failure) - duplicate
    // detection is a UX nicety, never a reason to block a valid save. The
    // repository's own write-time check remains the authoritative backstop
    // against a race between two concurrent saves of the same content.
    if (!alreadySavedLocally) {
      try {
        const preCheckHash = await computeHash(resolvedSequence);
        const isDuplicate =
          await this.libraryRepository.hasMatchingContent(preCheckHash);
        if (isDuplicate) {
          throw new LibraryError(
            "This exact sequence is already in your library",
            "ALREADY_EXISTS",
            resolvedSequence.id
          );
        }
      } catch (error) {
        if (error instanceof LibraryError) throw error;
        console.warn(
          "[LibrarySaveService] Duplicate pre-check failed (proceeding without it):",
          error
        );
      }
    }

    // Step 1: Save to Dexie before rendering or uploading a thumbnail. The
    // user's work is safe immediately even when image rendering, R2, or the
    // network stalls.
    emitProgress(1);
    // Publication-moment intent capture: a public save that carries no valid
    // recorded prop pair stamps the creator's active props as its presentation
    // intent, so public previews render what the creator was looking at.
    // Private saves are working saves, not presentation statements, and a
    // sequence that already has a recording (visual-save coordinator, Fuse)
    // keeps it — a re-save never silently restamps it from Settings.
    const capturedIntent =
      visibility === "public" && !resolveRecordedPropConfig(resolvedSequence)
        ? captureActivePropConfig(settingsService.settings)
        : null;
    const sequenceToSave = withCanonicalStepCount({
      ...resolvedSequence,
      ...(capturedIntent && {
        creatorIntent: {
          ...resolvedSequence.creatorIntent,
          propConfig: capturedIntent,
        },
        intendedProp: capturedIntent,
      }),
      name,
      displayName: displayName || undefined,
      tags: [...tags],
      thumbnails: [...(sequence.thumbnails ?? [])],
      isFavorite: false,
      // Cloud sync hasn't happened yet - the background Firestore write below
      // flips this to "synced"/"failed" once it settles. Lets the library UI
      // show a quiet badge instead of a silent "Saved!" for content that's
      // only in Dexie so far. See docs/superpowers/specs/active/
      // 2026-07-18-onboarding-silent-work-loss.md.
      syncStatus: "pending",
      pendingSyncMetadata: { visibility, notes: notes ?? "" },
    });
    let persisted = false;
    try {
      // JSON round-trip strips Firestore Timestamps and other non-cloneable objects
      const cloneable = JSON.parse(JSON.stringify(sequenceToSave));
      await db.sequences.put(cloneable);
      persisted = true;
      clearSequenceDeletionIntent(resolvedSequence.id);
    } catch (dexieError) {
      // Dexie is the guaranteed-persistence layer ("safe in local storage
      // before we ever touch Firestore"). If it fails, that guarantee is void —
      // surface it instead of swallowing, so the user isn't shown "Saved!" for a
      // sequence that may exist nowhere (the Firestore sync below is
      // fire-and-forget and may be offline).
      console.warn(
        "[LibrarySaveService] Dexie optimistic save failed:",
        dexieError
      );
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message:
          "Couldn't save a local copy — this sequence may not be available offline",
        technicalDetails:
          dexieError instanceof Error ? dexieError.message : String(dexieError),
        error:
          dexieError instanceof Error
            ? dexieError
            : new Error(String(dexieError)),
        severity: "error",
        context: { module: "library", action: "save-to-library" },
      });
      throw new LibraryError(
        "Couldn't save this sequence - local storage write failed.",
        "PERSIST_FAILED",
        sequenceToSave.id
      );
    }

    const sequenceId = sequenceToSave.id;

    // Record this id under the current uid so a later guest→account upgrade
    // captures EXACTLY this session's own drafts (saved-sequence-ledger),
    // instead of sweeping every row out of the flat, never-cleared Dexie store
    // (which could import a prior user's library on a shared device).
    recordSavedSequenceId(authState.effectiveUserId, sequenceId);

    // Now that the local write has landed (persisted === true past the throw
    // above), it's honest to tell a public-visibility save it was kept private.
    if (communityDowngraded) {
      toast.info(
        `Needs at least ${MIN_COMMUNITY_STEPS} steps to post to the community gallery. Saved to your library.`
      );
    }

    // Step 2: Create any new tags
    emitProgress(2);
    await this.createNewTags(tags);

    const syncMetadata = {
      name,
      displayName,
      visibility,
      tags,
      notes: notes ?? "",
    };

    // Step 3: Background Firestore sync (non-blocking)
    // If offline, the sequence is already in Dexie and the user sees success.
    emitProgress(3);
    const initialCloudSync = this.syncToFirestore(sequenceToSave, syncMetadata);

    // Thumbnail work is an enhancement to an already-durable save. A slow or
    // blocked upload must never hold the save overlay open. Once the image is
    // ready, patch the local row and then the cloud document.
    void this.generateAndAttachThumbnail(
      sequenceToSave,
      initialCloudSync
    ).catch((error) =>
      console.warn("[LibrarySaveService] Thumbnail follow-up failed:", error)
    );

    // Fire-and-forget: pre-render this sequence's pictograph cells to the cloud
    // store (canonical visibility + intendedProp) so the first person to scan
    // its QR downloads images instead of rendering them on their phone. Never
    // blocks or fails the save.
    if (typeof window !== "undefined") {
      const ip = sequenceToSave.intendedProp;
      void warmSequenceCells(sequenceToSave, {
        isDark: true,
        leftPropType: ip?.leftPropType,
        rightPropType: ip?.rightPropType,
        catDogMode: ip?.catDogMode ?? false,
      }).catch(() => {});
    }

    // Fire-and-forget: decompose the sequence into hand paths and solo props
    // so they're independently queryable in the user's artifact repositories.
    const currentUserId = authState.effectiveUserId;
    if (
      this.artifactExtractor &&
      currentUserId &&
      sequenceToSave.leftSoloProp &&
      sequenceToSave.rightSoloProp
    ) {
      this.artifactExtractor
        .extract(sequenceToSave, currentUserId)
        .catch((err) =>
          console.error("Artifact extraction failed (non-blocking):", err)
        );
    }

    // A signed-in public save must finish its owner write and public mirror
    // before the UI reports completion. Private saves and guest/offline saves
    // retain the local-first path above.
    if (isFullAccount && visibility === "public") {
      const synced = await initialCloudSync;
      if (!synced) {
        toast.warning(
          "Saved on this device, but it is not public on other devices yet. It will retry when you are online."
        );
      }
    }

    // Step 4: Refresh library state
    emitProgress(4);
    await this.refreshLibraryState();

    // Step 5: Complete
    emitProgress(5);

    // This is the canonical completion boundary shared by every save entry.
    // The event is server-captured under the verified Firebase uid; delivery
    // failure is observable but cannot undo work already durable in the library.
    try {
      await reportPostHogLifecycleEvent({
        event: "sequence_save",
        properties: {
          sequenceId,
          stepCount: sequenceToSave.sequenceLength ?? 0,
          visibility,
          durability: isFullAccount ? "cloud" : "local",
          source: options.analyticsSource ?? "unspecified",
        },
      });
    } catch (error) {
      console.warn(
        "[LibrarySaveService] Could not deliver save lifecycle event:",
        error
      );
    }

    // Value-moment nudge: a guest just saved successfully. Encourage account
    // creation once per device. Members (full accounts) never see this.
    this.maybeNudgeGuestToSignUp();

    // Brief pause to show success state
    await new Promise((resolve) =>
      setTimeout(resolve, SUCCESS_STATE_LINGER_MS)
    );

    return { sequenceId, persisted, isGuest: !isFullAccount };
  }

  /**
   * One gentle, non-blocking account nudge after a guest's first successful
   * save. Guarded to guests (anon / unauthenticated) and once per device.
   */
  private maybeNudgeGuestToSignUp(): void {
    if (typeof window === "undefined") return;
    const isFullAccount = isFullAccountUser(
      authState.isAuthenticated,
      authState.isAnonymous
    );
    if (isFullAccount) return;
    authDrawerState.offerGuestSaveNudge({
      message:
        "Saved on this device. Create a free account to open it on other devices.",
    });
  }

  getStepLabel(step: number): string {
    const labels: Record<number, string> = {
      1: "Saving locally",
      2: "Creating tags",
      3: "Syncing to cloud",
      4: "Refreshing library",
      5: "Complete",
    };

    return labels[step] || "Processing...";
  }

  /**
   * Fire-and-forget Firestore sync. Runs after the local Dexie save succeeds,
   * so if this fails (e.g. offline) the sequence is already safe locally.
   */
  private async syncToFirestore(
    sequence: SequenceData,
    metadata: {
      name: string;
      displayName?: string;
      visibility: SequenceVisibility;
      tags: string[];
      notes: string;
      thumbnailUrl?: string;
    }
  ): Promise<boolean> {
    try {
      await this.libraryRepository.saveSequenceWithMetadata(sequence, metadata);
      await markSequenceSyncStatus(sequence.id, "synced");
      return true;
    } catch (error) {
      if (error instanceof LibraryError && error.code === "ALREADY_EXISTS") {
        toast.info("This exact sequence is already in your library.");
        // The content is already safe in Firestore under an existing doc -
        // this save didn't create a duplicate, but nothing was lost.
        await markSequenceSyncStatus(sequence.id, "synced");
        return true;
      } else {
        console.warn(
          "[LibrarySaveService] Firestore sync failed (data safe in Dexie):",
          error
        );
        await markSequenceSyncStatus(sequence.id, "failed");
        return false;
      }
    }
  }

  private async generateAndAttachThumbnail(
    sequence: SequenceData,
    initialCloudSync: Promise<boolean>
  ): Promise<void> {
    const thumbnailUrl = await this.generateAndUploadThumbnail(sequence);
    if (!thumbnailUrl) return;

    const thumbnails = [
      thumbnailUrl,
      ...sequence.thumbnails.filter((url) => url !== thumbnailUrl),
    ];

    try {
      await db.sequences.update(sequence.id, { thumbnails });
    } catch (error) {
      console.warn(
        "[LibrarySaveService] Could not attach thumbnail to local save:",
        error
      );
    }

    // If the first cloud write failed, the retry service reads this freshly
    // patched Dexie row and carries the thumbnail on its next bounded pass.
    if (!(await initialCloudSync)) return;

    await this.libraryRepository.attachThumbnail(sequence.id, thumbnailUrl);
  }

  /**
   * Generate thumbnail and upload to storage
   * Returns thumbnail URL or undefined if generation/upload fails
   */
  private async generateAndUploadThumbnail(
    sequence: SequenceData
  ): Promise<string | undefined> {
    if (!this.shareService || !this.uploadService) {
      console.warn(
        "[LibrarySaveService] Share or upload service not available, skipping thumbnail"
      );
      return undefined;
    }

    try {
      // Build the saved thumbnail through the one canonical card-render builder
      // (buildCardRenderOptions, via Sharer.getCardImageBlob) so the saved PNG
      // matches the viewer card AND the save-panel preview — prop type, QR,
      // mandala, LOOP glyph, columns, start-layout and footer all come from the
      // user's composition settings. The old path hand-built a ShareOptions
      // subset that dropped QR + mandala and never read the selected prop.
      const imageCompositionManager = getImageCompositionManager();

      const imageBlob = await this.shareService.getCardImageBlob(sequence, {
        propConfig: resolveRecordedPropConfig(sequence) ?? undefined,
        darkMode: imageCompositionManager.darkMode,
      });

      const uploadResult = await this.uploadService.uploadSequenceThumbnail(
        sequence.id,
        imageBlob,
        "png"
      );

      return uploadResult.url;
    } catch (error) {
      // Don't fail the entire save if thumbnail generation fails - show a warning instead
      console.error(
        "[LibrarySaveService] Failed to generate/upload thumbnail:",
        error
      );
      const errorHandler = getErrorHandler() as ErrorHandler;
      errorHandler.showUserError({
        message: "Sequence saved, but the thumbnail didn't generate",
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error: error instanceof Error ? error : new Error(String(error)),
        severity: "warning",
        context: {
          module: "library",
          action: "save-to-library",
        },
      });
      return undefined;
    }
  }

  /**
   * Create any new tags that don't exist in the system
   */
  private async createNewTags(tags: string[]): Promise<void> {
    if (tags.length === 0) {
      return;
    }

    try {
      for (const tagName of tags) {
        const normalized = tagName.toLowerCase().trim();
        const existing = await findTagByName(normalized);

        if (!existing) {
          // Create new tag with random color
          const randomColor =
            TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
          await createUserTag(normalized, { color: randomColor });
        }
      }
    } catch (error) {
      // Don't fail the save if tag creation fails
      console.error("[LibrarySaveService] Failed to create tags:", error);
    }
  }

  /**
   * Refresh library state after saving
   */
  private async refreshLibraryState(): Promise<void> {
    try {
      const { libraryState } =
        await import("$lib/features/library/state/library-state.svelte.ts");
      if (libraryState) {
        await libraryState.loadSequences();
      }
    } catch (error) {
      console.warn(
        "[LibrarySaveService] Could not refresh library state:",
        error
      );
    }
  }
}
