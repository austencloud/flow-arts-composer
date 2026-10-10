<!--
	CompositionDetail.svelte

	Expand-in-place detail view with FLIP animation.
	Shows large preview, metadata, sequence list, and action bar.
	Supports View Transitions API with manual FLIP fallback.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  import {
    resolveThumbnail,
    generatePlaceholderSvg,
  } from "#lib/features/compose/tabs/browse/services/composition-thumbnail-resolver.js";
  import { onMount, onDestroy } from "svelte";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";
  import { COMPOSE_MODE_CONFIG } from "#lib/features/compose/shared/domain/compose-mode-config.js";
  import CompositionDetailActions from "./CompositionDetailActions.svelte";

  const {
    composition,
    originRect,
    onClose,
    onPlay,
    onEdit,
    onFavorite,
    onDuplicate,
    onDelete,
  }: {
    composition: CompositionBrowseItem;
    originRect: DOMRect | null;
    onClose: () => void;
    onPlay: () => void;
    onEdit: () => void;
    onFavorite: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  } = $props();

  let detailEl: HTMLDivElement | undefined = $state();
  let isAnimatingIn = $state(true);
  let isClosing = $state(false);

  const modeConfig = $derived(COMPOSE_MODE_CONFIG[composition.mode]);
  const thumbnailUrl = $derived(resolveThumbnail(composition));
  const placeholderSvg = $derived(
    generatePlaceholderSvg(composition.mode, modeConfig.accent)
  );

  const layoutLabel = $derived(
    `${composition.layout.cols}x${composition.layout.rows}`
  );
  const lastEdited = $derived(
    composition.updatedAt.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  );

  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  // FLIP animation on mount
  onMount(() => {
    if (prefersReducedMotion || !originRect || !detailEl) {
      isAnimatingIn = false;
      return;
    }

    // Calculate inverse transform from final position to origin
    const finalRect = detailEl.getBoundingClientRect();
    const scaleX = originRect.width / finalRect.width;
    const scaleY = originRect.height / finalRect.height;
    const translateX =
      originRect.left -
      finalRect.left +
      (originRect.width - finalRect.width) / 2;
    const translateY =
      originRect.top -
      finalRect.top +
      (originRect.height - finalRect.height) / 2;

    // Apply inverse transform (start from card position)
    detailEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
    detailEl.style.opacity = "0.5";
    detailEl.style.borderRadius = "10px";

    // Force layout
    detailEl.offsetHeight;

    // Animate to final position
    detailEl.style.transition =
      "transform 350ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease, border-radius 350ms ease";
    detailEl.style.transform = "translate(0, 0) scale(1)";
    detailEl.style.opacity = "1";
    detailEl.style.borderRadius = "16px";

    const handleTransitionEnd = () => {
      isAnimatingIn = false;
      detailEl?.removeEventListener("transitionend", handleTransitionEnd);
      if (detailEl) {
        detailEl.style.transition = "";
        detailEl.style.transform = "";
      }
    };

    detailEl.addEventListener("transitionend", handleTransitionEnd, {
      once: true,
    });

    // Fallback: clear animation state after timeout
    setTimeout(() => {
      isAnimatingIn = false;
    }, 400);
  });

  function handleClose() {
    if (isClosing) return;
    isClosing = true;

    if (prefersReducedMotion || !originRect || !detailEl) {
      onClose();
      return;
    }

    // Reverse FLIP
    const finalRect = detailEl.getBoundingClientRect();
    const scaleX = originRect.width / finalRect.width;
    const scaleY = originRect.height / finalRect.height;
    const translateX =
      originRect.left -
      finalRect.left +
      (originRect.width - finalRect.width) / 2;
    const translateY =
      originRect.top -
      finalRect.top +
      (originRect.height - finalRect.height) / 2;

    detailEl.style.transition =
      "transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 200ms ease 100ms, border-radius 300ms ease";
    detailEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
    detailEl.style.opacity = "0";
    detailEl.style.borderRadius = "10px";

    setTimeout(onClose, 320);
  }

  // Keyboard close
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
</script>

