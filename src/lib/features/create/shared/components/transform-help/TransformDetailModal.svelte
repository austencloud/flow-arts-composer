<!--
  TransformDetailModal.svelte

  Single-page modal for learning about a specific transform.
  Shows visual data mapping + interactive pictograph example.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SwapIcon from "#lib/shared/icons/SwapIcon.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { onMount } from "svelte";
  import {
    actionHelpContent,
    type ActionHelpId,
    type TransformId,
  } from "../../domain/transforms/transform-help-content";
  import { portal } from "#lib/features/create/generate/components/modals/portal.js";
  import {
    getRandomPictographForTransform,
    reclassifyLetter,
  } from "../../domain/transforms/pictograph-example-loader";
  import {
    applyMirror,
    applyFlip,
    applyInvert,
    applyRotate,
    applySwap,
    applyRewind,
  } from "../../domain/transforms/transform-functions";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import TransformVisualMapping from "./TransformVisualMapping.svelte";

  interface Props {
    transformId: ActionHelpId;
    onClose: () => void;
    presentation?: "modal" | "drawer";
  }

  let { transformId, onClose, presentation = "modal" }: Props = $props();

  // Lock body scroll when modal is open
  onMount(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  });

  const action = $derived(
    actionHelpContent.find((t) => t.id === transformId) ?? actionHelpContent[0]
  );

  // Check if this is a transform (with animated demo) or pattern/tool (no demo)
  const isTransform = $derived(action?.category === "transform");

  // Concise descriptions - shorter than fullDesc, but still educational
  const description = $derived.by(() => {
    const descriptions: Partial<Record<ActionHelpId, string>> = {
      mirror: t("create_action_detail_mirror"),
      flip: t("create_action_detail_flip"),
      invert: t("create_action_detail_invert"),
      rotate: t("create_action_detail_rotate"),
      swap: t("create_action_detail_swap"),
      rewind: t("create_action_detail_rewind"),
    };
    return descriptions[transformId] ?? action?.fullDesc ?? "";
  });

  // Pictograph state
  let displayedPictograph = $state<PictographData | null>(null);
  let isLoading = $state(true);

  $effect(() => {
    if (isTransform) {
      loadInitialExample();
    } else {
      isLoading = false;
    }
  });

  async function loadInitialExample() {
    isLoading = true;
    displayedPictograph = await getRandomPictographForTransform(
      transformId as TransformId
    );
    isLoading = false;
  }

  // Load new example without resetting - allows smooth transition
  async function loadNewExample() {
    const newPictograph = await getRandomPictographForTransform(
      transformId as TransformId
    );
    if (newPictograph) {
      displayedPictograph = newPictograph;
    }
  }

  async function applyTransform() {
    if (!displayedPictograph || !isTransform) return;

    let transformed: PictographData;
    switch (transformId) {
      case "mirror":
        transformed = applyMirror(displayedPictograph);
        break;
      case "flip":
        transformed = applyFlip(displayedPictograph);
        break;
      case "invert":
        transformed = applyInvert(displayedPictograph);
        break;
      case "rotate":
        transformed = applyRotate(displayedPictograph, "cw");
        break;
      case "swap":
        transformed = applySwap(displayedPictograph);
        break;
      case "rewind":
        transformed = applyRewind(displayedPictograph);
        break;
      default:
        return;
    }

    // Reclassify letter before assigning - transforms change motion types/locations,
    // which means the pictograph now corresponds to a different letter.
    // Single assignment avoids triggering two preparation cycles.
    transformed = await reclassifyLetter(transformed);
    displayedPictograph = transformed;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div
  class="modal-backdrop"
  class:drawer-presentation={presentation === "drawer"}
  use:portal
  onclick={handleBackdropClick}
  role="dialog"
  aria-modal="true"
  aria-label={t("create_action_help_for", { action: action?.name ?? t("create_action_help_action") })}
  tabindex="-1"
>
  <div class="modal-container">
    <!-- Header -->
    <div
      class="modal-header"
      style:--transform-color={action?.color ?? "#3b82f6"}
    >
      <div class="header-icon">
        {#if transformId === "swap"}
          <SwapIcon size="20px" />
        {:else}
          <i class="fas {action?.icon ?? 'fa-question'}" aria-hidden="true"></i>
        {/if}
      </div>
      <div class="header-text">
        <h2 class="header-title">{action?.name ?? t("create_action_help_action")}</h2>
        <p class="header-subtitle">{action?.shortDesc ?? ""}</p>
      </div>
      <button
        class="close-btn"
        onclick={onClose}
        aria-label={t("create_ui_close_help")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Content -->
    <div class="modal-content">
      <!-- Description -->
      <p class="description">{description}</p>

      <!-- Visual mapping (transforms only) -->
      {#if isTransform}
        <TransformVisualMapping transformId={transformId as TransformId} />
      {/if}

      <!-- Interactive example (transforms only) -->
      {#if isTransform}
        <div class="example-section">
          <div class="pictograph-frame" style:--transform-color={action?.color}>
            {#if isLoading}
              <div class="loading-state" role="status" aria-live="polite">
                <ProgressRing percent={-1} size={32} strokeWidth={3} />
                <span class="sr-only">{t("create_ui_loading_example")}</span>
              </div>
            {:else if displayedPictograph}
              <PictographContainer pictographData={displayedPictograph} />
            {:else}
              <div class="empty-state">
                <i class="fas fa-image" aria-hidden="true"></i>
              </div>
            {/if}
          </div>

          <div class="action-buttons">
            <button
              class="action-btn apply"
              onclick={applyTransform}
              disabled={isLoading}
              style:--transform-color={action?.color}
            >
              {#if transformId === "swap"}
                <SwapIcon size="14px" />
              {:else}
                <i class="fas {action?.icon}" aria-hidden="true"></i>
              {/if}
              <span>{t("create_ui_apply")}</span>
            </button>

            <button class="action-btn shuffle" onclick={loadNewExample}>
              <i class="fas fa-shuffle" aria-hidden="true"></i>
              <span>{t("create_ui_new")}</span>
            </button>
          </div>
        </div>
      {/if}

      <!-- Warning if applicable -->
      {#if action?.warning}
        <div class="warning-box">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <span>{action.warning}</span>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="done-btn" onclick={onClose}> {t("create_review_done")} </button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 20px;
  }

  .modal-container {
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.6);
  }

  /* Header */
  .modal-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px 20px;
    background: linear-gradient(
      180deg,
      rgba(var(--transform-color-rgb, 59, 130, 246), 0.15) 0%,
      transparent 100%
    );
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: var(--transform-color, #3b82f6);
    color: white;
    font-size: var(--font-size-lg, 18px);
    flex-shrink: 0;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .header-title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .header-subtitle {
    margin: 2px 0 0;
    font-size: var(--font-size-min, 14px);
    color: rgba(255, 255, 255, 0.85); /* AAA contrast: ~7.5:1 */
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 11px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: rgba(255, 255, 255, 0.85); /* AAA contrast */
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: white;
  }

  .close-btn:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.9);
    outline-offset: 2px;
  }

  /* Content */
  .modal-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    text-align: center;
  }

  .description {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.85); /* AAA contrast: ~7.5:1 */
    max-width: 340px;
  }

  /* Example section */
  .example-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .pictograph-frame {
    width: 180px;
    height: 180px;
    background: rgba(0, 0, 0, 0.3);
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .loading-state,
  .empty-state {
    font-size: var(--font-size-2xl, 24px);
    color: rgba(255, 255, 255, 0.75); /* AAA contrast for icons */
  }

  /* Screen reader only - visually hidden but accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .action-buttons {
    display: flex;
    gap: 10px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 18px;
    min-height: 44px; /* AAA touch target */
    border-radius: 9px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    border: none;
  }

  .action-btn.apply {
    background: var(--transform-color, #3b82f6);
    color: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  }

  .action-btn.apply:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .action-btn.apply:focus-visible {
    outline: 3px solid var(--transform-color, #3b82f6);
    outline-offset: 3px;
  }

  .action-btn.shuffle {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.85); /* AAA contrast */
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .action-btn.shuffle:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: white;
  }

  .action-btn.shuffle:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.9);
    outline-offset: 3px;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Warning */
  .warning-box {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.2);
    border-radius: 20px;
    font-size: var(--font-size-min, 14px); /* AAA minimum text size */
    color: #fcd34d; /* Lighter amber for AAA contrast */
  }

  .warning-box i {
    flex-shrink: 0;
    font-size: 14px;
  }

  /* Footer */
  .modal-footer {
    padding: 14px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    display: flex;
    justify-content: center;
  }

  .done-btn {
    padding: 10px 32px;
    min-height: 44px; /* AAA touch target */
    border-radius: 9px;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: white;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .done-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
  }

  .done-btn:focus-visible {
    outline: 3px solid rgba(255, 255, 255, 0.9);
    outline-offset: 3px;
  }

  /* Desktop: larger pictograph and spacing */
  @media (min-width: 600px) {
    .modal-container {
      max-width: 560px;
    }

    .pictograph-frame {
      width: 220px;
      height: 220px;
    }

    .modal-content {
      padding: 28px;
      gap: 24px;
    }

    .description {
      max-width: 400px;
    }
  }

  /* Large desktop: even bigger */
  @media (min-width: 900px) {
    .modal-container {
      max-width: 640px;
    }

    .pictograph-frame {
      width: 280px;
      height: 280px;
    }

    .modal-content {
      padding: 32px;
      gap: 28px;
    }

    .header-icon {
      width: 52px;
      height: 52px;
      font-size: var(--font-size-xl, 20px);
    }

    .header-title {
      font-size: 1.4rem;
    }

    .description {
      max-width: 440px;
      font-size: var(--font-size-base, 16px);
    }

    .action-btn {
      padding: 12px 24px;
      font-size: var(--font-size-base, 16px);
    }
  }

  /* Mobile: full screen */
  @media (max-width: 480px) {
    .modal-backdrop {
      padding: 0;
    }

    .modal-container {
      max-width: none;
      max-height: none;
      height: 100%;
      border-radius: 0;
    }

    .pictograph-frame {
      width: 160px;
      height: 160px;
    }

    .modal-backdrop.drawer-presentation {
      align-items: flex-end;
      background: transparent;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    .drawer-presentation .modal-container {
      height: min(max(377px, 50dvh), calc(100dvh - 180px));
      max-height: calc(100dvh - 180px);
      border-radius: 20px 20px 0 0;
      background: var(--panel-bg-solid, #080b11);
      box-shadow: 0 -18px 60px rgba(0, 0, 0, 0.62);
    }

    .drawer-presentation .modal-header {
      gap: 10px;
      padding: 8px 10px;
    }

    .drawer-presentation .modal-content {
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      padding: 14px 12px;
    }

    .drawer-presentation .modal-footer {
      padding: 6px 10px 8px;
    }

    .drawer-presentation .pictograph-frame {
      width: 120px;
      height: 120px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn,
    .close-btn,
    .done-btn {
      transition: none;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
    }
  }
</style>
