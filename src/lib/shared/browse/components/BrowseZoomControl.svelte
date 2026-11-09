<!--
  Grid zoom, fine pointers only: touch users pinch. Makes the hidden Ctrl+scroll
  density control discoverable on desktop.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { BrowseEngine } from "../engine/types";

  let { engine }: { engine: BrowseEngine } = $props();
</script>

<div
  class="zoom-control"
  role="group"
  aria-label={t("browse_ui_grid_density")}
  title={t("browse_audit_grid_density_tip")}
>
  <button
    type="button"
    class="zoom-btn"
    onclick={() => engine.zoomIn()}
    disabled={!engine.canZoomIn}
    aria-label={t("browse_audit_zoom_out")}
  >
    <i class="fas fa-magnifying-glass-minus" aria-hidden="true"></i>
  </button>
  <button
    type="button"
    class="zoom-btn"
    onclick={() => engine.zoomOut()}
    disabled={!engine.canZoomOut}
    aria-label={t("browse_audit_zoom_in")}
  >
    <i class="fas fa-magnifying-glass-plus" aria-hidden="true"></i>
  </button>
</div>

<style>
  .zoom-control {
    display: none;
    align-items: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
  }

  @media (hover: hover) and (pointer: fine) {
    .zoom-control {
      display: flex;
    }
  }

  .zoom-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: transparent;
    border: none;
    border-radius: var(--border-radius-sm, 6px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .zoom-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text);
  }

  .zoom-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .zoom-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 1px;
  }
</style>