<!-- Backdrop -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="detail-backdrop"
  class:visible={!isAnimatingIn}
  onclick={handleClose}
  onkeydown={handleKeydown}
></div>

<!-- Detail panel -->
<div
  bind:this={detailEl}
  class="detail-panel"
  role="dialog"
  aria-modal="true"
  aria-label="Composition details: {composition.name}"
  style="view-transition-name: composition-{composition.id}"
>
  <!-- Close button -->
  <button
    type="button"
    class="close-btn"
    onclick={handleClose}
    aria-label={t("browse_ui_close_details")}
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>

  <!-- Preview area -->
  <div class="preview-area">
    {#if thumbnailUrl}
      <img src={thumbnailUrl} alt={composition.name} class="preview-image" />
    {:else if placeholderSvg}
      <div
        class="preview-placeholder"
        style="background: {modeConfig.gradient}"
      >
        <img
          src={placeholderSvg}
          alt=""
          class="preview-svg"
          aria-hidden="true"
        />
      </div>
    {:else}
      <div
        class="preview-placeholder"
        style="background: {modeConfig.gradient}"
      >
        <i
          class="fas {modeConfig.icon} preview-icon"
          style="color: {modeConfig.accent}"
          aria-hidden="true"
        ></i>
      </div>
    {/if}
  </div>

  <!-- Content -->
  <div class="detail-content">
    <h2 class="composition-name">{composition.name || "Untitled"}</h2>

    <!-- Mode pill -->
    <span
      class="mode-pill"
      style="color: {modeConfig.accent}; border-color: {modeConfig.accent}"
    >
      <i class="fas {modeConfig.icon}" aria-hidden="true"></i>
      {modeConfig.label}
    </span>

    <!-- Metadata -->
    <div class="metadata">
      <div class="meta-item">
        <span class="meta-label">Creator</span>
        <span class="meta-value">{composition.creator}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">{t("browse_ui_last_edited")}</span>
        <span class="meta-value">{lastEdited}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Layout</span>
        <span class="meta-value">{layoutLabel} grid</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">{t("tab_browse_sequences")}</span>
        <span class="meta-value">{composition.sequenceCount}</span>
      </div>
    </div>
  </div>

  <!-- Action bar -->
  <CompositionDetailActions
    {composition}
    {onPlay}
    {onEdit}
    {onFavorite}
    {onDuplicate}
    {onDelete}
  />
</div>

<style>
  .detail-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 90;
    opacity: 0;
    transition: opacity var(--duration-normal, 200ms) ease;
  }

  .detail-backdrop.visible {
    opacity: 1;
  }

  .detail-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    z-index: 91;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
    transform-origin: center center;
  }

  /* Close button */
  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    color: var(--theme-text, #fff);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    padding: 0;
  }

  .close-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Preview */
  .preview-area {
    width: 100%;
    aspect-ratio: 16 / 10;
    overflow: hidden;
    flex-shrink: 0;
  }

  .preview-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-svg {
    width: 40%;
    max-width: 120px;
    opacity: 0.7;
  }

  .preview-icon {
    font-size: 56px;
    opacity: 0.4;
  }

  /* Content */
  .detail-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .composition-name {
    font-size: var(--font-size-xl, 20px);
    font-weight: 700;
    margin: 0;
    color: var(--theme-text, #fff);
    word-break: break-word;
  }

  .mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    border: 1px solid;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    width: fit-content;
  }

  .mode-pill i {
    font-size: 11px;
  }

  /* Metadata */
  .metadata {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .meta-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-transform: uppercase;
    letter-spacing: 0.03em;
    font-weight: 500;
  }

  .meta-value {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #fff);
  }

  @media (prefers-reduced-motion: reduce) {
    .detail-backdrop {
      transition: none;
    }
  }
</style>
