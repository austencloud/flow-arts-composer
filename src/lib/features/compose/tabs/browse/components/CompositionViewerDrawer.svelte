<!--
	CompositionViewerDrawer.svelte

	Full-screen bottom drawer for viewing composition details.
	Modeled on SequenceViewerDrawerHost for a familiar experience.
	Shows animated composition preview, metadata, and action buttons.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  import { resolveThumbnail } from "#lib/features/compose/tabs/browse/services/composition-thumbnail-resolver.js";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import type { CompositionBrowseItem } from "../state/composition-browse-state.svelte";
  import { COMPOSE_MODE_CONFIG } from "#lib/features/compose/shared/domain/compose-mode-config.js";
  import CompositionAnimatedPreview from "./CompositionAnimatedPreview.svelte";
  import CompositionMiniPreview from "./CompositionMiniPreview.svelte";
  import { simplifyAndTruncate } from "#lib/shared/foundation/utils/word-simplifier.js";

  let {
    composition,
    isOpen = $bindable(false),
    onClose,
    onPlay,
    onEdit,
    onFavorite,
    onDuplicate,
    onDelete,
  }: {
    composition: CompositionBrowseItem | null;
    isOpen?: boolean;
    onClose: () => void;
    onPlay: () => void;
    onEdit: () => void;
    onFavorite: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  } = $props();

  const modeConfig = $derived(
    composition ? COMPOSE_MODE_CONFIG[composition.mode] : null
  );

  const thumbnailUrl = $derived(
    composition ? resolveThumbnail(composition) : null
  );

  const hasRenderableCells = $derived(
    composition
      ? composition.cells.length > 0 && composition.sequenceCount > 0
      : false
  );

  const layoutLabel = $derived(
    composition ? `${composition.layout.cols}x${composition.layout.rows}` : ""
  );

  const lastEdited = $derived(
    composition
      ? composition.updatedAt.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : ""
  );

  function capitalizeWords(str: string): string {
    return str
      .split(" ")
      .map((word) =>
        word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ""
      )
      .join(" ");
  }

  const capitalizedCreator = $derived(
    composition ? capitalizeWords(composition.creator) : ""
  );

  const displayName = $derived.by(() => {
    if (!composition) return "";
    const name = composition.name || "Untitled";
    if (composition.sequenceCount === 1) {
      return simplifyAndTruncate(name);
    }
    return name;
  });

  function handleDrawerClose() {
    onClose();
  }
</script>

<Drawer
  bind:isOpen
  placement="bottom"
  snapPoints={["100%"]}
  onclose={handleDrawerClose}
  showHandle={false}
  ariaLabel="Composition Viewer"
  class="composition-viewer-drawer"
