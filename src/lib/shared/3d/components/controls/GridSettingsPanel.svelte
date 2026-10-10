<script lang="ts">
  /**
   * GridSettingsPanel - Grid mode and plane visibility controls
   *
   * Toggle between diamond/box grid modes and show/hide individual planes.
   */

  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Plane, PLANE_LABELS, PLANE_COLORS } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";

  interface Props {
    /** Current grid mode */
    gridMode: GridMode;
    /** Currently visible planes */
    visiblePlanes: Set<Plane>;
    /** Callback when grid mode changes */
    onGridModeChange: (mode: GridMode) => void;
    /** Callback when plane visibility changes */
    onPlaneToggle: (plane: Plane) => void;
  }

  let { gridMode, visiblePlanes, onGridModeChange, onPlaneToggle }: Props =
    $props();

  const allPlanes = [Plane.WALL, Plane.WHEEL, Plane.FLOOR];
</script>

<section class="grid-settings">
  <h3>{t("viewer3d_grid")}</h3>

  <!-- Grid Mode Toggle -->
  <div class="mode-toggle">
    <button
      class="mode-btn"
      class:active={gridMode === "diamond"}
      onclick={() => onGridModeChange("diamond")}
      aria-label="Diamond grid mode"
      aria-pressed={gridMode === "diamond"}
    >
      <i class="fas fa-diamond" aria-hidden="true"></i>
      Diamond
    </button>
    <button
      class="mode-btn"
      class:active={gridMode === "box"}
      onclick={() => onGridModeChange("box")}
      aria-label="Box grid mode"
      aria-pressed={gridMode === "box"}
    >
      <i class="fas fa-square" aria-hidden="true"></i>
      Box
    </button>
  </div>

  <!-- Plane Visibility -->
  <div class="plane-btns">
    {#each allPlanes as plane}
      <button
        class="plane-btn"
        class:active={visiblePlanes.has(plane)}
        style="--color: {PLANE_COLORS[plane]}"
        onclick={() => onPlaneToggle(plane)}
        aria-label={`Toggle ${PLANE_LABELS[plane]} plane`}
        aria-pressed={visiblePlanes.has(plane)}
      >
        <span class="indicator"></span>
        {PLANE_LABELS[plane]}
      </button>
    {/each}
  </div>
</section>

<style>
  .grid-settings {
    padding: 1rem;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
  }

  h3 {
    margin: 0 0 0.75rem;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .mode-toggle {
    display: flex;
    background: var(--theme-panel-bg);
    border-radius: 10px;
    padding: 3px;
    margin-bottom: 0.75rem;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-height: var(--min-touch-target); /* WCAG AA touch target */
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .mode-btn:hover {
    color: var(--theme-text);
  }

  .mode-btn.active {
    background: var(--theme-accent);
    color: white;
  }

  .mode-btn i {
    font-size: 0.75rem;
  }

  .plane-btns {
    display: flex;
    gap: 0.5rem;
  }

  .plane-btn {
    flex: 1;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm, 0.8rem);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .plane-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .plane-btn.active {
    background: var(--theme-card-bg);
    border-color: var(--color);
    color: var(--theme-text, white);
  }

  .plane-btn .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color);
    opacity: 0.4;
    transition: opacity var(--duration-fast);
  }

  .plane-btn.active .indicator {
    opacity: 1;
  }
</style>
