<script lang="ts">
  import type { FeedbackStatus } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { FeedbackDetailState } from "../../../state/feedback-detail-state.svelte";

  interface Props {
    detailState: FeedbackDetailState;
    readOnly?: boolean;
    isMobile?: boolean;
  }

  const { detailState, readOnly = false, isMobile = false }: Props = $props();

  const statusConfig = $derived(
    STATUS_CONFIG[detailState.item.status as FeedbackStatus]
  );
  const statuses = Object.entries(STATUS_CONFIG) as [
    FeedbackStatus,
    typeof statusConfig,
  ][];

  // Status cycling for mobile
  const statusOrder: FeedbackStatus[] = [
    "new",
    "in-progress",
    "in-review",
    "completed",
    "archived",
  ];
  const currentStatusIndex = $derived(
    statusOrder.indexOf(detailState.item.status as FeedbackStatus)
  );
  const currentConfig = $derived(
    STATUS_CONFIG[detailState.item.status as FeedbackStatus]
  );

  function cycleStatus(direction: "prev" | "next") {
    if (readOnly) return;
    const newIndex =
      direction === "next"
        ? Math.min(currentStatusIndex + 1, statusOrder.length - 1)
        : Math.max(currentStatusIndex - 1, 0);
    const newStatus = statusOrder[newIndex];
    if (newStatus) {
      detailState.handleStatusChange(newStatus);
    }
  }
</script>

<section class="section">
  <h3 class="section-title">
    <i class="fas fa-tasks" aria-hidden="true"></i>
    Status
  </h3>
  {#if isMobile}
    <!-- Mobile: Arrow cycling -->
    <div class="status-cycling">
      <button
        type="button"
        class="cycle-btn"
        onclick={() => cycleStatus("prev")}
        disabled={readOnly || currentStatusIndex <= 0}
        aria-label="Previous status"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="status-value" style="--status-color: {currentConfig.color}">
        <i class="fas {currentConfig.icon}" aria-hidden="true"></i>
        {currentConfig.label}
      </span>
      <button
        type="button"
        class="cycle-btn"
        onclick={() => cycleStatus("next")}
        disabled={readOnly || currentStatusIndex >= statusOrder.length - 1}
        aria-label="Next status"
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  {:else}
    <!-- Desktop: Chip row -->
    <div class="status-row">
      {#each statuses as [status, config]}
        <button
          type="button"
          class="status-chip"
          class:active={detailState.item.status === status}
          style="--status-color: {config.color}"
          onclick={() => {
            if (!readOnly) {
              detailState.handleStatusChange(status);
            }
          }}
          disabled={readOnly}
        >
          <i class="fas {config.icon}" aria-hidden="true"></i>
          <span class="status-label">{config.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<style>
  .section {
    display: flex;
    flex-direction: column;
    gap: var(--fb-space-sm);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--fb-space-xs);
    margin: 0;
    font-size: var(--fb-text-xs);
    font-weight: 600;
    color: var(--fb-text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Desktop: Chip row */
  .status-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fb-space-xs);
  }

  .status-chip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    background: var(--fb-surface);
    border: 1px solid var(--fb-border);
    border-radius: 999px;
    color: var(--fb-text-muted);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    font-size: var(--fb-text-xs);
    font-weight: 500;
  }

  .status-chip:hover:not(:disabled) {
    background: color-mix(in srgb, var(--status-color) 10%, transparent);
    border-color: var(--status-color);
    color: var(--status-color);
  }

  .status-chip.active {
    background: color-mix(in srgb, var(--status-color) 15%, transparent);
    border-color: var(--status-color);
    color: var(--status-color);
    font-weight: 600;
  }

  .status-chip:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .status-label {
    white-space: nowrap;
  }

  /* Mobile: Arrow cycling */
  .status-cycling {
    display: flex;
    align-items: center;
    gap: var(--fb-space-sm, 13px);
    justify-content: center;
  }

  .cycle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--fb-surface, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--fb-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--fb-radius-sm, 8px);
    color: var(--fb-text, rgba(255, 255, 255, 0.95));
    font-size: 1rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .cycle-btn:hover:not(:disabled) {
    background: var(--fb-surface-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--fb-purple, var(--theme-accent-strong));
    color: var(--fb-purple, var(--theme-accent-strong));
  }

  .cycle-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .status-value {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    min-width: 120px;
    justify-content: center;
    background: color-mix(in srgb, var(--status-color) 15%, transparent);
    border: 1px solid var(--status-color);
    border-radius: var(--fb-radius-md, 12px);
    color: var(--status-color);
    font-size: var(--fb-text-sm, 0.875rem);
    font-weight: 600;
  }
</style>
