<!-- Deferred drop zone for deferring feedback items -->
<script lang="ts">
  const {
    isDropTarget,
    isDragActive,
    deferredCount,
    onDragOver,
    onDragLeave,
    onDrop,
  } = $props<{
    isDropTarget: boolean;
    isDragActive: boolean;
    deferredCount: number;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
  }>();
</script>

<div
  class="defer-drop-zone"
  class:drop-target={isDropTarget}
  class:drag-active={isDragActive}
  style="--column-color: var(--semantic-warning)"
  ondragover={(e) => {
    e.preventDefault();
    onDragOver();
  }}
  ondragleave={(e) => {
    const zone = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    if (!related || !zone.contains(related)) {
      onDragLeave();
    }
  }}
  ondrop={(e) => {
    e.preventDefault();
    onDrop();
  }}
  role="region"
  aria-label="Defer drop zone"
>
  <div class="defer-label">
    <i class="fas fa-clock" aria-hidden="true"></i>
    <span>Defer</span>
    {#if deferredCount > 0}
      <span class="defer-count">{deferredCount}</span>
    {/if}
  </div>

  {#if isDropTarget}
    <div class="drop-indicator">
      <i class="fas fa-calendar-plus" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .defer-drop-zone {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--column-color) 8%, rgba(20, 20, 30, 0.95)) 0%,
      color-mix(in srgb, var(--column-color) 3%, rgba(15, 15, 25, 0.98)) 100%
    );
    border: 1px solid color-mix(in srgb, var(--column-color) 20%, transparent);
    border-top: 3px solid var(--column-color);
    border-radius: clamp(10px, 2.5cqi, 16px);
    overflow: hidden;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
    box-shadow:
      0 4px 20px color-mix(in srgb, var(--column-color) 15%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .defer-drop-zone:hover {
    border-color: color-mix(in srgb, var(--column-color) 30%, transparent);
    box-shadow:
      0 6px 24px color-mix(in srgb, var(--column-color) 20%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .defer-drop-zone.drag-active {
    border-style: dashed;
    opacity: 0.9;
  }

  .defer-drop-zone.drop-target {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--column-color) 20%, rgba(20, 20, 30, 0.95)) 0%,
      color-mix(in srgb, var(--column-color) 12%, rgba(15, 15, 25, 0.98)) 100%
    );
    border-color: var(--column-color);
    border-style: solid;
    box-shadow:
      0 0 40px color-mix(in srgb, var(--column-color) 40%, transparent),
      inset 0 0 30px color-mix(in srgb, var(--column-color) 10%, transparent);
    transform: scale(1.02);
  }

  .defer-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 1.5cqi, 12px);
    padding: clamp(10px, 2.5cqi, 16px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-align: center;
    flex-wrap: wrap;
  }

  .defer-label i {
    font-size: clamp(1rem, 3cqi, 1.25rem);
    color: var(--column-color);
    opacity: 0.8;
  }

  .defer-label span {
    font-size: clamp(0.8125rem, 2cqi, 0.875rem);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .defer-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: clamp(18px, 4.5cqi, 24px);
    height: clamp(18px, 4.5cqi, 24px);
    padding: 0 clamp(4px, 1cqi, 8px);
    background: color-mix(in srgb, var(--column-color) 30%, transparent);
    border: 1px solid color-mix(in srgb, var(--column-color) 40%, transparent);
    border-radius: 999px;
    font-size: clamp(0.8125rem, 2cqi, 0.875rem);
    font-weight: 700;
    color: var(--column-color);
  }

  .drop-indicator {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--column-color) 12%, transparent);
    backdrop-filter: blur(4px);
    pointer-events: none;
    animation: pulseIn var(--duration-normal) var(--ease-standard);
  }

  .drop-indicator i {
    font-size: clamp(1.25rem, 4cqi, 1.5rem);
    color: var(--column-color);
    animation: pulse 0.6s ease-in-out infinite;
  }

  @keyframes pulseIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .defer-drop-zone {
      transition: none;
    }
    .drop-indicator i {
      animation: none;
    }
  }
</style>
