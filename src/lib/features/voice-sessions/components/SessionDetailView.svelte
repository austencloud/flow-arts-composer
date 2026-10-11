<!--
  SessionDetailView - Expanded view of a single voice session

  Shows stats summary, event timeline with tier badges and latency,
  "Copy for AI", "Replay", and "Delete" actions.
  Replay re-runs transcripts through the current interpreter to detect regressions.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { VoiceSession, VoiceSessionEvent, ResolutionTier } from "#lib/shared/voice-control/domain/voice-session-types.js";
  import type * as VoiceSessionFormatterModule from "#lib/features/voice-sessions/services/voice-session-formatter.js";
  import type { VoiceSessionReplayer } from "#lib/features/voice-sessions/services/voice-session-replayer.js";
  import type { ReplayResult, ReplayDiffType } from "#lib/features/voice-sessions/domain/replay-types.js";

  let {
    session,
    formatter,
    replayer = null,
    onClose,
    onDelete,
  }: {
    session: VoiceSession;
    formatter: typeof VoiceSessionFormatterModule;
    replayer?: VoiceSessionReplayer | null;
    onClose: () => void;
    onDelete: () => void;
  } = $props();

  let copySuccess = $state(false);
  let replayResult = $state<ReplayResult | null>(null);
  let replaying = $state(false);
  let showReplayDiff = $state(false);

  function runReplay() {
    if (!replayer) return;
    replaying = true;
    try {
      replayResult = replayer.replaySession(session);
      showReplayDiff = true;
    } finally {
      replaying = false;
    }
  }

  function closeReplay() {
    showReplayDiff = false;
  }

  const diffColors: Record<ReplayDiffType, string> = {
    SAME: "var(--theme-text-muted, #64748b)",
    IMPROVED: "var(--semantic-success, #22c55e)",
    REGRESSED: "var(--semantic-error, #ef4444)",
    CHANGED: "var(--semantic-warning, #f59e0b)",
  };

  const diffLabels: Record<ReplayDiffType, string> = {
    SAME: t('voice_sessions_diff_same'),
    IMPROVED: t('voice_sessions_diff_improved'),
    REGRESSED: t('voice_sessions_diff_regressed'),
    CHANGED: t('voice_sessions_diff_changed'),
  };

  const diffIcons: Record<ReplayDiffType, string> = {
    SAME: "fa-equals",
    IMPROVED: "fa-arrow-up",
    REGRESSED: "fa-arrow-down",
    CHANGED: "fa-exchange-alt",
  };

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  function successRate(): string {
    if (session.stats.totalEvents === 0) return "0%";
    return `${Math.round((session.stats.successCount / session.stats.totalEvents) * 100)}%`;
  }

  async function copyForAI() {
    const markdown = formatter.formatForAnalysis(session);
    try {
      await navigator.clipboard.writeText(markdown);
      copySuccess = true;
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }

  function formatEventOffset(ms: number): string {
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `+${secs}s`;
    return `+${Math.floor(secs / 60)}m${secs % 60}s`;
  }

  function eventIcon(event: VoiceSessionEvent): string {
    if (event.tier === "unresolved") return "fa-question-circle";
    if (event.dispatchResult?.success === false) return "fa-times-circle";
    return "fa-check-circle";
  }

  function eventColor(event: VoiceSessionEvent): string {
    if (event.tier === "unresolved") return "var(--semantic-warning, #f59e0b)";
    if (event.dispatchResult?.success === false) return "var(--semantic-error, #ef4444)";
    return "var(--semantic-success, #22c55e)";
  }

  const tierColors: Record<ResolutionTier, string> = {
    tier1_regex: "var(--semantic-success, #22c55e)",
    tier2_llm: "var(--theme-accent, #3b82f6)",
    tier3_chat: "var(--semantic-warning, #f59e0b)",
    unresolved: "var(--semantic-error, #ef4444)",
  };

  const tierLabels: Record<ResolutionTier, string> = {
    tier1_regex: "Regex",
    tier2_llm: "LLM",
    tier3_chat: "Chat",
    unresolved: "None",
  };
</script>

<div class="detail-view">
  <div class="detail-header">
    <button class="back-btn" onclick={onClose} aria-label={t('voice_sessions_back')}>
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      {t('voice_sessions_back')}
    </button>
    <span class="detail-title">
      {session.startedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at {session.startedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
    </span>
  </div>

  <!-- Stats Summary -->
  <div class="stats-grid">
    <div class="stat-cell">
      <span class="stat-value">{session.stats.totalEvents}</span>
      <span class="stat-label">{t('voice_sessions_events')}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-value" style="color: var(--semantic-success, #22c55e)">{successRate()}</span>
      <span class="stat-label">{t('voice_sessions_success')}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-value">{formatDuration(session.durationMs)}</span>
      <span class="stat-label">{t('voice_sessions_duration')}</span>
    </div>
    <div class="stat-cell">
      <span class="stat-value">{Math.round(session.stats.avgLatencyMs)}ms</span>
      <span class="stat-label">{t('voice_sessions_avg_latency')}</span>
    </div>
  </div>

  <!-- Tier Breakdown -->
  <div class="tier-breakdown">
    {#each Object.entries(session.stats.tierBreakdown) as [tier, count]}
      {#if count > 0}
        <div class="tier-row">
          <span class="tier-badge" style="background: {tierColors[tier as ResolutionTier]}">{tierLabels[tier as ResolutionTier]}</span>
          <span class="tier-count">{count}</span>
          {#if session.stats.avgLatencyByTier[tier as ResolutionTier]}
            <span class="tier-latency">{Math.round(session.stats.avgLatencyByTier[tier as ResolutionTier]!)}ms avg</span>
          {/if}
        </div>
      {/if}
    {/each}
  </div>

  <!-- Event Timeline -->
  <div class="timeline-header">
    <h3>{t('voice_sessions_events')}</h3>
  </div>
  <div class="timeline themed-scrollbar">
    {#each session.events as event}
      <div class="timeline-event">
        <div class="event-header">
          <i class="fas {eventIcon(event)}" style="color: {eventColor(event)}" aria-hidden="true"></i>
          <span class="event-transcript">"{event.transcript}"</span>
          <span class="event-offset">{formatEventOffset(event.offsetMs)}</span>
        </div>
        <div class="event-details">
          <span class="tier-badge small" style="background: {tierColors[event.tier]}">{tierLabels[event.tier]}</span>
          {#if event.interpretedCommand}
            <span class="event-command">{event.interpretedCommand.category}:{event.interpretedCommand.action}</span>
          {/if}
          <span class="event-latency">{event.latencyMs}ms</span>
        </div>
        {#if event.dispatchResult?.message}
          <div class="event-result">{event.dispatchResult.message}</div>
        {/if}
      </div>
    {/each}
    {#if session.events.length === 0}
      <div class="empty-timeline">{t('voice_sessions_no_events')}</div>
    {/if}
  </div>

  <!-- Replay Diff View -->
  {#if showReplayDiff && replayResult}
    <div class="replay-section" role="region" aria-label="Replay results">
      <span class="sr-only" role="status" aria-live="polite">
        {#if replaying}Replaying session...{:else if replayResult}Replay complete: {replayResult.summary.regressedCount} regressions, {replayResult.summary.improvedCount} improvements{/if}
      </span>
      <div class="replay-header">
        <h3>{t('voice_sessions_replay_results')}</h3>
        <button class="close-replay-btn" onclick={closeReplay} aria-label={t('voice_sessions_close_replay')}>
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>

      <!-- Replay Summary -->
      <div class="replay-summary">
        <div class="replay-stat">
          <span class="replay-stat-value" style="color: var(--theme-text-muted, #64748b)">{replayResult.summary.sameCount}</span>
          <span class="replay-stat-label">Same</span>
        </div>
        <div class="replay-stat">
          <span class="replay-stat-value" style="color: var(--semantic-success, #22c55e)">{replayResult.summary.improvedCount}</span>
          <span class="replay-stat-label">Improved</span>
        </div>
        <div class="replay-stat">
          <span class="replay-stat-value" style="color: var(--semantic-error, #ef4444)">{replayResult.summary.regressedCount}</span>
          <span class="replay-stat-label">Regressed</span>
        </div>
        <div class="replay-stat">
          <span class="replay-stat-value" style="color: var(--semantic-warning, #f59e0b)">{replayResult.summary.changedCount}</span>
          <span class="replay-stat-label">Changed</span>
        </div>
      </div>

      <!-- Per-Event Diff -->
      <div class="replay-diff themed-scrollbar">
        {#each replayResult.comparisons as comparison}
          <div class="diff-event" style="border-left-color: {diffColors[comparison.diff]}">
            <div class="diff-header">
              <i class="fas {diffIcons[comparison.diff]}" style="color: {diffColors[comparison.diff]}" aria-hidden="true"></i>
              <span class="diff-transcript">"{comparison.transcript}"</span>
              <span class="diff-badge" style="background: {diffColors[comparison.diff]}">{diffLabels[comparison.diff]}</span>
            </div>

            {#if comparison.diff !== "SAME"}
              <div class="diff-comparison">
                <div class="diff-side original">
                  <span class="diff-side-label">{t('voice_sessions_original')}</span>
                  <span class="tier-badge small" style="background: {tierColors[comparison.originalTier]}">{tierLabels[comparison.originalTier]}</span>
                  {#if comparison.originalCommand}
                    <span class="diff-command">{comparison.originalCommand.category}:{comparison.originalCommand.action}({comparison.originalCommand.target})</span>
                  {:else}
                    <span class="diff-command muted">(unresolved)</span>
                  {/if}
                </div>
                <div class="diff-side current">
                  <span class="diff-side-label">{t('voice_sessions_current')}</span>
                  <span class="tier-badge small" style="background: {tierColors[comparison.currentTier]}">{tierLabels[comparison.currentTier]}</span>
                  {#if comparison.currentCommand}
                    <span class="diff-command">{comparison.currentCommand.category}:{comparison.currentCommand.action}({comparison.currentCommand.target})</span>
                  {:else}
                    <span class="diff-command muted">(unresolved)</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Actions -->
  <div class="detail-actions">
    <button class="action-btn copy" onclick={copyForAI} disabled={copySuccess}>
      <i class="fas {copySuccess ? 'fa-check' : 'fa-copy'}" aria-hidden="true"></i>
      {copySuccess ? t('voice_sessions_copied') : t('voice_sessions_copy_for_ai')}
    </button>
    {#if replayer}
      <button class="action-btn replay" onclick={runReplay} disabled={replaying}>
        <i class="fas {replaying ? 'fa-spinner fa-spin' : 'fa-redo'}" aria-hidden="true"></i>
        {replaying ? t('voice_sessions_replaying') : showReplayDiff ? t('voice_sessions_rerun') : t('voice_sessions_replay')}
      </button>
    {/if}
    <button class="action-btn delete" onclick={onDelete}>
      <i class="fas fa-trash" aria-hidden="true"></i>
      {t('voice_sessions_delete')}
    </button>
  </div>
</div>

<style>
  .detail-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .back-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--theme-text, white);
  }

  .detail-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, white);
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .stat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .stat-value {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, white);
    font-family: monospace;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* Tier Breakdown */
  .tier-breakdown {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tier-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
  }

  .tier-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    color: rgba(0, 0, 0, 0.8);
    min-width: 40px;
    text-align: center;
  }

  .tier-badge.small {
    font-size: var(--font-size-compact, 12px);
    padding: 1px 4px;
    min-width: 32px;
  }

  .tier-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, white);
    font-family: monospace;
  }

  .tier-latency {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-family: monospace;
  }

  /* Timeline */
  .timeline-header h3 {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .timeline {
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .timeline-event {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
  }

  .event-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .event-transcript {
    flex: 1;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, white);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .event-offset {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-family: monospace;
    flex-shrink: 0;
  }

  .event-details {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 22px;
  }

  .event-command {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-family: monospace;
  }

  .event-latency {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-family: monospace;
    margin-left: auto;
  }

  .event-result {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    padding-left: 22px;
  }

  .empty-timeline {
    text-align: center;
    padding: 16px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
  }

  /* Actions */
  .detail-actions {
    display: flex;
    gap: 8px;
    padding-top: 4px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn.copy {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, white);
  }

  .action-btn.copy:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .action-btn.copy:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .action-btn.delete {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .action-btn.delete:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Replay Section */
  .replay-section {
    background: rgba(0, 0, 0, 0.15);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 12px;
  }

  .replay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .replay-header h3 {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .close-replay-btn {
    background: transparent;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    padding: 4px;
    font-size: 12px;
  }

  .close-replay-btn:hover {
    color: var(--theme-text, white);
  }

  .replay-summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    margin-bottom: 10px;
  }

  .replay-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 4px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .replay-stat-value {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    font-family: monospace;
  }

  .replay-stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
  }

  .replay-diff {
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .diff-event {
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
    border-left: 3px solid transparent;
  }

  .diff-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .diff-header i {
    font-size: 10px;
    flex-shrink: 0;
  }

  .diff-transcript {
    flex: 1;
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    color: rgba(0, 0, 0, 0.8);
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .diff-comparison {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0 0 18px;
  }

  .diff-side {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .diff-side-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    width: 48px;
    flex-shrink: 0;
  }

  .diff-command {
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .diff-command.muted {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
    font-style: italic;
  }

  .action-btn.replay {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
    color: var(--semantic-info, #3b82f6);
  }

  .action-btn.replay:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
  }

  .action-btn.replay:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (max-width: 600px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .replay-summary {
      grid-template-columns: repeat(2, 1fr);
    }

    .detail-actions {
      flex-direction: column;
    }

    .action-btn {
      justify-content: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn,
    .action-btn {
      transition: none;
    }
  }
</style>
