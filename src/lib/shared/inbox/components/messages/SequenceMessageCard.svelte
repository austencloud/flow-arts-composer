<script lang="ts">
  /**
   * SequenceMessageCard
   *
   * Renders a playable sequence preview within a message.
   * Opens the canonical full viewer through a separate action.
   * Shows deleted state if the sequence no longer exists.
   */

  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onMount } from "svelte";
  import type { MessageAttachment } from "$lib/shared/messaging/domain/models/message-models";
  import { inboxState } from "../../state/inbox-state.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import SequenceMessagePreview from "./SequenceMessagePreview.svelte";
  import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getShortCodeShareMessage } from "$lib/shared/qr/domain/short-code-error";
  import { getErrorHandler } from "$lib/shared/application/get-error-handler";
  import { decodeLegacySequenceAttachment } from "../../domain/message-attachment-builders";
  import { buildSequenceSharePayload } from "../../domain/build-sequence-share-payload";
  import type { SequenceSharePayload } from "../../domain/models/sequence-share-payload";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  interface Props {
    attachment: MessageAttachment;
    isOwn: boolean;
    playbackActive?: boolean;
    playbackMounted?: boolean;
    onRequestPlayback?: () => void;
    localSequence?: SequenceData;
  }

  let {
    attachment,
    isOwn,
    playbackActive = true,
    playbackMounted = playbackActive,
    onRequestPlayback,
    localSequence,
  }: Props = $props();

  // We don't pre-check if sequence exists - sequences can be in publicSequences OR user libraries
  // Instead we trust the attachment metadata and handle "not found" at navigation time
  let isDeleted = $state(false);
  let isChecking = $state(false);
  let resolvedPreview = $state<SequenceSharePayload | null>(null);

  const PREVIEW_RESOLVE_RETRY_DELAY_MS = 900;

  // Haptic feedback service
  let hapticService: HapticFeedback | undefined;

  // Extract sequence metadata
  const sequenceId = $derived(attachment.metadata?.sequenceId);
  const sequenceShortCode = $derived(attachment.metadata?.sequenceShortCode);
  const sequenceWord = $derived(
    simplifyRepeatedWord(
      resolvedPreview?.sequenceWord ||
        attachment.metadata?.sequenceWord ||
        attachment.metadata?.title ||
        "Sequence"
    )
  );
  // Only durable URLs become posters. Guessing storage filenames generated a
  // stream of 404s for valid links such as YR0L; the live player now resolves
  // the sequence independently and the poster falls back to a local word mark.
  const posterUrl = $derived(
    resolvedPreview?.sequenceThumbnail ||
      attachment.metadata?.sequenceThumbnail ||
      attachment.thumbnailUrl ||
      null
  );

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  async function loadPreviewSequence(): Promise<SequenceData | null> {
    if (localSequence) return localSequence;
    let payload = await resolvePreviewMetadata();
    if (!payload) {
      // Inbox messages can render before the authenticated Firestore stream is
      // ready. One delayed retry keeps a valid shared link from flashing a
      // permanent unavailable state during that startup window.
      await new Promise((resolve) =>
        setTimeout(resolve, PREVIEW_RESOLVE_RETRY_DELAY_MS)
      );
      payload = await resolvePreviewMetadata();
    }
    if (!payload) return null;
    resolvedPreview = payload;
    return payload.sequence;
  }

  async function resolvePreviewMetadata(): Promise<SequenceSharePayload | null> {
    try {
      const embeddedSequence = decodeLegacySequenceAttachment(attachment);
      if (embeddedSequence) return buildSequenceSharePayload(embeddedSequence);
    } catch (caught) {
      console.debug(
        "[SequenceMessageCard] Embedded preview could not be decoded:",
        caught
      );
    }

    const identifier = sequenceShortCode || sequenceId;
    if (!identifier) return null;

    let sequence: SequenceData | null = null;
    try {
      sequence = await getShortCodeManager().resolveShortCode(identifier);
    } catch (caught) {
      console.debug(
        "[SequenceMessageCard] Short-link preview lookup was unavailable:",
        caught
      );
    }

    if (!sequence && !sequenceShortCode) {
      try {
        const { loadByIdentifier } =
          await import("$lib/shared/sequence-viewer/services/sequence-data-provider");
        sequence = await loadByIdentifier(identifier);
      } catch (caught) {
        console.debug(
          "[SequenceMessageCard] Sequence preview lookup was unavailable:",
          caught
        );
      }
    }

    return sequence ? buildSequenceSharePayload(sequence) : null;
  }

  async function handleClick() {
    if (isDeleted || isChecking) return;

    hapticService?.trigger("selection");
    isChecking = true;

    try {
      const sequence =
        localSequence ??
        resolvedPreview?.sequence ??
        (await loadPreviewSequence());
      if (!sequence) {
        isDeleted = true;
        return;
      }

      const [{ hydrateSequence }, { openSequenceViewer }] = await Promise.all([
        import("$lib/shared/sequence-viewer/services/sequence-data-provider"),
        import("$lib/shared/sequence-viewer/services/sequence-viewer-navigator"),
      ]);
      const viewerSequence = await hydrateSequence(sequence);

      inboxState.close();
      openSequenceViewer(viewerSequence, {
        source: "inbox_message",
        returnPath: window.location.pathname,
        returnLabel: "Messages",
        viewStateParams: attachment.metadata?.sequenceViewParams,
      });
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      console.error("[SequenceMessageCard] Failed to open sequence:", failure);
      getErrorHandler().showUserError({
        message:
          getShortCodeShareMessage(caught) ??
          "This sequence could not be opened.",
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "inbox",
          tab: "messages",
          action: "openSequenceAttachment",
        },
      });
    } finally {
      isChecking = false;
    }
  }
