<!-- MyFeedbackCard - Card for tester's own feedback item -->
<script lang="ts">
  import type {
    FeedbackItem,
    FeedbackType,
    FeedbackStatus,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import {
    STATUS_CONFIG,
    TYPE_CONFIG,
  } from "$lib/shared/feedback/domain/models/feedback-models";
  import { getLocale, t } from "$lib/shared/i18n/i18n.svelte.js";
  import { feedbackStatusLabel } from "../../domain/feedback-display-labels";

  const { item, isSelected, onClick } = $props<{
    item: FeedbackItem;
    isSelected: boolean;
    onClick: () => void;
  }>();

  const typeConfig = $derived(
    TYPE_CONFIG[item.type as FeedbackType] ?? TYPE_CONFIG.general
  );
  const statusConfig = $derived(
    STATUS_CONFIG[item.status as FeedbackStatus] ?? STATUS_CONFIG.new
  );

  function formatDate(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return minutes <= 1
          ? t("feedback_just_now")
          : t("feedback_minutes_ago", { count: minutes });
      }
      return t("feedback_hours_ago", { count: hours });
    }
    if (days === 1) return t("feedback_yesterday");
    if (days < 7) return t("feedback_days_ago", { count: days });
    return date.toLocaleDateString(getLocale());
  }
</script>

<button
  class="feedback-card"
  class:selected={isSelected}
  onclick={onClick}
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
        {feedbackStatusLabel(item.status)}
      </span>
    </div>

    <p class="card-description">{item.description}</p>

    <!-- Screenshot indicator -->
    {#if item.imageUrls && item.imageUrls.length > 0}
      <div class="screenshot-indicator">
        <i class="fas fa-images" aria-hidden="true"></i>
        <span
          >{t("feedback_screenshot_count", {
            count: item.imageUrls.length,
          })}</span
        >
      </div>
    {/if}

    <div class="card-footer">
      <span class="date">{formatDate(item.createdAt)}</span>
      {#if item.adminResponse}
        <span class="has-response">
          <i class="fas fa-reply" aria-hidden="true"></i>
          {t("feedback_response")}
        </span>
      {/if}
    </div>
  </div>

  <!-- Selection indicator -->
  {#if isSelected}
    <div class="selection-indicator"></div>
  {/if}
</button>

<style>
  .feedback-card {
    position: relative;
    display: flex;
    gap: 12px;
    width: 100%;
    padding: 14px;
    /* Type-colored gradient background (matches Kanban card styling) */
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
    transition: all var(--duration-normal) ease;
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .feedback-card:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--type-color) 15%, rgba(35, 35, 45, 0.95)) 0%,
      color-mix(in srgb, var(--type-color) 8%, rgba(30, 30, 40, 0.98)) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--type-color) 40%,
      var(--theme-stroke)
    );
    box-shadow:
      0 6px 20px rgba(0, 0, 0, 0.5),
      0 0 20px color-mix(in srgb, var(--type-color) 15%, transparent),
      inset 0 1px 0 var(--theme-card-bg);
    transform: translateY(-1px);
  }

  .feedback-card.selected {
    border-color: var(--type-color);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--type-color) 30%, transparent),
      0 4px 16px color-mix(in srgb, var(--type-color) 20%, transparent);
  }

  .feedback-card.needs-confirmation {
    background: linear-gradient(
      135deg,
      rgba(245, 158, 11, 0.25) 0%,
      rgba(245, 158, 11, 0.15) 100%
    );
    border-color: rgba(245, 158, 11, 0.5);
    box-shadow:
      0 4px 16px rgba(245, 158, 11, 0.25),
      0 0 0 1px rgba(245, 158, 11, 0.2);
  }

  .feedback-card.needs-confirmation:hover {
    background: linear-gradient(
      135deg,
      rgba(245, 158, 11, 0.32) 0%,
      rgba(245, 158, 11, 0.22) 100%
    );
    border-color: rgba(245, 158, 11, 0.6);
    box-shadow:
      0 6px 20px rgba(245, 158, 11, 0.35),
      0 0 0 1px rgba(245, 158, 11, 0.3);
    transform: translateY(-1px);
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
    font-size: var(--font-size-base);
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
    color: var(--theme-text);
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
    font-size: var(--font-size-compact, 0.75rem); /* Supplementary badge */
    font-weight: 500;
    color: var(--badge-color);
    white-space: nowrap;
    box-shadow: 0 2px 6px color-mix(in srgb, var(--badge-color) 20%, black);
  }

  .status-badge i {
    font-size: 0.75rem; /* Icon minimum */
  }

  .card-description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Screenshot indicator */
  .screenshot-indicator {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
    font-size: var(--font-size-compact, 0.75rem); /* Supplementary text */
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .screenshot-indicator i {
    font-size: 0.75rem; /* Icon minimum */
    color: var(--type-color);
  }

  .card-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 4px;
    font-size: 0.75rem;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 80%,
      transparent
    );
  }

  .has-response {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--theme-accent, var(--semantic-info));
  }

  .has-response i {
    font-size: 0.75rem; /* Icon minimum */
  }

  /* Selection indicator */
  .selection-indicator {
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 8px;
    width: 3px;
    background: var(--theme-accent, var(--semantic-info));
    border-radius: 0 2px 2px 0;
  }
</style>
