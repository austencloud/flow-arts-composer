<!-- VersionGroup - Expandable version accordion with feedback items -->
<script lang="ts">
  import type { VersionFeedbackItem as VersionFeedbackItemType } from "#lib/shared/feedback/domain/models/version-models.js";
  import type { AppVersion } from "#lib/shared/feedback/domain/models/version-models.js";
  import VersionFeedbackItem from "./VersionFeedbackItem.svelte";

  const {
    version,
    isExpanded,
    isLoading,
    feedbackItems,
    onToggle,
    onItemClick,
    onEditRelease,
  } = $props<{
    version: AppVersion;
    isExpanded: boolean;
    isLoading: boolean;
    feedbackItems: VersionFeedbackItemType[];
    onToggle: () => void;
    onItemClick: (itemId: string) => void;
    onEditRelease?: () => void;
  }>();

  const formattedDate = $derived(
    version.releasedAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  );
</script>

<div class="version-group" class:expanded={isExpanded}>
  <button type="button" class="version-header" onclick={onToggle}>
    <div class="version-info">
      <span class="version-number">v{version.version}</span>
      <span class="version-date">{formattedDate}</span>
    </div>
    <div class="version-summary">
      {#if version.feedbackSummary.bugs > 0}
        <span class="summary-badge bug">
          <i class="fas fa-bug" aria-hidden="true"></i>
          {version.feedbackSummary.bugs}
        </span>
      {/if}
      {#if version.feedbackSummary.features > 0}
        <span class="summary-badge feature">
          <i class="fas fa-lightbulb" aria-hidden="true"></i>
          {version.feedbackSummary.features}
        </span>
      {/if}
      {#if version.feedbackSummary.general > 0}
        <span class="summary-badge general">
          <i class="fas fa-comment" aria-hidden="true"></i>
          {version.feedbackSummary.general}
        </span>
      {/if}
    </div>
    <i
      class="fas fa-chevron-{isExpanded ? 'up' : 'down'} expand-icon"
      aria-hidden="true"
    ></i>
  </button>

  {#if isExpanded}
    <div class="version-items">
      {#if onEditRelease}
        <button type="button" class="edit-release-btn" onclick={onEditRelease}>
          <i class="fas fa-pen" aria-hidden="true"></i>
          Edit Release Notes & Contributors
        </button>
      {/if}

      {#if isLoading}
        <div class="items-loading">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Loading feedback items...
        </div>
      {:else if feedbackItems.length === 0}
        <div class="items-empty">No feedback items in this release.</div>
      {:else}
        {#each feedbackItems as item (item.id)}
          <VersionFeedbackItem {item} onclick={() => onItemClick(item.id)} />
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .version-group {
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    overflow: hidden;
    transition: all var(--duration-normal);
  }

  .version-group.expanded {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .version-header {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 16px;
    background: transparent;
    border: none;
    color: var(--theme-text, var(--theme-text));
    cursor: pointer;
    transition: background var(--duration-normal);
  }

  .version-header:hover {
    background: var(--theme-card-bg);
  }

  .version-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
  }

  .version-number {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  .version-date {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .version-summary {
    display: flex;
    gap: 8px;
    flex: 1;
    justify-content: flex-end;
  }

  .summary-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: var(--font-size-compact);
    font-weight: 500;
  }

  .summary-badge.bug {
    background: rgba(239, 68, 68, 0.15);
    color: var(--semantic-error);
  }

  .summary-badge.feature {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
  }

  .summary-badge.general {
    background: rgba(59, 130, 246, 0.15);
    color: var(--semantic-info);
  }

  .expand-icon {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    transition: transform var(--duration-normal);
  }

  .version-items {
    border-top: 1px solid var(--theme-stroke);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .items-loading,
  .items-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
  }

  .edit-release-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-radius: 8px;
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .edit-release-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 35%, transparent);
  }
</style>
