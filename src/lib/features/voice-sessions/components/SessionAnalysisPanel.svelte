<!--
  SessionAnalysisPanel - Cross-session pattern analysis display

  Loads full sessions from the repository, runs the VoiceSessionAnalyzer,
  and displays actionable insights: failing transcripts, T2 promotion
  candidates, latency stats, and success rate trends.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type * as VoiceSessionRepositoryModule from "#lib/shared/voice-sessions/services/voice-session-repository.js";
  import type * as VoiceSessionAnalyzerModule from "#lib/features/voice-sessions/services/voice-session-analyzer.js";
  import type { SessionAnalysis } from "#lib/features/voice-sessions/services/types.js";
  import type { VoiceSession, ResolutionTier } from "#lib/shared/voice-control/domain/voice-session-types.js";

  let {
    repository,
    analyzer,
  }: {
    repository: typeof VoiceSessionRepositoryModule;
    analyzer: typeof VoiceSessionAnalyzerModule;
  } = $props();

  let analysis = $state<SessionAnalysis | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let collapsed = $state(true);

  async function runAnalysis() {
    loading = true;
    error = null;
    try {
      // Fetch previews first to get IDs, then load full sessions
      const previews = await repository.listSessions({ sortDirection: "desc", limit: 50 });
      const fullSessions: VoiceSession[] = [];

      for (const preview of previews) {
        const session = await repository.getSession(preview.id);
        if (session) fullSessions.push(session);
      }

      analysis = analyzer.analyzeSessions(fullSessions);
    } catch (e) {
      error = e instanceof Error ? e.message : "Analysis failed";
    } finally {
      loading = false;
    }
  }

  function tierLabel(tier: ResolutionTier): string {
    switch (tier) {
      case "tier1_regex": return "T1 Regex";
      case "tier2_llm": return "T2 LLM";
      case "tier3_chat": return "T3 Chat";
      case "unresolved": return "Unresolved";
    }
  }

  function tierColorClass(tier: ResolutionTier): string {
    switch (tier) {
      case "tier1_regex": return "tier-1";
      case "tier2_llm": return "tier-2";
      case "tier3_chat": return "tier-3";
      case "unresolved": return "tier-unresolved";
    }
  }
</script>

