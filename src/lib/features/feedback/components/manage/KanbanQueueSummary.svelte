<script lang="ts">
  import { STATUS_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type { KanbanBoardState } from "../../state/kanban-board-state.svelte";

  type KanbanStatus = "new" | "in-progress" | "in-review" | "completed";

  interface Props {
    boardState: KanbanBoardState;
  }

  const { boardState }: Props = $props();

  const statuses: KanbanStatus[] = [
    "new",
    "in-progress",
    "in-review",
    "completed",
  ];

  const activeStatus = $derived(boardState.activeStatus as KanbanStatus);
  const config = $derived(STATUS_CONFIG[activeStatus]);
  const count = $derived(boardState.itemsByStatus[activeStatus]?.length ?? 0);
  const wip = $derived(boardState.wipStatus[activeStatus]);
  const total = $derived(
    statuses.reduce(
      (sum, status) => sum + (boardState.itemsByStatus[status]?.length ?? 0),
      0
    )
  );
  const meterFill = $derived(
    wip.limit > 0 ? Math.min(100, (wip.count / wip.limit) * 100) : 0
  );

  const signal = $derived.by(() => {
    if (wip.limit > 0) {
      if (wip.isOverLimit) {
        const excess = wip.count - wip.limit;
        return `${excess} over the focus limit`;
      }
      if (wip.isAtLimit) return "Focus limit reached";
      return `${wip.limit - wip.count} spaces available`;
    }

    if (activeStatus === "new") {
      return count === 1
        ? "1 card ready to triage"
        : `${count} cards ready to triage`;
    }
    if (activeStatus === "completed") {
      return count === 1
        ? "1 card ready for release"
        : `${count} cards ready for release`;
    }
    return count === 1
      ? "1 card in this queue"
      : `${count} cards in this queue`;
  });
</script>

<section
  class="queue-summary"
  class:over-limit={wip.isOverLimit}
  style="--summary-color: {config.color}"
  aria-label="{config.label} queue health"
>
  <div class="summary-heading">
    <span class="summary-eyebrow">Focus</span>
    <i class="fas {config.icon}" aria-hidden="true"></i>
  </div>

  <strong class="summary-signal">{signal}</strong>

  {#if wip.limit > 0}
    <div class="meter-copy">
      <span>{wip.count} active</span>
      <span>Target {wip.limit}</span>
    </div>
    <div class="capacity-meter" aria-hidden="true">
      <span style="width: {meterFill}%"></span>
    </div>
  {/if}

  <div class="summary-total">
    <i class="fas fa-layer-group" aria-hidden="true"></i>
    <span>{total} cards shown</span>
  </div>
</section>

<style>
  .queue-summary {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--summary-color) 14%, transparent),
        transparent 72%
      ),
      var(--theme-card-bg);
    border: 1px solid
      color-mix(in srgb, var(--summary-color) 28%, var(--theme-stroke));
    border-radius: 1rem;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .summary-heading,
  .meter-copy,
  .summary-total {
    display: flex;
    align-items: center;
  }

  .summary-heading {
    justify-content: space-between;
    gap: 0.5rem;
  }

  .summary-eyebrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .summary-heading i {
    color: var(--summary-color);
    font-size: 1rem;
  }

  .summary-signal {
    color: var(--theme-text);
    font-size: var(--font-size-min);
    line-height: 1.35;
  }

  .queue-summary.over-limit .summary-signal {
    color: var(--semantic-error);
  }

  .meter-copy {
    justify-content: space-between;
    gap: 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .capacity-meter {
    height: 0.375rem;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-stroke) 70%, transparent);
    border-radius: 999px;
  }

  .capacity-meter span {
    display: block;
    height: 100%;
    background: var(--summary-color);
    border-radius: inherit;
  }

  .queue-summary.over-limit .capacity-meter span {
    background: var(--semantic-error);
  }

  .summary-total {
    gap: 0.5rem;
    padding-top: 0.625rem;
    border-top: 1px solid var(--theme-stroke);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
  }

  .summary-total i {
    color: var(--summary-color);
  }
</style>
