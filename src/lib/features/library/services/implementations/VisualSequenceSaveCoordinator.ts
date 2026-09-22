import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { computeHash } from "$lib/shared/library/services/sequence-content-hasher";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { PropType as PropTypeValues } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  removeToast,
  showToast,
} from "$lib/shared/toast/state/toast-state.svelte";
import { postSaveActivation } from "$lib/shared/onboarding/state/post-save-activation-state.svelte";
import type { LibrarySaveService } from "../library-save-service";
import type {
  IVisualSequenceSaveCoordinator,
  VisualSequenceSaveIntent,
  VisualSequenceSaveOutcome,
} from "$lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator";

const PROP_TYPES = new Set<string>(Object.values(PropTypeValues));

function resolvePropType(
  requested: string | null | undefined,
  saved: PropType | undefined
): PropType {
  if (requested && PROP_TYPES.has(requested)) return requested as PropType;
  return saved ?? PropTypeValues.STAFF;
}

function deriveSequenceName(sequence: SequenceData): string {
  return (
    sequence.word ||
    sequence.steps
      ?.map((step) => step?.letter || "")
      .filter(Boolean)
      .join("") ||
    ""
  );
}

/**
 * Owns the one-click save used by visual context menus and the viewer header.
 * The underlying LibrarySaveService remains the persistence boundary; this
 * coordinator adds the presentation intent, progress toast, duplicate handling,
 * and in-flight deduplication that every no-form save entry needs.
 */
export class VisualSequenceSaveCoordinator implements IVisualSequenceSaveCoordinator {
  private readonly inFlightByContent = new Map<
    string,
    Promise<VisualSequenceSaveOutcome>
  >();

  constructor(
    private readonly librarySaveService: Pick<
      LibrarySaveService,
      "saveSequence"
    >
  ) {}

  async save(
    sequence: SequenceData,
    intent: VisualSequenceSaveIntent = {}
  ): Promise<VisualSequenceSaveOutcome> {
    const sequenceWithIntent = this.withPresentationIntent(sequence, intent);

    let contentHash: string;
    try {
      contentHash = await computeHash(sequenceWithIntent);
    } catch (error) {
      console.error("[VisualSequenceSaveCoordinator] Hash failed:", error);
      showToast("Couldn't prepare this sequence to save", "error");
      return { status: "failed", error };
    }

    const existingSave = this.inFlightByContent.get(contentHash);
    if (existingSave) return existingSave;

    const save = this.persist(sequenceWithIntent, contentHash);
    this.inFlightByContent.set(contentHash, save);
    try {
      return await save;
    } finally {
      if (this.inFlightByContent.get(contentHash) === save) {
        this.inFlightByContent.delete(contentHash);
      }
    }
  }

  private withPresentationIntent(
    sequence: SequenceData,
    intent: VisualSequenceSaveIntent
  ): SequenceData {
    const savedPropConfig =
      sequence.creatorIntent?.propConfig ?? sequence.intendedProp ?? undefined;
    const leftPropType = resolvePropType(
      intent.leftPropType,
      savedPropConfig?.leftPropType
    );
    const rightPropType = resolvePropType(
      intent.rightPropType,
      savedPropConfig?.rightPropType
    );
    const catDogMode =
      intent.catDogModeEnabled ?? savedPropConfig?.catDogMode ?? false;
    const savedPathShape = sequence.metadata?.pathShape;
    const pathShape =
      intent.pathShape ??
      (savedPathShape === "linear" || savedPathShape === "concave"
        ? savedPathShape
        : "arc");
    const presentation =
      intent.presentation !== undefined
        ? intent.presentation
        : sequence.creatorIntent?.presentation;

    return createSequenceData({
      ...sequence,
      metadata:
        pathShape === "arc"
          ? sequence.metadata
          : { ...sequence.metadata, pathShape },
      creatorIntent: {
        propConfig: { leftPropType, rightPropType, catDogMode },
        ...(sequence.creatorIntent?.effortTimeline !== undefined
          ? { effortTimeline: sequence.creatorIntent.effortTimeline }
          : sequence.effortTimeline !== undefined
            ? { effortTimeline: sequence.effortTimeline }
            : {}),
        ...(presentation !== undefined && { presentation }),
      },
      intendedProp: { leftPropType, rightPropType, catDogMode },
    });
  }

  private async persist(
    sequence: SequenceData,
    contentHash: string
  ): Promise<VisualSequenceSaveOutcome> {
    const pendingToastId = showToast({
      message: "Saving to library…",
      type: "info",
      duration: 0,
      announcement: "polite",
    });

    try {
      const result = await this.librarySaveService.saveSequence(sequence, {
        name: deriveSequenceName(sequence),
        visibility: "public",
        tags: [],
        notes: "",
        analyticsSource: "viewer",
      });
      removeToast(pendingToastId, "programmatic");
      showToast("Saved to library", "success");

      if (result.persisted) {
        postSaveActivation.onGuestSaveSucceeded(result.sequenceId);
      }

      return { status: "saved", contentHash, sequence, result };
    } catch (error) {
      removeToast(pendingToastId, "programmatic");
      if (error instanceof LibraryError && error.code === "GUEST_CAP") {
        // LibrarySaveService owns the account prompt. Keep this attempt
        // unsuccessful without adding another notification on top of it.
        return { status: "failed", error };
      }
      if (error instanceof LibraryError && error.code === "ALREADY_EXISTS") {
        showToast("Already in library", "info");
        return { status: "already-saved", contentHash, sequence };
      }

      console.error(
        "[VisualSequenceSaveCoordinator] Failed to save sequence:",
        error
      );
      const message =
        error instanceof Error ? error.message : "Failed to save sequence";
      showToast(message, "error");
      return { status: "failed", error };
    }
  }
}
