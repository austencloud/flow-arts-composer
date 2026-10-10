<!-- FeedbackKanbanColumn - A single status column in the Kanban board -->
<script lang="ts">
  import type {
    FeedbackItem,
    FeedbackStatus,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import FeedbackKanbanCard from "./FeedbackKanbanCard.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { ClaimStatusDeriver } from "../../services/claim-status-deriver";

  const {
    status,
    config,
    items,
    isDropTarget,
    isDragActive,
    isActiveTab = false,
    selectedItemId,
    disableDrag = false,
    queueMode = false,
    wipStatus,
    claimStatusDeriver,
    onDragStart,
    onDragEnd,
    onTouchDrag,
    onTouchEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onCardClick,
  } = $props<{
    status: FeedbackStatus;
    config: { label: string; color: string; icon: string };
    items: FeedbackItem[];
    isDropTarget: boolean;
    isDragActive: boolean;
    isActiveTab?: boolean;
    selectedItemId: string | null;
    disableDrag?: boolean;
    queueMode?: boolean;
    wipStatus?: {
      count: number;
      limit: number;
      isAtLimit: boolean;
      isOverLimit: boolean;
    };
    claimStatusDeriver?: ClaimStatusDeriver;
    onDragStart: (item: FeedbackItem) => void;
    onDragEnd: () => void;
    onTouchDrag?: (item: FeedbackItem, x: number, y: number) => void;
    onTouchEnd?: (x: number, y: number) => void | Promise<void>;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onCardClick: (item: FeedbackItem) => void;
  }>();

  // Derive claim health for an item
  function getClaimHealth(item: FeedbackItem) {
    if (!claimStatusDeriver)
      return {
        claimHealth: undefined,
        claimAgeMs: undefined,
        claimTokenShort: undefined,
      };
    const effective = claimStatusDeriver.deriveEffectiveStatus(item);
    return {
      claimHealth: effective.claimHealth,
      claimAgeMs: effective.claimAgeMs,
      claimTokenShort: effective.claimTokenShort,
    };
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    onDragOver();
  }

  function handleDragLeave(e: DragEvent) {
    const column = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as Node | null;
    // Only fire leave when cursor actually exits the column, not when moving between children
    if (!related || !column.contains(related)) {
      onDragLeave();
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    onDrop();
  }
</script>

<div
  class="kanban-column"
  class:drop-target={isDropTarget}
  class:drag-active={isDragActive}
  class:active-tab={isActiveTab}
  class:queue-mode={queueMode}
  style="--column-color: {config.color}"
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  role="region"
  id="column-{status}"
  aria-label={t("feedback_column_label", { label: config.label })}
>
  <!-- Column Header -->
  <header class="column-header">
    <div class="header-icon">
      <i class="fas {config.icon}" aria-hidden="true"></i>
    </div>
    <h3 class="header-title">{config.label}</h3>
    {#if wipStatus?.limit > 0}
      <span
        class="header-count wip-indicator"
        class:at-limit={wipStatus.isAtLimit}
        class:over-limit={wipStatus.isOverLimit}
        title={wipStatus.isOverLimit
          ? `Over WIP limit of ${wipStatus.limit}`
          : wipStatus.isAtLimit
            ? `At WIP limit`
            : `${wipStatus.count}/${wipStatus.limit}`}
      >
        {wipStatus.count}/{wipStatus.limit}
      </span>
    {:else}
      <span class="header-count">{items.length}</span>
    {/if}
  </header>

  <!-- Cards Container -->
  <div class="cards-container">
    {#if items.length === 0}
      <div class="empty-state">
        <div class="empty-icon">
          <i
            class="fas {status === 'completed'
              ? 'fa-check-circle'
              : status === 'wont-fix'
                ? 'fa-ban'
                : 'fa-inbox'}"
            aria-hidden="true"
          ></i>
        </div>
        <span class="empty-title">
          {#if status === "new"}
            {t("feedback_empty_new")}
          {:else if status === "completed"}
            {t("feedback_empty_completed")}
          {:else if status === "wont-fix"}
            {t("feedback_empty_declined")}
          {:else}
            {t("feedback_empty_default")}
          {/if}
        </span>
        <span class="empty-hint">
          {#if status === "new"}
            {t("feedback_empty_new_hint")}
          {:else}
            {t("feedback_empty_drag_hint")}
          {/if}
        </span>
      </div>
    {:else}
      {#each items as item (item.id)}
        {@const { claimHealth, claimAgeMs, claimTokenShort } =
          getClaimHealth(item)}
        <FeedbackKanbanCard
          {item}
          isSelected={selectedItemId === item.id}
          {disableDrag}
          {claimHealth}
          {claimAgeMs}
          {claimTokenShort}
          {onDragStart}
          {onDragEnd}
          {onTouchDrag}
          {onTouchEnd}
          onClick={() => onCardClick(item)}
        />
      {/each}
    {/if}
  </div>

  <!-- Drop zone indicator -->
  {#if isDropTarget}
    <div class="drop-indicator">
      <i class="fas fa-plus-circle" aria-hidden="true"></i>
      <span>{t("feedback_drop_here")}</span>
    </div>
  {/if}
</div>

<style>
  .kanban-column {
    --kc-space-2xs: clamp(4px, 1cqi, 8px);
    --kc-space-xs: clamp(8px, 2cqi, 12px);
    --kc-space-sm: clamp(12px, 3cqi, 18px);
    --kc-space-md: clamp(16px, 4cqi, 28px);

    --kc-text-xs: clamp(0.8125rem, 2cqi, 0.875rem); /* min 13px */
    --kc-text-sm: clamp(0.875rem, 2.5cqi, 1rem); /* min 14px */
    --kc-text-base: clamp(1rem, 3cqi, 1.125rem); /* min 16px */
    --kc-text-lg: clamp(1.125rem, 3.5cqi, 1.25rem); /* min 18px */

    --kc-radius-sm: clamp(8px, 2cqi, 12px);
    --kc-radius-md: clamp(12px, 3cqi, 18px);
    --kc-radius-lg: clamp(16px, 4cqi, 24px);

    --kc-text: var(--theme-text);
    --kc-text-muted: color-mix(in srgb, var(--theme-text) 75%, transparent);
    --kc-text-subtle: var(--theme-text-dim);

    --spring-smooth: cubic-bezier(0.4, 0, 0.2, 1);

    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 17.5rem;
    flex: 1;
    /* Colorful gradient background based on column color */
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--column-color) 12%, rgba(20, 20, 30, 0.95)) 0%,
      color-mix(in srgb, var(--column-color) 5%, rgba(15, 15, 25, 0.98)) 100%
    );
    /* Vibrant top border accent */
    border: 1px solid color-mix(in srgb, var(--column-color) 25%, transparent);
    border-top: 3px solid var(--column-color);
    border-radius: var(--kc-radius-md);
    overflow: hidden;
    transition: all var(--duration-normal) var(--spring-smooth);
    /* Subtle glow */
    box-shadow:
      0 4px 20px color-mix(in srgb, var(--column-color) 15%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .kanban-column.queue-mode {
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .kanban-column.queue-mode:hover {
    transform: none;
  }

  .kanban-column:hover {
    border-color: color-mix(in srgb, var(--column-color) 40%, transparent);
    box-shadow:
      0 8px 30px color-mix(in srgb, var(--column-color) 25%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
  }

  .kanban-column.drag-active {
    border-style: dashed;
    opacity: 0.9;
  }

  .kanban-column.drop-target {
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

  /* Column Header - Gradient with color accent */
  .column-header {
    display: flex;
    align-items: center;
    gap: var(--kc-space-xs);
    padding: var(--kc-space-sm) var(--kc-space-md);
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--column-color) 15%, transparent) 0%,
      transparent 100%
    );
    border-bottom: 1px solid
      color-mix(in srgb, var(--column-color) 20%, transparent);
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(26px, 5cqi, 34px);
    height: clamp(26px, 5cqi, 34px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--column-color) 40%, transparent) 0%,
      color-mix(in srgb, var(--column-color) 20%, transparent) 100%
    );
    border-radius: var(--kc-radius-sm);
    color: var(--column-color);
    font-size: clamp(12px, 2.5cqi, 15px);
    box-shadow: 0 2px 8px
      color-mix(in srgb, var(--column-color) 30%, transparent);
  }

  .header-title {
    margin: 0;
    flex: 1;
    font-size: var(--kc-text-sm);
    font-weight: 700;
    color: var(--kc-text);
    letter-spacing: 0.02em;
  }

  .header-count {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: clamp(24px, 5cqi, 30px);
    height: clamp(24px, 5cqi, 30px);
    padding: 0 clamp(6px, 1.5cqi, 10px);
    background: color-mix(in srgb, var(--column-color) 25%, transparent);
    border: 1px solid color-mix(in srgb, var(--column-color) 30%, transparent);
    border-radius: 999px;
    font-size: var(--kc-text-xs);
    font-weight: 700;
    color: var(--column-color);
  }

  .wip-indicator.at-limit {
    background: color-mix(in srgb, var(--semantic-warning) 30%, transparent);
    border-color: var(--semantic-warning);
    color: var(--semantic-warning);
  }

  .wip-indicator.over-limit {
    background: color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-color: var(--semantic-error);
    color: var(--semantic-error);
    animation: pulse-warning 2s ease-in-out infinite;
  }

  @keyframes pulse-warning {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  /* Cards Container */
  .cards-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--kc-space-sm);
    padding: var(--kc-space-sm);
    overflow-y: auto;
    min-height: clamp(80px, 15cqi, 120px);
  }

  @container kanban (min-width: 2600px) {
    .kanban-column {
      --kc-text-xs: 0.9375rem;
      --kc-text-sm: 1rem;
      --kc-text-base: 1.125rem;
      --kc-text-lg: 1.25rem;
    }

    .cards-container {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start;
    }

    .empty-state,
    .drop-indicator {
      grid-column: 1 / -1;
    }
  }

  @container kanban (min-width: 1100px) and (max-width: 1319px) {
    .kanban-column.queue-mode .cards-container {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-content: start;
    }

    .kanban-column.queue-mode .empty-state,
    .kanban-column.queue-mode .drop-indicator {
      grid-column: 1 / -1;
    }
  }

  .cards-container::-webkit-scrollbar {
    width: 5px;
  }

  .cards-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }

  .cards-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-accent);
    border-radius: 3px;
  }

  .cards-container::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-accent-hover);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--kc-space-sm);
    padding: clamp(24px, 6cqi, 40px) clamp(16px, 4cqi, 28px);
    margin: var(--kc-space-xs);
    border-radius: var(--kc-radius-lg);
    background:
      radial-gradient(
        ellipse 100% 80% at 50% 0%,
        color-mix(in srgb, var(--column-color) 8%, transparent) 0%,
        transparent 70%
      ),
      color-mix(in srgb, var(--column-color) 4%, rgba(255, 255, 255, 0.02));
    border: 1px dashed color-mix(in srgb, var(--column-color) 25%, transparent);
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(48px, 12cqi, 64px);
    height: clamp(48px, 12cqi, 64px);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--column-color) 20%, transparent) 0%,
      color-mix(in srgb, var(--column-color) 10%, transparent) 100%
    );
    border-radius: 50%;
    box-shadow: 0 4px 16px
      color-mix(in srgb, var(--column-color) 15%, transparent);
  }

  .empty-icon i {
    font-size: clamp(1.25rem, 3cqi, 1.75rem);
    color: var(--column-color);
  }

  .empty-title {
    font-size: var(--kc-text-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .empty-hint {
    font-size: var(--kc-text-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
    max-width: clamp(180px, 45cqi, 280px);
    line-height: 1.5;
  }

  /* Drop Indicator */
  .drop-indicator {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--kc-space-xs);
    background: color-mix(in srgb, var(--column-color) 10%, transparent);
    backdrop-filter: blur(4px);
    pointer-events: none;
    animation: pulseIn var(--duration-normal) ease;
  }

  .drop-indicator i {
    font-size: clamp(24px, 5cqi, 32px);
    color: var(--column-color);
  }

  .drop-indicator span {
    font-size: var(--kc-text-sm);
    font-weight: 600;
    color: var(--column-color);
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

  /* ===== CONTAINER QUERY: Mobile tab-based layout ===== */
  /* When inside the kanban board's mobile layout, columns hide unless active */
  @container kanban (max-width: 652px) {
    .kanban-column {
      display: none;
      min-width: 100%;
      max-width: 100%;
      border-top: none;
      border-radius: 0;
      background: transparent;
      border: none;
      box-shadow: none;
    }

    .kanban-column.active-tab {
      display: flex;
    }

    .kanban-column:hover {
      transform: none;
      box-shadow: none;
    }

    /* Hide header on mobile since we have tabs */
    .column-header {
      display: none;
    }

    .cards-container {
      padding: var(--kc-space-xs);
      gap: var(--kc-space-sm);
    }

    /* Mobile empty state uses same fluid values - no overrides needed */
    .empty-state {
      margin: 0;
      background:
        radial-gradient(
          ellipse 100% 60% at 50% 0%,
          color-mix(in srgb, var(--column-color) 10%, transparent) 0%,
          transparent 70%
        ),
        var(--theme-card-bg);
      border-color: var(--theme-stroke, var(--theme-stroke));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .kanban-column,
    .drop-indicator {
      transition: none;
      animation: none;
    }

    .wip-indicator.over-limit {
      animation: none;
    }
  }
</style>