</script>

<div class="sequence-card" class:own={isOwn} class:deleted={isDeleted}>
  {#if isDeleted}
    <!-- Deleted state -->
    <div class="card-header">
      <div class="deleted-badge">
        <i class="fas fa-trash-alt" aria-hidden="true"></i>
        <span>Unavailable</span>
      </div>
    </div>
    <h4 class="sequence-title deleted-title">{sequenceWord}</h4>
    <p class="deleted-notice">This sequence is no longer available</p>
  {:else}
    <div class="card-content">
      <SequenceMessagePreview
        word={sequenceWord}
        {posterUrl}
        loadSequence={loadPreviewSequence}
        {playbackActive}
        {playbackMounted}
        {onRequestPlayback}
      />

      <div class="card-footer">
        <button
          type="button"
          class="open-sequence"
          onclick={handleClick}
          disabled={isChecking}
        >
          {#if isChecking}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            <span>Opening</span>
          {:else}
            <i class="fas fa-external-link-alt" aria-hidden="true"></i>
            <span>Open in Sequence Viewer</span>
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .sequence-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 12px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    text-align: left;
    width: 100%;
    min-width: 0;
    max-width: none;
    box-sizing: border-box;
  }

  .sequence-card.own {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* Deleted state */
  .sequence-card.deleted {
    opacity: 0.6;
    border-style: dashed;
  }

  .deleted-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    color: var(--semantic-error);
  }

  .deleted-badge i {
    font-size: var(--font-size-compact);
  }

  .deleted-title {
    text-decoration: line-through;
    opacity: 0.7;
  }

  .deleted-notice {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    font-style: italic;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sequence-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    line-height: 1.3;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .own .sequence-title {
    color: white;
  }

  .card-footer {
    display: flex;
    justify-content: center;
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke);
  }

  .open-sequence {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: var(--touch-target-min, 44px);
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 999px;
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease;
  }

  .open-sequence i {
    font-size: var(--font-size-compact);
  }

  .open-sequence:hover:not(:disabled) {
    border-color: var(--theme-accent, var(--semantic-info));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.14));
  }

  .open-sequence:focus-visible {
    outline: 2px solid var(--theme-accent, var(--semantic-info));
    outline-offset: 2px;
  }

  .open-sequence:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  @media (prefers-reduced-motion: reduce) {
    .open-sequence {
      transition: none;
    }
  }
</style>
