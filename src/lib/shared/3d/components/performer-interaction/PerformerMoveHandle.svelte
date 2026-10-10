<script lang="ts">
  import { T } from "@threlte/core";
  import { HTML } from "@threlte/extras";
  import { popIn } from "#lib/shared/transitions/motion.js";

  interface Props {
    position: { x: number; z: number };
    groundY: number;
    selectedCount: number;
    dragging?: boolean;
    onpointerdown: (event: PointerEvent) => void;
    onpointermove: (event: PointerEvent) => void;
    onpointerup: (event: PointerEvent) => void;
    onpointercancel: (event: PointerEvent) => void;
  }

  let {
    position,
    groundY,
    selectedCount,
    dragging = false,
    onpointerdown,
    onpointermove,
    onpointerup,
    onpointercancel,
  }: Props = $props();

  const label = $derived(
    selectedCount === 1 ? "Move character" : `Move ${selectedCount}`
  );
  const accessibleLabel = $derived(
    selectedCount === 1
      ? "Move selected character"
      : `Move ${selectedCount} selected characters`
  );
</script>

<T.Group position={[position.x, groundY + 0.08, position.z]}>
  <HTML center sprite>
    <button
      class="move-handle"
      class:dragging
      type="button"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      transition:popIn
      {onpointerdown}
      {onpointermove}
      {onpointerup}
      {onpointercancel}
      onlostpointercapture={onpointercancel}
      oncontextmenu={(event) => event.preventDefault()}
      ondragstart={(event) => event.preventDefault()}
    >
      <i class="fas fa-arrows-up-down-left-right" aria-hidden="true"></i>
      <span>{label}</span>
    </button>
  </HTML>
</T.Group>

<style>
  .move-handle {
    min-width: 48px;
    min-height: 48px;
    padding: 0 0.875rem;
    border: 1px solid var(--theme-accent, #8b5cf6);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.82));
    color: var(--theme-text, #fff);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.5),
      0 0.4rem 1.1rem rgba(0, 0, 0, 0.42);
    font: inherit;
    font-size: max(14px, var(--font-size-min, 0.875rem));
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .move-handle:hover,
  .move-handle:focus-visible {
    border-color: var(--theme-accent-text, #a78bfa);
    background: var(--theme-card-hover-bg, rgba(24, 20, 40, 0.94));
    color: var(--theme-accent-text, #a78bfa);
  }

  .move-handle:focus-visible {
    outline: 2px solid var(--theme-accent-text, #a78bfa);
    outline-offset: 3px;
  }

  .move-handle.dragging {
    cursor: grabbing;
  }

  .move-handle i {
    width: 1rem;
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .move-handle {
      transition: none;
    }
  }
</style>
