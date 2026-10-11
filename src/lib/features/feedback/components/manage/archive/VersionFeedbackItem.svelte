<!-- VersionFeedbackItem - Compact feedback item row within a version group -->
<script lang="ts">
  import type { VersionFeedbackItem as VersionFeedbackItemType } from "#lib/shared/feedback/domain/models/version-models.js";
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
    item: VersionFeedbackItemType;
    onclick: () => void;
  }>();

  const typeConfig = $derived(
    TYPE_CONFIG[item.type as FeedbackType] || DEFAULT_TYPE_CONFIG
  );
</script>

<button type="button" class="feedback-item" {onclick}>
  <div class="item-icon" style="--type-color: {typeConfig.color}">
    <i class="fas {typeConfig.icon}" aria-hidden="true"></i>
  </div>
  <div class="item-content">
    <span class="item-title">{item.title}</span>
    <span class="item-description">{item.description}</span>
  </div>
  <i class="fas fa-chevron-right item-arrow" aria-hidden="true"></i>
</button>

<style>
  .feedback-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 10px 12px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 80%,
      transparent
    );
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-normal);
    text-align: left;
  }

  .feedback-item:hover {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg) 90%,
      transparent
    );
    border-color: var(--theme-stroke, var(--theme-stroke));
  }

  .feedback-item:active {
    transform: scale(0.99);
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

  .item-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .item-title {
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text, var(--theme-text));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-description {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-arrow {
    color: color-mix(
      in srgb,
      var(--theme-text-dim, var(--theme-text-dim)) 60%,
      transparent
    );
    font-size: var(--font-size-compact);
    flex-shrink: 0;
    transition: transform var(--duration-normal);
  }

  .feedback-item:hover .item-arrow {
    color: var(--theme-text-dim);
    transform: translateX(2px);
  }
</style>
