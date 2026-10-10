<!-- TrackerCard - Read-only card showing a feedback item's public info -->
<script lang="ts">
  import type { TrackerItem } from "../../state/feedback-tracker-state.svelte";
  import {
    toTrackerStatus,
    TRACKER_STATUS_CONFIG,
  } from "../../state/feedback-tracker-state.svelte";
  import { TYPE_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { PRIORITY_CONFIG } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import type {
    FeedbackType,
    FeedbackPriority,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const { item, isExpanded, onToggle } = $props<{
    item: TrackerItem;
    isExpanded: boolean;
    onToggle: () => void;
  }>();

  const typeConfig = $derived(
    TYPE_CONFIG[item.type as FeedbackType] ?? TYPE_CONFIG.general
  );
  const trackerStatus = $derived(toTrackerStatus(item.status));
  const statusConfig = $derived(TRACKER_STATUS_CONFIG[trackerStatus]);
  const priorityConfig = $derived(
    item.priority
      ? PRIORITY_CONFIG[item.priority as FeedbackPriority]
      : null
  );

  function formatRelativeDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1 ? t("feedback_just_now") : t("feedback_minutes_ago", { count: minutes });
      }
      return t("feedback_hours_ago", { count: hours });
    }
    if (days === 1) return t("feedback_yesterday");
    if (days < 7) return t("feedback_days_ago", { count: days });
    if (days < 30) return t("feedback_weeks_ago", { count: Math.floor(days / 7) });
    return date.toLocaleDateString();
  }

  /** First name or full display name if single word */
  function firstName(displayName: string): string {
    const parts = displayName.trim().split(" ");
    return parts[0] || displayName;
  }
</script>

<button
  class="tracker-card"
  class:expanded={isExpanded}
  onclick={onToggle}
  type="button"
  style="--type-color: {typeConfig.color}"
>
  <!-- Type icon -->
  <div class="card-type">
    <i class="fas {typeConfig.icon}" aria-hidden="true"></i>
  </div>

  <!-- Content -->
  <div class="card-content">
    <div class="card-header">
      <h3 class="card-title">{item.title}</h3>
      <span class="status-badge" style="--badge-color: {statusConfig.color}">
        <i class="fas {statusConfig.icon}" aria-hidden="true"></i>
        {statusConfig.label}
      </span>
    </div>

    <p class="card-description" class:expanded={isExpanded}>
      {item.description}
    </p>

    <div class="card-footer">
      <span class="meta">
        {firstName(item.userDisplayName)} &middot; {formatRelativeDate(item.createdAt)}
      </span>
      {#if priorityConfig}
        <span
          class="priority-badge"
          style="--priority-color: {priorityConfig.color}"
        >
          <i class="fas {priorityConfig.icon}" aria-hidden="true"></i>
          {priorityConfig.label}
        </span>
      {/if}
      {#if item.imageCount > 0}
        <span class="image-indicator">
          <i class="fas fa-images" aria-hidden="true"></i>
          {item.imageCount}
        </span>
      {/if}
    </div>
  </div>
</button>

<style>
  .tracker-card {
    position: relative;
    display: flex;
    gap: 12px;
    width: 100%;
    padding: 14px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 8%, rgba(30, 30, 40, 0.95)) 0%,
      color-mix(in srgb, var(--type-color) 3%, rgba(25, 25, 35, 0.98)) 100%
    );
    border: 1.5px solid
      color-mix(in srgb, var(--type-color) 20%, rgba(255, 255, 255, 0.08));
    border-radius: 10px;
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-normal, 200ms) ease;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .tracker-card:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 15%, rgba(35, 35, 45, 0.95)) 0%,
      color-mix(in srgb, var(--type-color) 8%, rgba(30, 30, 40, 0.98)) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--type-color) 40%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.5),
      0 0 20px color-mix(in srgb, var(--type-color) 15%, transparent),
      inset 0 1px 0 var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    transform: translateY(-1px);
  }

  .tracker-card.expanded {
    border-color: color-mix(
      in srgb,
      var(--type-color) 50%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
  }

  /* Type icon */
  .card-type {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 35%, rgba(20, 20, 25, 0.9)),
      color-mix(in srgb, var(--type-color) 20%, rgba(15, 15, 20, 0.9))
    );
    border: 1px solid color-mix(in srgb, var(--type-color) 40%, transparent);
    border-radius: 8px;
    color: var(--type-color);
    font-size: var(--font-size-base, 1rem);
    box-shadow: 0 2px 8px color-mix(in srgb, var(--type-color) 25%, black);
  }

  /* Content */
  .card-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .card-title {
    flex: 1;
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--badge-color) 40%, rgba(20, 20, 25, 0.9)),
      color-mix(in srgb, var(--badge-color) 25%, rgba(15, 15, 20, 0.9))
    );
    border: 1px solid color-mix(in srgb, var(--badge-color) 30%, transparent);
    border-radius: 12px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
    color: var(--badge-color);
    white-space: nowrap;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--badge-color) 20%, black);
  }

  .status-badge i {
    font-size: 0.75rem;
  }

  .card-description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .card-description.expanded {
    -webkit-line-clamp: unset;
    line-clamp: unset;
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
    font-size: 0.75rem;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, rgba(255, 255, 255, 0.6)) 80%,
      transparent
    );
  }

  .priority-badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--priority-color);
    font-weight: 500;
  }

  .priority-badge i {
    font-size: 0.625rem;
  }

  .image-indicator {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .image-indicator i {
    font-size: 0.75rem;
    color: var(--type-color);
  }
</style>
