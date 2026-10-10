<!--
  SavedSessionItem - Voice Session Preview Card

  Displays a saved voice session in the list view.
  Shows relative time, duration, event count, success rate, and tier breakdown.
  Hover-reveal delete button.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { VoiceSessionPreview } from "#lib/shared/voice-control/domain/voice-session-types.js";
  import type { ResolutionTier } from "#lib/shared/voice-control/domain/voice-session-types.js";

  let {
    preview,
    isSelected = false,
    onSelect,
    onDelete,
  }: {
    preview: VoiceSessionPreview;
    isSelected?: boolean;
    onSelect: () => void;
    onDelete: () => void;
  } = $props();

  function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t('voice_sessions_just_now');
    if (diffMins < 60) return t('voice_sessions_minutes_ago', { count: String(diffMins) });
    if (diffHours < 24) return t('voice_sessions_hours_ago', { count: String(diffHours) });
    if (diffDays < 7) return t('voice_sessions_days_ago', { count: String(diffDays) });

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  function successRate(stats: VoiceSessionPreview["stats"]): string {
    if (stats.totalEvents === 0) return "0%";
    return `${Math.round((stats.successCount / stats.totalEvents) * 100)}%`;
  }

  function handleDeleteClick(e: MouseEvent) {
    e.stopPropagation();
    onDelete();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  const tierColors: Record<ResolutionTier, string> = {
    tier1_regex: "var(--semantic-success, #22c55e)",
    tier2_llm: "var(--semantic-info, #3b82f6)",
    tier3_chat: "var(--semantic-warning, #f59e0b)",
    unresolved: "var(--semantic-error, #ef4444)",
  };

  const tierLabels: Record<ResolutionTier, string> = {
    tier1_regex: "T1",
    tier2_llm: "T2",
    tier3_chat: "T3",
    unresolved: "?",
  };

  let tierDots = $derived(
    (Object.entries(preview.stats.tierBreakdown) as [ResolutionTier, number][])
      .filter(([, count]) => count > 0)
  );
</script>

<div
  class="session-item"
  class:selected={isSelected}
  role="button"
  tabindex="0"
  onclick={onSelect}
  onkeydown={handleKeydown}
  aria-label={`Voice session from ${formatRelativeTime(preview.startedAt)}`}
>
  <div class="item-content">
    <div class="item-header">
      <span class="item-time">{formatRelativeTime(preview.startedAt)}</span>
      <span class="item-duration">{formatDuration(preview.durationMs)}</span>
    </div>
    <div class="item-meta">
      <span class="event-count">{t('voice_sessions_event_count', { count: String(preview.stats.totalEvents) })}</span>
      <span class="separator">·</span>
      <span class="success-rate" style="color: {preview.stats.successCount === preview.stats.totalEvents ? 'var(--semantic-success, #22c55e)' : preview.stats.unresolvedCount > 0 ? 'var(--semantic-warning, #f59e0b)' : 'var(--theme-text-muted, #94a3b8)'}">{successRate(preview.stats)}</span>
    </div>
    {#if tierDots.length > 0}
      <div class="tier-dots">
        {#each tierDots as [tier, count]}
          <span
            class="tier-dot"
            style="background: {tierColors[tier]}"
            title="{tierLabels[tier]}: {count}"
          >{tierLabels[tier]} {count}</span>
        {/each}
      </div>
    {/if}
  </div>

  <button
    class="delete-btn"
    onclick={handleDeleteClick}
    title={t('voice_sessions_delete_session')}
    aria-label={t('voice_sessions_delete_session')}
  >
    <i class="fas fa-times" aria-hidden="true"></i>
  </button>
</div>

<style>
  .session-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .session-item:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .session-item:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .session-item.selected {
    border-color: var(--theme-accent, #6366f1);
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
  }

  .item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .item-time {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
  }

  .item-duration {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-family: monospace;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .separator {
    opacity: 0.5;
  }

  .success-rate {
    font-weight: 600;
    font-family: monospace;
  }

  .tier-dots {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .tier-dot {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1.4;
  }

  .delete-btn {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
  }

  .session-item:hover .delete-btn,
  .delete-btn:focus-visible {
    opacity: 1;
  }

  .delete-btn:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .delete-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .session-item,
    .delete-btn {
      transition: none;
    }
  }
</style>
