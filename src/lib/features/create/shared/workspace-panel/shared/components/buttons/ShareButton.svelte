<!--
  ShareButton.svelte

  Orchestrates card and link readiness for the Create workspace. Native share
  and clipboard calls stay inside fresh activation handlers; the presentational
  control lives in WorkspaceShareControl.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getSharer } from "$lib/shared/share/get-sharer";
  import { DEFAULT_SHARE_OPTIONS } from "$lib/shared/share/domain/models/share-options";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
  import {
    canNativeShareFile,
    downloadBlobToDisk,
    shareBlobNatively,
    supportsNativeFileShare,
    type NativeFileShareResult,
  } from "$lib/shared/foundation/services/file-downloader";
  import { hashString } from "$lib/shared/foundation/services/content-hasher";
  import { shareTarget } from "$lib/shared/mobile/share-action.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getShortCodeShareMessage } from "$lib/shared/qr/domain/short-code-error";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { logShareAction } from "$lib/shared/analytics/services/posthog-activity-logger";
  import { captureEvent } from "$lib/shared/analytics/services/posthog";
  import {
    buildSequenceSharePayload,
    openSendSequenceSheet,
  } from "$lib/shared/inbox/state/send-sequence-state.svelte";
  import {
    createWorkspaceShareReadiness,
    shouldPrewarmWorkspaceShareCard,
    type PreparedWorkspaceCard,
  } from "../../state/workspace-share-readiness.svelte";
  import WorkspaceShareControl from "./WorkspaceShareControl.svelte";
  import PostShareSheet from "$lib/shared/share/components/PostShareSheet.svelte";

  interface Props {
    sequence?: SequenceData | null;
    disabled?: boolean;
    useMobileSheet?: boolean;
  }

  let {
    sequence = null,
    disabled = false,
    useMobileSheet = false,
  }: Props = $props();

  const hapticService = getHapticFeedback();
  const imageComposition = getImageCompositionManager();
  const visibilityState = getVisibilityStateManager();
  const sharer = getSharer();
  const shortCodeManager = getShortCodeManager();
  const readiness = createWorkspaceShareReadiness({
    async renderCard(currentSequence, options) {
      const blob = await sharer.getCardImageBlob(currentSequence, options);
      const filename = sharer.generateFilename(currentSequence, {
        ...DEFAULT_SHARE_OPTIONS,
        format: "PNG",
      });
      return { blob, filename };
    },
    async createLink(currentSequence) {
      const result = await shortCodeManager.createShortCode(currentSequence, {
        embedSequenceData: true,
      });
      return result.url;
    },
  });

  let menuOpen = $state(false);
  let isSharing = $state(false);
  let isCopyingLink = $state(false);
  let linkCopied = $state(false);
  let renderSettingsVersion = $state(0);
  let pageVisible = $state(false);
  let announcedCardRequest = $state<string | null>(null);
  let announcedLinkKey = $state<string | null>(null);
  let sendRequestGeneration = 0;
  let linkFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  const hasContent = $derived((sequence?.steps?.length ?? 0) > 0);
  const hasFullAccount = $derived(authState.isFullAccount);
  const controlDisabled = $derived(disabled || !hasContent);
  const cardKey = $derived.by(() => {
    if (!sequence || !hasContent || !hasFullAccount) return "";
    return hashString(
      `${JSON.stringify(sequence)}\n${JSON.stringify({
        darkMode: imageComposition.darkMode,
        renderSettingsVersion,
      })}`
    );
  });
  const linkKey = $derived.by(() => {
    if (!sequence || !hasContent || !hasFullAccount) return "";
    return hashString(JSON.stringify(sequence));
  });
  const preparedCard = $derived(
    cardKey ? readiness.getPreparedCard(cardKey) : null
  );
  const preparedLink = $derived(
    linkKey ? readiness.getPreparedLink(linkKey) : null
  );
  const cardPhase = $derived(
    cardKey ? readiness.getCardPhase(cardKey) : "idle"
  );
  const linkPhase = $derived(
    linkKey ? readiness.getLinkPhase(linkKey) : "idle"
  );
  const canShareCard = $derived(
    preparedCard
      ? canNativeShareFile(preparedCard.blob, preparedCard.filename)
      : false
  );
  const shouldPrewarmCard = $derived(
    shouldPrewarmWorkspaceShareCard({
      isMobileTarget: shareTarget.isMobile,
      nativeFileShareSupported: supportsNativeFileShare(),
    })
  );
  const awaitingFreshGesture = $derived(
    announcedCardRequest?.startsWith(`${cardKey}:`) ?? false
  );
  const tooltip = $derived(
    hasContent ? "Share sequence" : "Create a sequence first"
  );
  const sequenceName = $derived(
    sequence?.displayName ||
      sequence?.intendedWord ||
      sequence?.word ||
      sequence?.name ||
      "Sequence"
  );
  const activityMetadata = $derived({
    module: "create",
    panel: "workspace",
    sequenceId: sequence?.id,
    sequenceWord:
      sequence?.word || sequence?.intendedWord || sequence?.displayName,
    sequenceLength: sequence?.steps?.length,
  });

  function noteRenderSettingsChanged(): void {
    renderSettingsVersion += 1;
  }

  onMount(() => {
    const noteVisibility = () => {
      pageVisible = document.visibilityState === "visible";
    };

    noteVisibility();
    document.addEventListener("visibilitychange", noteVisibility);
    imageComposition.registerObserver(noteRenderSettingsChanged);
    visibilityState.registerObserver(noteRenderSettingsChanged);

    return () => {
      document.removeEventListener("visibilitychange", noteVisibility);
      imageComposition.unregisterObserver(noteRenderSettingsChanged);
      visibilityState.unregisterObserver(noteRenderSettingsChanged);
    };
  });

  onDestroy(() => {
    sendRequestGeneration++;
    if (linkFeedbackTimer) clearTimeout(linkFeedbackTimer);
  });

  $effect(() => {
    const nextCardKey = cardKey || null;
    const nextLinkKey = linkKey || null;

    untrack(() => {
      readiness.setCardKey(nextCardKey);
      readiness.setLinkKey(nextLinkKey);
      if (
        !nextCardKey ||
        !announcedCardRequest?.startsWith(`${nextCardKey}:`)
      ) {
        announcedCardRequest = null;
      }
      if (!nextLinkKey || announcedLinkKey !== nextLinkKey) {
        announcedLinkKey = null;
        linkCopied = false;
      }
    });
  });

  // A signed-in mobile user is likely to choose Share Card. Preparing it in
  // the background keeps the later system share handoff inside a fresh tap.
  $effect(() => {
    const currentSequence = sequence;
    const currentKey = cardKey;
    const options = {
      darkMode: imageComposition.darkMode,
    };
    const shouldPrewarm =
      hasFullAccount &&
      shouldPrewarmCard &&
      pageVisible &&
      !!currentSequence &&
      !!currentKey;

    if (!shouldPrewarm || !currentSequence) return;

    const timer = window.setTimeout(() => {
      untrack(() => {
        void readiness
          .prepareCard(currentKey, currentSequence, options)
          .catch(() => {
            // Background preparation is opportunistic. The user's next tap
            // retries and reports a blocking failure.
          });
      });
    }, 1600);

    return () => window.clearTimeout(timer);
  });

  // Opening either presentation prepares its signed-in actions. Guests never
  // render the action list, so no card or link work starts for them.
  $effect(() => {
    const currentSequence = sequence;
    const currentCardKey = cardKey;
    const currentLinkKey = linkKey;
    const options = {
      darkMode: imageComposition.darkMode,
    };
    const fullAccount = authState.isFullAccount;

    if (!fullAccount || !menuOpen || !currentSequence || !currentCardKey) {
      return;
    }

    untrack(() => {
      void readiness
        .prepareCard(currentCardKey, currentSequence, options)
        .catch((error) => {
          console.error("[ShareButton] Card preparation failed:", error);
        });

      if (currentLinkKey) {
        void readiness
          .prepareLink(currentLinkKey, currentSequence)
          .catch((error) => {
            console.error("[ShareButton] Link preparation failed:", error);
          });
      }
    });
  });

  function requireFullAccount(): boolean {
    if (authState.isFullAccount) return true;
    menuOpen = false;
    authDrawerState.show("signup", "share-sequence");
    return false;
  }

  function prepareCurrentCard(): Promise<PreparedWorkspaceCard> {
    if (!authState.isFullAccount || !sequence || !cardKey) {
      return Promise.reject(new Error("No sequence is available to share"));
    }
    return readiness.prepareCard(cardKey, sequence, {
      darkMode: imageComposition.darkMode,
    });
  }

  function prepareCurrentLink(): Promise<{ url: string }> {
    if (!authState.isFullAccount || !sequence || !linkKey) {
      return Promise.reject(
        new Error("Create an account before creating a link")
      );
    }
    return readiness.prepareLink(linkKey, sequence);
  }

  function requestCardForFreshGesture(action: "Share" | "Download"): void {
    if (!requireFullAccount() || !cardKey || controlDisabled) return;

    const requestedKey = cardKey;
    const requestId = `${requestedKey}:${action}`;
    if (announcedCardRequest === requestId) return;
    announcedCardRequest = requestId;

    showToast({
      message: "Preparing card.",
      type: "info",
      duration: 2500,
    });

    void prepareCurrentCard()
      .then((card) => {
        if (announcedCardRequest !== requestId || cardKey !== requestedKey) {
          return;
        }
        const needsOptions =
          action === "Share" && !canNativeShareFile(card.blob, card.filename);
        showToast({
          message: "Card ready.",
          type: "success",
          duration: 7000,
          action: {
            label: needsOptions ? "Options" : action,
            onClick: needsOptions
              ? openShareOptions
              : action === "Share"
                ? handleShareSelect
                : handleDownloadSelect,
          },
        });
      })
      .catch((error) => {
        if (announcedCardRequest === requestId) {
          announcedCardRequest = null;
        }
        console.error("[ShareButton] Card preparation failed:", error);
        showToast({
          message: "Couldn't prepare this card. Try again.",
          type: "error",
          duration: 6000,
        });
      });
  }

  function showDownloadFallback(
    card: PreparedWorkspaceCard,
    result: Extract<NativeFileShareResult, { status: "unavailable" | "failed" }>
  ): void {
    if (result.status === "failed") {
      console.error("[ShareButton] Native share failed:", result.error);
    }

    captureEvent("workspace_native_file_share_failed", {
      ...activityMetadata,
      failure_type: result.status,
      error_name: result.error?.name,
    });

    showToast({
      message:
        result.status === "unavailable"
          ? "Sharing isn't available here."
          : "Couldn't open device share options.",
      type: result.status === "unavailable" ? "info" : "error",
      duration: 7000,
      action: {
        label: "Download",
        onClick: () => void downloadPreparedCard(card),
      },
    });
  }

  function sharePreparedCard(card: PreparedWorkspaceCard): void {
    if (!requireFullAccount() || isSharing) return;

    announcedCardRequest = null;
    isSharing = true;

    // This must be created in the click handler, before any await.
    const shareOperation = shareBlobNatively(card.blob, card.filename, {
      title: sequenceName,
      text: `Flow Arts Composer sequence: ${sequenceName}`,
    });

    void shareOperation
      .then((result) => {
        if (result.status === "shared") {
          void logShareAction("sequence_share", {
            ...activityMetadata,
            shareMethod: "workspace_native_file_share_handoff",
            shareOutcome: "os_handoff",
            exportFormat: "png",
          });
          return;
        }

        if (result.status === "canceled") {
          return;
        }

        if (result.status === "failed" || result.status === "unavailable") {
          showDownloadFallback(card, result);
        }
      })
      .catch((error) => {
        showDownloadFallback(card, {
          status: "failed",
          filename: card.filename,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      })
      .finally(() => {
        isSharing = false;
      });
  }

  async function downloadPreparedCard(
    card: PreparedWorkspaceCard
  ): Promise<void> {
    if (!requireFullAccount()) return;
    announcedCardRequest = null;
    const result = await downloadBlobToDisk(card.blob, card.filename);
    if (!result.success) {
      console.error("[ShareButton] Card download failed:", result.error);
      showToast({
        message: "Couldn't download this card. Try again.",
        type: "error",
        duration: 6000,
      });
      return;
    }

    void logShareAction("sequence_export", {
      ...activityMetadata,
      shareMethod: "workspace_download",
      exportFormat: "png",
    });
  }

  function handleShareSelect(): void {
    if (!requireFullAccount() || controlDisabled || isSharing) return;
    hapticService?.trigger("selection");

    if (!preparedCard) {
      requestCardForFreshGesture("Share");
      return;
    }
    sharePreparedCard(preparedCard);
  }

  function openSendSequenceWithPreview(
    currentSequence: SequenceData,
    card: PreparedWorkspaceCard
  ): void {
    openSendSequenceSheet({
      ...buildSequenceSharePayload(currentSequence),
      sequencePreviewBlob: card.blob,
    });
  }

  function handleSendSequence(): void {
    if (!requireFullAccount() || controlDisabled || !sequence || !cardKey) {
      return;
    }

    hapticService?.trigger("selection");
    const currentSequence = sequence;
    const currentCardKey = cardKey;
    const requestGeneration = ++sendRequestGeneration;

    if (preparedCard) {
      openSendSequenceWithPreview(currentSequence, preparedCard);
      return;
    }

    showToast({
      message: "Preparing card.",
      type: "info",
      duration: 2500,
    });

    void readiness
      .prepareCard(currentCardKey, currentSequence, {
        darkMode: imageComposition.darkMode,
      })
      .then((card) => {
        if (
          requestGeneration !== sendRequestGeneration ||
          !authState.isFullAccount ||
          cardKey !== currentCardKey
        ) {
          return;
        }
        openSendSequenceWithPreview(currentSequence, card);
      })
      .catch((error) => {
        if (requestGeneration !== sendRequestGeneration) return;
        console.error("[ShareButton] Card preparation failed:", error);
        showToast({
          message: "Couldn't prepare this card. Try again.",
          type: "error",
          duration: 6000,
        });
      });
  }

  function handleDownloadSelect(): void {
    if (!requireFullAccount() || controlDisabled) return;
    hapticService?.trigger("selection");

    if (!preparedCard) {
      requestCardForFreshGesture("Download");
      return;
    }
    void downloadPreparedCard(preparedCard);
  }

  function reportLinkPreparationFailure(error: unknown): void {
    console.error("[ShareButton] Link preparation failed:", error);
    const domainMessage = getShortCodeShareMessage(error);
    showToast({
      message:
        domainMessage ||
        (navigator.onLine
          ? "Couldn't create a shareable link. Try again."
          : "Couldn't create a link while offline."),
      type: "error",
      duration: 6000,
    });
  }

  function requestLinkForFreshGesture(): void {
    if (!requireFullAccount() || !linkKey || announcedLinkKey === linkKey) {
      return;
    }
    announcedLinkKey = linkKey;

    showToast({
      message: "Preparing link.",
      type: "info",
      duration: 2500,
    });

    void prepareCurrentLink()
      .then(() => {
        if (announcedLinkKey !== linkKey) return;
        showToast({
          message: "Link ready.",
          type: "success",
          duration: 7000,
          action: {
            label: "Copy",
            onClick: handleCopyLink,
          },
        });
      })
      .catch((error) => {
        announcedLinkKey = null;
        reportLinkPreparationFailure(error);
      });
  }

  function handleCopyLink(): void {
    if (!requireFullAccount()) return;
    if (isCopyingLink) return;

    hapticService?.trigger("selection");
    if (!preparedLink) {
      requestLinkForFreshGesture();
      return;
    }

    isCopyingLink = true;
    let copyOperation: Promise<void>;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }

      // Keep this call in the click handler with no preceding await. WebKit
      // requires the current transient activation for clipboard writes.
      copyOperation = navigator.clipboard.writeText(preparedLink.url);
    } catch (error) {
      isCopyingLink = false;
      console.error("[ShareButton] Link copy failed:", error);
      showToast({
        message: "Couldn't copy the link. Try again.",
        type: "error",
        duration: 6000,
      });
      return;
    }

    void copyOperation
      .then(() => {
        announcedLinkKey = null;
        linkCopied = true;
        if (linkFeedbackTimer) clearTimeout(linkFeedbackTimer);
        linkFeedbackTimer = setTimeout(() => {
          linkCopied = false;
          linkFeedbackTimer = null;
        }, 2000);

        void logShareAction("link_copy", {
          ...activityMetadata,
          shareMethod: "workspace_copy_link",
        });
      })
      .catch((error) => {
        console.error("[ShareButton] Link copy failed:", error);
        showToast({
          message: "Couldn't copy the link. Try again.",
          type: "error",
          duration: 6000,
        });
      })
      .finally(() => {
        isCopyingLink = false;
      });
  }

  function openShareOptions(): void {
    if (!requireFullAccount()) return;
    announcedCardRequest = null;
    menuOpen = true;
  }

  /**
   * The workspace share button now lands on the same sheet the viewer's does.
   * It used to open a menu of Send Sequence / Share Card / Copy Link / Download
   * Card — four entries that all exist inside the sheet, reached by a different
   * route, with no Instagram or Facebook anywhere. Austen (2026-08-11): "every
   * time you click share it brings you to the page like this."
   */
  let postSheetOpen = $state(false);

  function openPostSheet(): void {
    if (!sequence) return;
    postSheetOpen = true;
  }

  function sendSequenceToInbox(): void {
    if (!sequence) return;
    openSendSequenceSheet(buildSequenceSharePayload(sequence));
  }
</script>

<WorkspaceShareControl
  bind:open={menuOpen}
  {useMobileSheet}
  disabled={controlDisabled}
  {tooltip}
  {cardPhase}
  {linkPhase}
  {isSharing}
  {isCopyingLink}
  {linkCopied}
  {awaitingFreshGesture}
  {canShareCard}
  onTriggerClick={() => hapticService?.trigger("selection")}
  onShareCard={handleShareSelect}
  onSendSequence={handleSendSequence}
  onCopyLink={handleCopyLink}
  onDownloadCard={handleDownloadSelect}
  onDirectOpen={openPostSheet}
/>

<!-- No `shareUrl`: the workspace sequence has no canonical viewer URL yet, and
     the sheet mints (or re-resolves) the short code itself. -->
<PostShareSheet
  isOpen={postSheetOpen}
  {sequence}
  shareUrl=""
  videoBlobUrl={null}
  isExportingVideo={false}
  exportProgress={null}
  availableArtifacts={["card"]}
  canCreateLink={hasFullAccount}
  onSendInTka={hasFullAccount ? sendSequenceToInbox : undefined}
  onClose={() => (postSheetOpen = false)}
/>
