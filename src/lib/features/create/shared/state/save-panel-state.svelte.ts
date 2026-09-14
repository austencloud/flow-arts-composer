import { untrack } from "svelte";
import { captureActivePropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
import { withSavedProps } from "$lib/shared/foundation/services/prop-viewing";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { libraryState } from "$lib/features/library/state/library-state.svelte";
import { computeHash as computeSequenceHash } from "$lib/shared/library/services/sequence-content-hasher";
import {
  isEmptySequence,
  meetsCommunityMinimum,
  MIN_COMMUNITY_STEPS,
} from "$lib/shared/library/domain/sequence-min-length";
import type { ContentModerationResult } from "$lib/features/moderation/domain/models/content-moderation-models";
import type { ShameCategory } from "$lib/features/hall-of-shame/domain/models/hall-of-shame-models";
import type { HallOfShameSubmitter } from "$lib/features/hall-of-shame/services/hall-of-shame-submitter";
import type { LibrarySaveService } from "$lib/features/library/services/library-save-service";
import type { SaveProgress } from "$lib/shared/library/domain/library-contract-types";
import { LibraryError } from "$lib/shared/library/domain/library-error";
import type { CreateModuleContext } from "../context/create-module-context";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import { handleModuleChange } from "$lib/shared/navigation-coordinator/navigation-coordinator.svelte";
import { postSaveActivation } from "$lib/shared/onboarding/state/post-save-activation-state.svelte";
import type { SoloPropSaveOrchestrator } from "$lib/features/library/services/solo-prop-save-orchestrator";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "$lib/shared/foundation/services/sequence-decomposer";
import { getSequenceMotionProfile } from "$lib/shared/foundation/services/sequence-motion-profile";
import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
import {
  normalizeCardPresentation,
  type CardPresentation,
} from "$lib/shared/share/domain/models/card-presentation";

type ContentModerator = {
  checkWord: (word: string) => ContentModerationResult;
};

export interface SavePanelDeps {
  ctx: CreateModuleContext;
  librarySaveService: LibrarySaveService | null;
  soloPropSaveOrchestrator: SoloPropSaveOrchestrator | null;
  contentModerator: ContentModerator | null;
  hallOfShameSubmitter: HallOfShameSubmitter | null;
  getDefaultCardPresentation: () => CardPresentation;
}

export interface SavePanelProps {
  show: boolean;
  word: string;
  showShareContext: boolean;
  onClose?: () => void;
  onSaveComplete?: (sequenceId: string) => void;
}

export function createSavePanelState(deps: SavePanelDeps) {
  const {
    ctx,
    librarySaveService,
    soloPropSaveOrchestrator,
    contentModerator,
    hallOfShameSubmitter,
    getDefaultCardPresentation,
  } = deps;
  const { CreateModuleState } = ctx;
  const logger = createComponentLogger("SaveToLibraryPanel");

  // Save steps definition (static)
  const saveSteps = [
    { icon: "fa-save", label: "Saving locally" },
    { icon: "fa-tags", label: "Creating tags" },
    { icon: "fa-cloud-upload-alt", label: "Syncing to cloud" },
    { icon: "fa-sync", label: "Refreshing library" },
  ];

  const headerTitle = "Save to Library";

  // Reactive state

  let isOpen = $state(false);
  let isSaving = $state(false);
  let saveStep = $state(0);
  let publishToCommunity = $state(false);

  // Form state
  let saveProps = $state(captureActivePropConfig(getSettings()));
  let notes = $state("");
  let title = $state("");
  let showNotes = $state(false);
  let cardPresentation = $state<CardPresentation>(
    normalizeCardPresentation(getDefaultCardPresentation())
  );
  // Collections chosen in the picker. The sequence isn't saved yet, so we
  // collect ids here and file them right after the save (see handleSave).
  let selectedCollectionIds = $state<string[]>([]);

  // Responsive layout
  let panelWidth = $state(0);

  // Content moderation state
  let moderationResult = $state<ContentModerationResult | null>(null);
  let showAppealModal = $state(false);
  const savedSequenceIdForAppeal = $state<string | null>(null);

  // Hall of Shame state
  let showShameGate = $state(false);
  let isSubmittingToShame = $state(false);
  let shameSubmitError = $state<string | null>(null);

  // Exact duplicate
  let isExactDuplicate = $state(false);

  // Derived values

  const isBottomSheet = $derived(!ctx.layout.shouldUseSideBySideLayout);

  const activeSequenceState = $derived.by(() =>
    CreateModuleState.getActiveTabSequenceState()
  );
  const sequence = $derived.by(() => activeSequenceState.currentSequence);
  const motionProfile = $derived.by(() =>
    sequence ? getSequenceMotionProfile(sequence) : { kind: "empty" as const }
  );
  const isSolo = $derived(motionProfile.kind === "solo");
  const isMixed = $derived(motionProfile.kind === "mixed");
  const soloHand = $derived(
    motionProfile.kind === "solo" ? motionProfile.hand : null
  );
  const authoredHand = $derived(
    motionProfile.kind === "solo" ? motionProfile.authoredHand : null
  );
  const requiresAccount = $derived(isSolo && !authState.isFullAccount);

  const isMobileLayout = $derived(panelWidth < 640);

  const currentUser = $derived(authState.user);
  const creatorName = $derived(
    currentUser?.displayName || currentUser?.email || "Anonymous"
  );
  const darkMode = $derived(getSettings().darkMode ?? false);

  const isFlagged = $derived(
    !isSolo && moderationResult !== null && !moderationResult.isAllowed
  );

  // Props getter — allows the component to bind its reactive props into this factory.
  // Declared early because tkaName (and downstream deriveds) depend on it.
  let _propsGetter: () => SavePanelProps = () => ({
    show: false,
    word: "",
    showShareContext: false,
  });

  // Derive TKA name from word prop, sequence word, or compute from beat letters.
  const derivedWord = $derived.by(() => {
    const props = _propsGetter();
    if (props.word) return props.word;
    if (sequence?.word) return sequence.word;

    if (sequence?.steps && sequence.steps.length > 0) {
      const letters = sequence.steps
        .map((step) => step?.letter || "")
        .filter(Boolean)
        .join("");
      return letters || "";
    }

    return "";
  });

  const tkaName = $derived(derivedWord);
  const saveName = $derived(isSolo ? title.trim() : tkaName);

  // Duplicate detection
  const duplicateCheck = $derived.by(() => {
    if (isSolo || !tkaName || !isOpen)
      return { hasDuplicate: false, existingSequences: [] as unknown[] };
    return libraryState.checkForDuplicate(tkaName);
  });
  const hasDuplicate = $derived(duplicateCheck.hasDuplicate);
  const duplicateCount = $derived(duplicateCheck.existingSequences.length);

  // Saved version of this sequence in library
  const savedSequence = $derived.by(() => {
    const id = sequence?.id;
    if (!id) return null;
    return libraryState.getSequenceById(id) ?? null;
  });

  const isAlreadyPublished = $derived(savedSequence?.visibility === "public");

  // Only a truly empty (0-step) sequence is too short to save. A 1-count is a
  // valid personal-library entry.
  const isTooShort = $derived(!!sequence && isEmptySequence(sequence));

  // The community gallery requires MIN_COMMUNITY_STEPS. Under that, the Make
  // Public toggle is disabled with a note — the sequence still saves to the
  // personal library. (Repository + syncer enforce the same floor as a backstop.)
  const canPublishToCommunity = $derived(
    !!sequence && meetsCommunityMinimum(sequence)
  );

  const canSave = $derived(
    !!saveName &&
      !isSaving &&
      !isFlagged &&
      !isExactDuplicate &&
      !isTooShort &&
      !isMixed
  );

  // Data-logic effects (no DOM references)

  // Sync isOpen with show prop
  $effect(() => {
    isOpen = _propsGetter().show;
  });

  // New eligible saves default public. Reopening an existing sequence preserves
  // its current choice instead of silently publishing a private draft.
  $effect(() => {
    if (_propsGetter().show) {
      publishToCommunity = savedSequence
        ? isAlreadyPublished && canPublishToCommunity
        : canPublishToCommunity;
    }
  });

  // Clamp: never leave the toggle on for a sequence that can't be published
  // (e.g. the user removed steps after toggling it on).
  $effect(() => {
    if (!canPublishToCommunity && publishToCommunity) {
      publishToCommunity = false;
    }
  });

  // Run content moderation when tkaName changes
  $effect(() => {
    if (!isSolo && tkaName && contentModerator && _propsGetter().show) {
      moderationResult = contentModerator.checkWord(tkaName);
    } else {
      moderationResult = null;
    }
  });

  // Reset form when sequence changes or panel opens
  $effect(() => {
    if (sequence && _propsGetter().show) {
      saveProps = untrack(() => captureActivePropConfig(getSettings()));
      notes = "";
      title =
        motionProfile.kind === "solo"
          ? `${motionProfile.authoredHand === "left" ? "Left" : "Right"}-hand choreography`
          : "";
      showNotes = false;
      cardPresentation = sequence.cardPresentation
        ? normalizeCardPresentation(sequence.cardPresentation)
        : normalizeCardPresentation(getDefaultCardPresentation());
      selectedCollectionIds = [];
    }
  });

  // Eagerly load library sequences when panel opens so duplicate detection works
  $effect(() => {
    if (_propsGetter().show && authState.user) {
      libraryState.loadSequences();
    }
  });

  // Exact duplicate detection (async hash comparison)
  $effect(() => {
    const show = _propsGetter().show;
    if (!show || !sequence || isSolo) {
      isExactDuplicate = false;
      return;
    }

    let cancelled = false;
    computeSequenceHash(sequence).then((hash) => {
      if (cancelled) return;
      const match = libraryState.findByContentHash(hash);
      isExactDuplicate = !!match && match.id !== sequence.id;
    });

    return () => {
      cancelled = true;
    };
  });

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  async function handleSave() {
    const props = _propsGetter();
    if (!saveName || !sequence || isMixed) return;

    if (isSolo && !authState.isFullAccount) {
      authDrawerState.show("signup", "save");
      return;
    }

    if (isSolo) {
      if (!soloPropSaveOrchestrator || !authoredHand || !soloHand) {
        logger.error("SoloPropSaveOrchestrator not available");
        showToast({
          message: "Solo choreography could not be saved. Try again.",
          type: "error",
          duration: 6000,
        });
        return;
      }

      isSaving = true;
      saveStep = 1;
      try {
        const extracted =
          soloHand === "left"
            ? extractLeftSoloProp(sequence)
            : extractRightSoloProp(sequence);
        const result = await soloPropSaveOrchestrator.save(extracted, {
          name: saveName,
          notes: notes.trim(),
          authoredHand,
          ownerId: authState.effectiveUserId ?? undefined,
          ownerDisplayName: creatorName,
        });
        saveStep = 4;

        const sessionId =
          ctx.sessionManager?.getSessionId() ?? ctx.autosaver?.getSessionId();
        try {
          await ctx.autosaver?.deleteLocalDraft(sessionId);
        } catch (draftError) {
          logger.warn(
            "Could not remove the completed local draft:",
            draftError
          );
        }
        if (ctx.sessionManager) {
          void ctx.sessionManager
            .markAsSaved(result.soloPropId)
            .catch((sessionError) =>
              logger.warn(
                "Could not complete the cloud session lifecycle:",
                sessionError
              )
            );
        }

        props.onSaveComplete?.(result.soloPropId);
        showToast({
          message: result.reusedExisting
            ? "Already in your solo library."
            : "Saved to your solo library.",
          type: "success",
          duration: 6000,
          action: {
            label: "Go to library",
            onClick: () => void handleModuleChange("browse", "library"),
          },
        });
        handleClose();
      } catch (error) {
        logger.error("Failed to save solo choreography:", error);
        showToast({
          message:
            error instanceof Error
              ? `Couldn't save this choreography: ${error.message}`
              : "Couldn't save this choreography. Try again.",
          type: "error",
          duration: 6000,
        });
      } finally {
        isSaving = false;
        saveStep = 0;
      }
      return;
    }

    if (!librarySaveService) {
      logger.error("LibrarySaveService not available");
      return;
    }

    isSaving = true;
    saveStep = 1;

    try {
      logger.info("Saving sequence to library...", {
        stepCount: sequence.steps.length,
        tkaName,
      });

      const result = await librarySaveService.saveSequence(
        { ...withSavedProps(sequence, saveProps), cardPresentation },
        {
          name: tkaName,
          visibility: publishToCommunity && !isFlagged ? "public" : "private",
          tags: [],
          notes: notes.trim(),
          analyticsSource: "create_save_panel",
        },
        (progress: SaveProgress) => {
          saveStep = progress.step;
        }
      );

      logger.success("Sequence saved to library with ID:", result.sequenceId);

      // File the freshly-saved sequence into any collections chosen in the
      // picker. The sequence id only exists now, so this can't happen at pick
      // time. Lazy import keeps the firestore-heavy manager off panel init.
      if (selectedCollectionIds.length > 0) {
        try {
          const { addSequenceToCollection } =
            await import("$lib/shared/library/services/collection-manager");
          for (const collectionId of selectedCollectionIds) {
            await addSequenceToCollection(collectionId, result.sequenceId);
          }
        } catch (error) {
          logger.warn("Could not add sequence to selected collections:", error);
        }
      }

      const sessionId =
        ctx.sessionManager?.getSessionId() ?? ctx.autosaver?.getSessionId();
      try {
        await ctx.autosaver?.deleteLocalDraft(sessionId);
      } catch (draftError) {
        logger.warn("Could not remove the completed local draft:", draftError);
      }

      if (ctx.sessionManager) {
        void ctx.sessionManager
          .markAsSaved(result.sequenceId)
          .catch((sessionError) => {
            logger.warn(
              "Could not complete the cloud session lifecycle:",
              sessionError
            );
          });
      }

      props.onSaveComplete?.(result.sequenceId);

      // Confirm the save and offer a one-tap jump to where it now lives, so the
      // user can see it in context (its collection / the library grid) instead of
      // wondering whether it saved. Navigates to Browse > Library.
      showToast({
        message: "Saved to your library.",
        type: "success",
        duration: 6000,
        action: {
          label: "Go to library",
          // Route through the coordinator, not navigationState.setCurrentModule
          // directly: setCurrentModule only moves the nav-bar highlight, while
          // the rendered module comes from ui-state's activeModule (set by
          // switchModule). handleModuleChange syncs both (+ history + transition),
          // so the content actually swaps to Browse > Library instead of stalling.
          onClick: () => void handleModuleChange("browse", "library"),
        },
      });

      handleClose();

      // SP3 Part B: offer the keep-on-first-save nudge after the panel is
      // gone, not on top of it. Guarded on persisted (not just "no throw") —
      // the coordinator itself re-checks guest status + the once-per-uid
      // guard, but a non-persisted result means the sequence isn't actually
      // durable, so there's nothing to lose by converting to yet.
      if (result.persisted) {
        postSaveActivation.onGuestSaveSucceeded(result.sequenceId);
      }
    } catch (error) {
      // The save service already opened the account prompt for this limit.
      if (error instanceof LibraryError && error.code === "GUEST_CAP") return;
      logger.error("Failed to save sequence:", error);
      saveStep = 0;
      const message =
        error instanceof LibraryError && error.code === "ALREADY_EXISTS"
          ? "This exact sequence is already in your library."
          : error instanceof LibraryError && error.code === "PERSIST_FAILED"
            ? "Couldn't save this sequence - local storage write failed. Try again."
            : error instanceof Error
              ? `Couldn't save this sequence: ${error.message}`
              : "Couldn't save this sequence. Please try again.";
      showToast({ message, type: "error", duration: 6000 });
    } finally {
      isSaving = false;
      saveStep = 0;
    }
  }

  function handleClose() {
    isOpen = false;
    _propsGetter().onClose?.();
  }

  function handleOpenAppeal() {
    showAppealModal = true;
  }

  function handleCloseAppeal() {
    showAppealModal = false;
  }

  function handleAppealSubmitted() {
    showAppealModal = false;
  }

  function handleSubmitToShame() {
    showShameGate = true;
  }

  async function handleShameVerified() {
    showShameGate = false;

    if (!sequence || !tkaName || !currentUser) {
      shameSubmitError = "Missing required data for submission.";
      return;
    }

    if (!hallOfShameSubmitter) {
      shameSubmitError = "Hall of Shame service unavailable.";
      return;
    }

    isSubmittingToShame = true;
    shameSubmitError = null;

    try {
      const flaggedCategories =
        moderationResult?.flaggedTerms?.map((t) => t.category) || [];
      const category: ShameCategory = flaggedCategories.includes("sexual")
        ? "sexual"
        : flaggedCategories.includes("profanity")
          ? "profanity"
          : "creative";

      await hallOfShameSubmitter.submit({
        sourceSequenceId: sequence.id || `temp-${Date.now()}`,
        userId: currentUser.uid,
        word: tkaName,
        thumbnails: [...(sequence.thumbnails || [])],
        sequenceLength: sequence.steps?.length || 0,
        flaggedTerms: moderationResult?.flaggedTerms || [],
        category,
        displayName: sequence.displayName,
        difficulty: sequence.level,
      });

      logger.success("Submitted to Hall of Shame successfully");
      handleClose();
    } catch (error) {
      logger.error("Failed to submit to Hall of Shame:", error);
      shameSubmitError =
        error instanceof Error
          ? error.message
          : "Failed to submit. Please try again.";
    } finally {
      isSubmittingToShame = false;
    }
  }

  function handleShameCanceled() {
    showShameGate = false;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    get saveProps() {
      return saveProps;
    },
    set saveProps(value) {
      saveProps = value;
    },
    // Static data
    saveSteps,
    headerTitle,

    // Read props reactively (call from component to bind props)
    setPropsGetter(getter: () => SavePanelProps) {
      _propsGetter = getter;
    },

    // Mutable state (getters + setters where component needs write access)
    get isOpen() {
      return isOpen;
    },
    set isOpen(v: boolean) {
      isOpen = v;
    },

    get isSaving() {
      return isSaving;
    },

    get saveStep() {
      return saveStep;
    },

    get publishToCommunity() {
      return publishToCommunity;
    },
    set publishToCommunity(v: boolean) {
      publishToCommunity = v;
    },

    get notes() {
      return notes;
    },
    set notes(v: string) {
      notes = v;
    },
    get title() {
      return title;
    },
    set title(v: string) {
      title = v;
    },

    get showNotes() {
      return showNotes;
    },
    set showNotes(v: boolean) {
      showNotes = v;
    },

    get cardPresentation() {
      return cardPresentation;
    },
    set cardPresentation(v: CardPresentation) {
      cardPresentation = normalizeCardPresentation(v);
    },

    get selectedCollectionIds() {
      return selectedCollectionIds;
    },
    set selectedCollectionIds(v: string[]) {
      selectedCollectionIds = v;
    },

    get panelWidth() {
      return panelWidth;
    },
    set panelWidth(v: number) {
      panelWidth = v;
    },

    get moderationResult() {
      return moderationResult;
    },

    get showAppealModal() {
      return showAppealModal;
    },
    set showAppealModal(v: boolean) {
      showAppealModal = v;
    },

    get savedSequenceIdForAppeal() {
      return savedSequenceIdForAppeal;
    },

    get showShameGate() {
      return showShameGate;
    },

    get isSubmittingToShame() {
      return isSubmittingToShame;
    },

    get shameSubmitError() {
      return shameSubmitError;
    },

    get isExactDuplicate() {
      return isExactDuplicate;
    },

    // Derived values (read-only)
    get isBottomSheet() {
      return isBottomSheet;
    },
    get sequence() {
      return sequence;
    },
    get isMobileLayout() {
      return isMobileLayout;
    },
    get currentUser() {
      return currentUser;
    },
    get creatorName() {
      return creatorName;
    },
    get darkMode() {
      return darkMode;
    },
    get isFlagged() {
      return isFlagged;
    },
    get isSolo() {
      return isSolo;
    },
    get isMixed() {
      return isMixed;
    },
    get soloHand() {
      return soloHand;
    },
    get authoredHand() {
      return authoredHand;
    },
    get requiresAccount() {
      return requiresAccount;
    },
    get hasDuplicate() {
      return hasDuplicate;
    },
    get duplicateCount() {
      return duplicateCount;
    },
    get isAlreadyPublished() {
      return isAlreadyPublished;
    },
    get canPublishToCommunity() {
      return canPublishToCommunity;
    },
    get communityMinSteps() {
      return MIN_COMMUNITY_STEPS;
    },
    get canSave() {
      return canSave;
    },
    get tkaName() {
      return tkaName;
    },

    // Action handlers
    handleSave,
    handleClose,
    handleOpenAppeal,
    handleCloseAppeal,
    handleAppealSubmitted,
    handleSubmitToShame,
    handleShameVerified,
    handleShameCanceled,
  };
}

export type SavePanelState = ReturnType<typeof createSavePanelState>;
