<!--
  MobileToolViewToggle.svelte

  Toggle button for switching between Step Grid and Controls view
  on mobile animation panel. Shows icon for non-active view.
-->
<script lang="ts" module>
  export type MobileToolView = "controls" | "step-grid";
</script>

<script lang="ts">
  let {
    activeView = "controls",
    onToggle = () => {},
  }: {
    activeView?: MobileToolView;
    onToggle?: () => void;
  } = $props();

  const isShowingGrid = $derived(activeView === "step-grid");
</script>

<button
  class="tool-view-toggle"
  class:showing-grid={isShowingGrid}
  onclick={onToggle}
  aria-label={isShowingGrid ? "Show animation controls" : "Show step grid"}
  title={isShowingGrid ? "Show Controls" : "Show Step Grid"}
  type="button"
>
  {#if isShowingGrid}
    <!-- Show sliders icon to indicate "switch to controls" -->
    <i class="fas fa-sliders-h" aria-hidden="true"></i>
  {:else}
    <!-- Show grid icon to indicate "switch to step grid" -->
    <i class="fas fa-th" aria-hidden="true"></i>
  {/if}
</button>

<style>
  .tool-view-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke-strong);
    border-radius: 50%;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    -webkit-tap-highlight-color: transparent;
    font-size: var(--font-size-base);
  }

  .tool-view-toggle.showing-grid {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent) 20%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent) 15%, transparent) 100%
    );
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }

  @media (hover: hover) and (pointer: fine) {
    .tool-view-toggle:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      color: var(--theme-text);
      transform: scale(1.05);
    }

    .tool-view-toggle.showing-grid:hover {
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--theme-accent) 30%, transparent) 0%,
        color-mix(in srgb, var(--theme-accent) 25%, transparent) 100%
      );
      border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
    }
  }

  .tool-view-toggle:active {
    transform: scale(0.95);
  }

  .tool-view-toggle:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tool-view-toggle {
      transition: none;
    }
  }
</style>
