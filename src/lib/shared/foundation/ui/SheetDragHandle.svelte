<!--
  SheetDragHandle.svelte

  Unified drag handle component for all sheet headers.
  Provides visual indication that sheets can be dragged/swiped to dismiss.
-->
<script lang="ts">
  let { class: className = "" } = $props<{
    class?: string;
  }>();
</script>

<div class="sheet-drag-handle {className}" aria-hidden="true"></div>

<style>
  .sheet-drag-handle {
    position: relative;
    width: var(--sheet-handle-width);
    height: var(--sheet-handle-height);
    margin: var(--sheet-handle-spacing) auto;
    border-radius: var(--sheet-handle-radius);
    background: var(--sheet-handle-bg);
    transition: background var(--duration-normal) var(--ease-standard);
    flex-shrink: 0;
    /* Open-hand affordance: signals the sheet can be grabbed and slid.
       Matches base Drawer's .drawer-handle (see drawer/Drawer.css). */
    cursor: grab;
  }

  .sheet-drag-handle:hover {
    background: var(--sheet-handle-bg-hover);
  }

  .sheet-drag-handle:active {
    cursor: grabbing;
  }

  /* Pulse animation on first render to draw attention */
  @keyframes handlePulse {
    0%,
    100% {
      opacity: 1;
      transform: scaleX(1);
    }
    50% {
      opacity: 0.7;
      transform: scaleX(1.2);
    }
  }

  .sheet-drag-handle {
    animation: handlePulse var(--duration-scene) var(--ease-standard);
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .sheet-drag-handle {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.8));
      border: 1px solid white;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .sheet-drag-handle {
      animation: none;
      transition: none;
    }
  }
</style>
