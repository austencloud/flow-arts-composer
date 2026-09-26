<!--
  CanvasControls.svelte

  Per-canvas control button positioned in the top-right corner.
  Opens trail settings sheet for the specific canvas.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    canvasId,
    onOpenSettings,
  }: {
    canvasId: string;
    onOpenSettings: (canvasId: string) => void;
  } = $props();

  function handleClick() {
    onOpenSettings(canvasId);
  }
</script>

<div class="canvas-controls">
  <button
    class="settings-btn"
    onclick={handleClick}
    aria-label={t("compose_ui_canvas_settings")}
    title={t("compose_ui_trail_display_settings")}
  >
    <i class="fas fa-cog" aria-hidden="true"></i>
  </button>
</div>

<style>
  .canvas-controls {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 10;
  }

  .settings-btn {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: 1rem;
    cursor: pointer;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    transition: all var(--duration-normal) ease;
  }

  .settings-btn:hover {
    background: rgba(0, 0, 0, 0.7);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    color: var(--theme-text);
    transform: scale(1.05);
  }

  .settings-btn:active {
    transform: scale(0.95);
  }

  /* Mobile - larger touch target */
  @media (max-width: 768px) {
    .canvas-controls {
      top: 0.75rem;
      right: 0.75rem;
    }

    .settings-btn {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: 1.1rem;
    }
  }
</style>