<section class="analysis-section">
  <button class="section-header" onclick={() => { collapsed = !collapsed; if (!collapsed && !analysis && !loading) runAnalysis(); }} aria-expanded={!collapsed} aria-label={collapsed ? t('voice_sessions_expand_analysis') : t('voice_sessions_collapse_analysis')}>
    <h2>
      {t('voice_sessions_pattern_analysis')}
      {#if analysis}
        <span class="count-badge">{t('voice_sessions_session_count', { count: String(analysis.sessionCount) })}</span>
      {/if}
    </h2>
    <i class="fas {collapsed ? 'fa-chevron-right' : 'fa-chevron-down'}" aria-hidden="true"></i>
  </button>

  {#if !collapsed}
    <div class="section-content">
      {#if loading}
        <div class="state-message">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>{t('voice_sessions_analyzing')}</span>
        </div>
      {:else if error}
        <div class="state-message error-state">
          <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
          <span>{error}</span>
          <button class="action-btn" onclick={runAnalysis}>{t('voice_sessions_retry')}</button>
        </div>
      {:else if analysis}
        <div class="analysis-results">
          <!-- Overview -->
          <div class="overview-row">
            <div class="overview-stat">
              <span class="stat-value">{analysis.sessionCount}</span>
              <span class="stat-label">{t('voice_sessions_sessions')}</span>
            </div>
            <div class="overview-stat">
              <span class="stat-value">{analysis.totalEvents}</span>
              <span class="stat-label">{t('voice_sessions_events')}</span>
            </div>
            <div class="overview-stat">
              <span class="stat-value">{analysis.tier2Candidates.length}</span>
              <span class="stat-label">{t('voice_sessions_t2_candidates')}</span>
            </div>
            <div class="overview-stat">
              <span class="stat-value">{analysis.unresolvedPatterns.length}</span>
              <span class="stat-label">{t('voice_sessions_unresolved')}</span>
            </div>
          </div>

          <!-- T2 Promotion Candidates -->
          {#if analysis.tier2Candidates.length > 0}
            <div class="insight-group">
              <h3>{t('voice_sessions_t2_promotion')}</h3>
              <p class="insight-desc">{t('voice_sessions_t2_promotion_desc')}</p>
              {#each analysis.tier2Candidates as candidate}
                <div class="insight-card candidate">
                  <div class="insight-main">
                    <span class="transcript">"{candidate.transcript}"</span>
                    <span class="arrow">-></span>
                    <span class="command">{candidate.resolvedCategory}:{candidate.resolvedAction}({candidate.resolvedTarget})</span>
                  </div>
                  <div class="insight-meta">
                    <span class="hit-count">{candidate.consistentHits} hits</span>
                    <span class="confidence">avg {Math.round(candidate.avgConfidence * 100)}% conf</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Top Failing Transcripts -->
          {#if analysis.topFailingTranscripts.length > 0}
            <div class="insight-group">
              <h3>{t('voice_sessions_top_failures')}</h3>
              <p class="insight-desc">{t('voice_sessions_top_failures_desc')}</p>
              {#each analysis.topFailingTranscripts.slice(0, 10) as failure}
                <div class="insight-card failure">
                  <div class="insight-main">
                    <span class="transcript">"{failure.transcript}"</span>
                    <span class="occurrence-count">{failure.occurrences}x</span>
                  </div>
                  <div class="insight-meta">
                    {#each failure.tierHistory.slice(0, 5) as tier}
                      <span class="tier-chip {tierColorClass(tier)}">{tierLabel(tier)}</span>
                    {/each}
                    {#if failure.tierHistory.length > 5}
                      <span class="more">+{failure.tierHistory.length - 5}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <!-- Latency by Tier -->
          {#if analysis.latencyByTier.length > 0}
            <div class="insight-group">
              <h3>{t('voice_sessions_latency_by_tier')}</h3>
              <div class="latency-grid">
                {#each analysis.latencyByTier as latency}
                  <div class="latency-card">
                    <span class="tier-chip {tierColorClass(latency.tier)}">{tierLabel(latency.tier)}</span>
                    <div class="latency-stats">
                      <span class="latency-avg">{latency.avgMs}ms avg</span>
                      <span class="latency-range">{latency.minMs}-{latency.maxMs}ms</span>
                      <span class="latency-samples">{latency.sampleCount} samples</span>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Success Rate Trend -->
          {#if analysis.successRateTrend.length > 1}
            <div class="insight-group">
              <h3>{t('voice_sessions_success_trend')}</h3>
              <div class="trend-list">
                {#each analysis.successRateTrend as point}
                  <div class="trend-row">
                    <span class="trend-date">{point.date.toLocaleDateString()}</span>
                    <div class="trend-bar-container">
                      <div class="trend-bar" style="width: {point.successRate * 100}%"></div>
                    </div>
                    <span class="trend-rate">{Math.round(point.successRate * 100)}%</span>
                    <span class="trend-events">{point.totalEvents}ev</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Unresolved Patterns -->
          {#if analysis.unresolvedPatterns.length > 0}
            <div class="insight-group">
              <h3>{t('voice_sessions_unresolved_patterns')}</h3>
              <p class="insight-desc">{t('voice_sessions_unresolved_desc')}</p>
              {#each analysis.unresolvedPatterns.slice(0, 8) as pattern}
                <div class="insight-card unresolved">
                  <div class="insight-main">
                    <span class="transcript">"{pattern.transcript}"</span>
                    <span class="occurrence-count">{pattern.occurrences}x</span>
                  </div>
                  <div class="insight-meta">
                    <span class="context-chip">{pattern.primaryContext.module}/{pattern.primaryContext.tab}</span>
                  </div>
                </div>
              {/each}
            </div>
          {/if}

          <button class="action-btn refresh-btn" onclick={runAnalysis}>
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            {t('voice_sessions_reanalyze')}
          </button>
        </div>
      {:else}
        <div class="state-message">
          <i class="fas fa-chart-bar" aria-hidden="true"></i>
          <span>{t('voice_sessions_click_to_analyze')}</span>
          <button class="action-btn" onclick={runAnalysis}>{t('voice_sessions_run_analysis')}</button>
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .analysis-section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .section-header h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    color: inherit;
  }

  .section-header i {
    font-size: 12px;
    transition: transform 0.15s ease;
  }

  .count-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--theme-accent, #6366f1);
    color: white;
    text-transform: none;
    letter-spacing: 0;
  }

  .section-content {
    margin-top: 12px;
  }

  /* State Messages */
  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    text-align: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
  }

  .state-message i {
    font-size: 20px;
    opacity: 0.6;
  }

  .error-state {
    color: var(--semantic-error, #ef4444);
  }

  /* Overview */
  .overview-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }

  .overview-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text, white);
    font-family: monospace;
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-top: 2px;
  }

  /* Insight Groups */
  .insight-group {
    margin-bottom: 16px;
  }

  .insight-group h3 {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    margin: 0 0 4px;
  }

  .insight-desc {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin: 0 0 8px;
  }

  /* Insight Cards */
  .insight-card {
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    margin-bottom: 4px;
    border-left: 3px solid transparent;
  }

  .insight-card.candidate {
    border-left-color: var(--semantic-info, #3b82f6);
  }

  .insight-card.failure {
    border-left-color: var(--semantic-error, #ef4444);
  }

  .insight-card.unresolved {
    border-left-color: var(--semantic-warning, #f59e0b);
  }

  .insight-main {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .transcript {
    color: var(--theme-text, white);
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }

  .arrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
  }

  .command {
    color: var(--semantic-info, #3b82f6);
    font-family: monospace;
    font-size: var(--font-size-compact, 12px);
  }

  .occurrence-count {
    margin-left: auto;
    font-weight: 700;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
  }

  .insight-meta {
    display: flex;
    gap: 4px;
    margin-top: 4px;
    flex-wrap: wrap;
    align-items: center;
  }

  .hit-count, .confidence {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-family: monospace;
  }

  /* Tier Chips */
  .tier-chip {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .tier-chip.tier-1 {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 20%, transparent);
    color: color-mix(in srgb, var(--semantic-success, #22c55e) 70%, white);
  }
  .tier-chip.tier-2 {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 20%, transparent);
    color: color-mix(in srgb, var(--semantic-info, #3b82f6) 70%, white);
  }
  .tier-chip.tier-3 {
    background: color-mix(in srgb, var(--theme-accent, #c084fc) 20%, transparent);
    color: color-mix(in srgb, var(--theme-accent, #c084fc) 70%, white);
  }
  .tier-chip.tier-unresolved {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, white);
  }

  .more {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .context-chip {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-family: monospace;
  }

  /* Latency */
  .latency-grid {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .latency-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
  }

  .latency-stats {
    display: flex;
    gap: 12px;
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .latency-avg {
    color: var(--theme-text, white);
    font-weight: 600;
  }

  .latency-range, .latency-samples {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* Trend */
  .trend-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .trend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
  }

  .trend-date {
    width: 80px;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .trend-bar-container {
    flex: 1;
    height: 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    overflow: hidden;
  }

  .trend-bar {
    height: 100%;
    background: var(--semantic-success, #22c55e);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .trend-rate {
    width: 36px;
    text-align: right;
    color: var(--theme-text, white);
    font-weight: 600;
  }

  .trend-events {
    width: 40px;
    text-align: right;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* Action Button */
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .refresh-btn {
    margin-top: 8px;
  }

  @media (max-width: 600px) {
    .overview-row {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .section-header i,
    .action-btn,
    .trend-bar {
      transition: none;
    }
  }
</style>