>
  {#if composition && modeConfig}
    <div class="drawer-container">
      <!-- Header -->
      <header class="viewer-header">
        <button
          type="button"
          class="back-button"
          onclick={handleDrawerClose}
          aria-label={t("browse_ui_back_to_compositions")}
        >
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
          <span class="back-label">{t("tab_library_compositions")}</span>
        </button>

        <div class="header-title">{t("browse_ui_composition_viewer")}</div>

        <!-- Spacer to balance header layout -->
        <div class="header-spacer"></div>
      </header>

      <!-- Preview: fills all available space between header and info/footer -->
      <div class="preview-section">
        {#if hasRenderableCells}
          <CompositionAnimatedPreview
            cells={composition.cells}
            layout={composition.layout}
          />
        {:else if thumbnailUrl}
          <img
            src={thumbnailUrl}
            alt={composition.name}
            class="preview-image"
          />
        {:else}
          <CompositionMiniPreview
            cells={composition.cells}
            layout={composition.layout}
          />
        {/if}
      </div>

      <!-- Compact info bar -->
      <div class="info-bar">
        <div class="info-left">
          <h2 class="composition-name">{displayName}</h2>
          <span
            class="mode-pill"
            style="color: {modeConfig.accent}; border-color: {modeConfig.accent}"
          >
            <i class="fas {modeConfig.icon}" aria-hidden="true"></i>
            {modeConfig.label}
          </span>
        </div>
        <div class="info-meta">
          <span class="meta-chip">{capitalizedCreator}</span>
          <span class="meta-sep" aria-hidden="true"></span>
          <span class="meta-chip">{layoutLabel}</span>
          <span class="meta-sep" aria-hidden="true"></span>
          <span class="meta-chip"
            >{composition.sequenceCount} seq{composition.sequenceCount !== 1
              ? "s"
              : ""}</span
          >
          <span class="meta-sep" aria-hidden="true"></span>
          <span class="meta-chip">{lastEdited}</span>
        </div>
      </div>

      <!-- Footer: Action buttons -->
      <footer class="viewer-footer">
        <div class="actions-row">
          <button type="button" class="action-btn play" onclick={onPlay}>
            <i class="fas fa-play" aria-hidden="true"></i>
            <span>{t("learn_play")}</span>
          </button>

          <button type="button" class="action-btn edit" onclick={onEdit}>
            <i class="fas fa-pen" aria-hidden="true"></i>
            <span>{t("viewer_edit")}</span>
          </button>

          <button
            type="button"
            class="action-btn fave"
            class:favorited={composition.isFavorite}
            onclick={onFavorite}
          >
            <i class="fas fa-heart" aria-hidden="true"></i>
            <span>{composition.isFavorite ? "Unfave" : "Fave"}</span>
          </button>

          <button type="button" class="action-btn copy" onclick={onDuplicate}>
            <i class="fas fa-copy" aria-hidden="true"></i>
            <span>{t("browse_copy")}</span>
          </button>

          <button type="button" class="action-btn delete" onclick={onDelete}>
            <i class="fas fa-trash" aria-hidden="true"></i>
            <span>{t("action_delete")}</span>
          </button>
        </div>
      </footer>
    </div>
  {/if}
</Drawer>

<style>
  /* Override Drawer defaults for full-screen composition viewer.
	   Routed through the --sheet-* API; the direct border-top-*-radius overrides
	   are redundant (the radius vars already drive those corners). */
  :global(.composition-viewer-drawer) {
    --sheet-bg: var(--theme-panel-bg, #0a0a14);
    --sheet-filter: none;
    --sheet-border-radius-top-left: 0px;
    --sheet-border-radius-top-right: 0px;
  }

  .drawer-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0a14);
  }

  .viewer-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top, 0px) + 8px) 12px 8px;
    min-height: var(--min-touch-target);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--theme-accent, #f43f5e);
    font-size: 14px;
    cursor: pointer;
    padding: 0 10px 0 12px;
    min-height: var(--min-touch-target);
    border-radius: 8px;
    transition: background 150ms ease;
  }

  .back-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .back-button:focus-visible {
    outline: 2px solid var(--theme-accent, #f43f5e);
    outline-offset: 2px;
  }

  .back-button i {
    font-size: 11px;
    flex-shrink: 0;
  }

  .back-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    white-space: nowrap;
  }

  .header-title {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    white-space: nowrap;
    pointer-events: none;
  }

  .header-spacer {
    width: 48px;
    flex-shrink: 0;
  }

  .preview-section {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.3);
    padding: 8px;
  }

  /*
	 * Override AnimatedPreview grid to fit the drawer.
	 * Constrain the grid to cols:rows aspect ratio so cells stay 1:1.
	 * The preview-section flex centering handles empty space around the grid.
	 */
  .preview-section :global(.animated-grid) {
    grid-template-rows: repeat(var(--rows), 1fr);
    border-radius: 8px;
    aspect-ratio: var(--cols) / var(--rows);
    width: auto;
    height: 100%;
    max-width: 100%;
  }

  .preview-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
  }

  /* ===========================
	   INFO BAR (compact metadata)
	   =========================== */

  .info-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .info-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .composition-name {
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
    margin: 0;
    color: var(--theme-text, #fff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 10px;
    border: 1px solid;
    border-radius: 20px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .mode-pill i {
    font-size: 10px;
  }

  .info-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-wrap: wrap;
  }

  .meta-chip {
    white-space: nowrap;
  }

  .meta-sep {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    flex-shrink: 0;
  }

  /* ===========================
	   FOOTER: ACTION BUTTONS
	   =========================== */

  .viewer-footer {
    display: flex;
    flex-direction: column;
    padding: 8px;
    padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .actions-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    flex: 1;
    max-width: 100px;
    min-width: 60px;
    height: 52px;
    padding: 6px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn i {
    font-size: 16px;
  }

  .action-btn span {
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .action-btn:active {
    transform: scale(0.9);
    transition-duration: 0ms;
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Color-coded action buttons (matching sequence viewer style).
	   Each family resolves to a design token (with a hex fallback that
	   preserves the original color), tints derived via color-mix. */
  .action-btn.play {
    --btn-color: var(--theme-accent, #6366f1);
    background: color-mix(in srgb, var(--btn-color) 15%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 35%, transparent);
    color: var(--theme-accent-soft, #818cf8);
  }

  .action-btn.play:hover {
    background: color-mix(in srgb, var(--btn-color) 25%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 50%, transparent);
    color: var(--theme-accent-softer, #a5b4fc);
  }

  .action-btn.edit {
    --btn-color: var(--semantic-warning, #f59e0b);
    background: color-mix(in srgb, var(--btn-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 25%, transparent);
    color: var(--btn-color);
  }

  .action-btn.edit:hover {
    background: color-mix(in srgb, var(--btn-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 40%, transparent);
  }

  .action-btn.fave {
    --btn-color: var(--semantic-fave, #a855f7);
    background: color-mix(in srgb, var(--btn-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 25%, transparent);
    color: var(--btn-color);
  }

  .action-btn.fave:hover {
    background: color-mix(in srgb, var(--btn-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 40%, transparent);
  }

  .action-btn.fave.favorited {
    --btn-color: var(--semantic-error, #ef4444);
    background: color-mix(in srgb, var(--btn-color) 15%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 35%, transparent);
    color: var(--btn-color);
  }

  .action-btn.fave.favorited:hover {
    background: color-mix(in srgb, var(--btn-color) 25%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 50%, transparent);
  }

  .action-btn.copy {
    --btn-color: var(--semantic-info, #06b6d4);
    background: color-mix(in srgb, var(--btn-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 25%, transparent);
    color: var(--btn-color);
  }

  .action-btn.copy:hover {
    background: color-mix(in srgb, var(--btn-color) 20%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 40%, transparent);
  }

  .action-btn.delete {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .action-btn.delete:hover {
    --btn-color: var(--semantic-error, #ef4444);
    background: color-mix(in srgb, var(--btn-color) 12%, transparent);
    border-color: color-mix(in srgb, var(--btn-color) 35%, transparent);
    color: var(--btn-color);
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn:active {
      transform: none;
    }

    .back-button {
      transition: none;
    }
  }
</style>
