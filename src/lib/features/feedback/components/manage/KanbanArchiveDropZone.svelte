<!-- Archive drop zone for archiving feedback items -->
<script lang="ts">
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";

  const {
    isDropTarget,
    isDragActive,
    onDragOver,
    onDragLeave,
    onDrop,
    onOpenArchive,
  } = $props<{
    isDropTarget: boolean;
    isDragActive: boolean;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onOpenArchive: () => void;
  }>();

  const ARCHIVE_STATUS = "archived" as const;
</script>

<div
  class="archive-drop-zone"
  class:drop-target={isDropTarget}
  class:drag-active={isDragActive}
  class:clickable={!isDragActive}
  style="--column-color: {STATUS_CONFIG[ARCHIVE_STATUS].color}"
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
  onclick={() => {
    if (!isDragActive) {
      onOpenArchive();
    }
  }}
  onkeydown={(e) => {
    if ((e.key === "Enter" || e.key === " ") && !isDragActive) {
      e.preventDefault();
      onOpenArchive();
    }
  }}
  role="button"
  tabindex="0"
  aria-label="View archived feedback"
>
  <div class="archive-label">
    <i class="fas {STATUS_CONFIG[ARCHIVE_STATUS].icon}" aria-hidden="true"></i>
    <span>Archived</span>
    {#if !isDragActive}
      <i class="fas fa-chevron-right view-icon" aria-hidden="true"></i>
    {/if}
  </div>

  {#if isDropTarget}
    <div class="drop-indicator">
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .archive-drop-zone {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: clamp(60px, 8cqi, 80px);
    min-width: clamp(60px, 8cqi, 80px);
    flex: 1;
    flex-shrink: 0;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--column-color) 8%, rgba(20, 20, 30, 0.95)) 0%,
      color-mix(in srgb, var(--column-color) 3%, rgba(15, 15, 25, 0.98)) 100%
    );
    border: 1px solid color-mix(in srgb, var(--column-color) 20%, transparent);
    border-top: 3px solid var(--column-color);
    border-radius: clamp(10px, 2.5cqi, 16px);
    overflow: hidden;
    transition: all var(--duration-normal) cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow:
      0 4px 20px color-mix(in srgb, var(--column-color) 15%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .archive-drop-zone.clickable {
    cursor: pointer;
  }

  .archive-drop-zone.clickable:hover {
    border-color: color-mix(in srgb, var(--column-color) 40%, transparent);
    box-shadow:
      0 8px 28px color-mix(in srgb, var(--column-color) 25%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
  }

  .archive-drop-zone.clickable:active {
    transform: scale(0.98);
  }

  .archive-drop-zone:hover {
    border-color: color-mix(in srgb, var(--column-color) 30%, transparent);
    box-shadow:
      0 6px 24px color-mix(in srgb, var(--column-color) 20%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .archive-drop-zone.drag-active {
    border-style: dashed;
    opacity: 0.9;
  }

  .archive-drop-zone.drop-target {
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

  .archive-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 1.5cqi, 12px);
    padding: clamp(8px, 2cqi, 14px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-align: center;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    max-width: 100%;
    box-sizing: border-box;
  }

  .archive-label i {
    font-size: clamp(1.25rem, 4cqi, 1.5rem);
    color: var(--column-color);
    opacity: 0.8;
    writing-mode: horizontal-tb;
    transform: rotate(-90deg);
  }

  .archive-label span {
    font-size: clamp(0.875rem, 2.5cqi, 1rem);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .archive-label .view-icon {
    margin-top: 8px;
    font-size: 0.875rem;
    opacity: 0.6;
    transition: all var(--duration-normal) ease;
  }

  .archive-drop-zone.clickable:hover .view-icon {
    opacity: 1;
    transform: translateY(2px);
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
    animation: pulseIn var(--duration-normal) ease;
  }

  .drop-indicator i {
    font-size: clamp(1.5rem, 5cqi, 2rem);
    color: var(--column-color);
    animation: slideRight 0.6s ease-in-out infinite;
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

  @keyframes slideRight {
    0%,
    100% {
      transform: translateX(-4px);
      opacity: 0.6;
    }
    50% {
      transform: translateX(4px);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .archive-drop-zone {
      transition: none;
    }
    .drop-indicator i {
      animation: none;
    }
    .archive-label .view-icon {
      transition: none;
    }
  }
</style>
