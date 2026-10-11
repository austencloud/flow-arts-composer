<!-- ArchivedItemCard - Card display for archived feedback item in "All Items" view -->
<script lang="ts">
  import type { FeedbackItem } from "#lib/shared/feedback/domain/models/feedback-models.js";
  import {
    TYPE_CONFIG,
    type FeedbackType,
  } from "#lib/shared/feedback/domain/models/feedback-models.js";

  const DEFAULT_TYPE_CONFIG = {
    label: "Unknown",
    color: "#6b7280",
    icon: "fa-question-circle",
    placeholder: "",
  };

  const { item, onclick } = $props<{
    item: FeedbackItem;
    onclick: () => void;
  }>();

  const typeConfig = $derived(
    TYPE_CONFIG[item.type as FeedbackType] || DEFAULT_TYPE_CONFIG
  );

  const formattedDate = $derived(
    item.archivedAt
      ? item.archivedAt.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Unknown date"
  );
</script>

<button type="button" class="feedback-item-card" {onclick}>
  <div class="item-header">
    <div class="item-icon" style="--type-color: {typeConfig.color}">
      <i class="fas {typeConfig.icon}" aria-hidden="true"></i>
    </div>
    <div class="item-meta">
      <span class="item-type" style="color: {typeConfig.color}">
        {typeConfig.label}
      </span>
      {#if item.priority}
        <span class="item-priority priority-{item.priority}">
          {item.priority}
        </span>
      {/if}
    </div>
  </div>
  <div class="item-content">
    <h3 class="item-title">{item.title}</h3>
    <p class="item-description">{item.description}</p>
  </div>
  <div class="item-footer">
    <span class="item-date">
      <i class="fas fa-archive" aria-hidden="true"></i>
      {formattedDate}
    </span>
    {#if item.fixedInVersion}
      <span class="item-version">
        <i class="fas fa-tag" aria-hidden="true"></i>
        v{item.fixedInVersion}
      </span>
    {/if}
  </div>
  <i class="fas fa-chevron-right item-arrow" aria-hidden="true"></i>
</button>

<style>
  .feedback-item-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    text-align: left;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .feedback-item-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
    transform: translateY(-1px);
  }

  .item-arrow {
    position: absolute;
    top: 16px;
    right: 16px;
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 60%,
      transparent
    );
    font-size: var(--font-size-compact);
    transition: transform var(--duration-normal);
  }

  .feedback-item-card:hover .item-arrow {
    color: var(--theme-text-dim);
    transform: translateX(2px);
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border-radius: 6px;
    color: var(--type-color);
    font-size: var(--font-size-compact);
    flex-shrink: 0;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .item-type {
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .item-priority {
    padding: 2px 8px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    border-radius: 4px;
    background: var(--theme-card-hover-bg);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .item-priority.priority-high {
    background: rgba(239, 68, 68, 0.5);
    color: white;
  }

  .item-priority.priority-medium {
    background: rgba(251, 191, 36, 0.5);
    color: white;
  }

  .item-priority.priority-low {
    background: rgba(59, 130, 246, 0.5);
    color: white;
  }

  .item-content {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 24px;
  }

  .item-title {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text));
    line-height: 1.4;
  }

  .item-description {
    margin: 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .item-date,
  .item-version {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .item-version {
    padding: 2px 8px;
    background: rgba(107, 114, 128, 0.2);
    border-radius: 4px;
    color: #9ca3af;
  }

  @media (max-width: 768px) {
    .feedback-item-card {
      padding: 12px;
    }
  }
</style>
