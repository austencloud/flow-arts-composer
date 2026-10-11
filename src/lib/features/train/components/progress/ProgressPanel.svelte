<!--
  ProgressPanel.svelte - Progress Tab

  Displays training statistics, session history, and personal bests.
  Shows an engaging placeholder when no data exists yet.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import { getPerformanceHistoryTracker } from "#lib/features/train/get-performance-history-tracker.js";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type {
    StatsOverview,
    PersonalBest,
  } from "../../services/performance-history-tracker";
  import type { StoredPerformance } from "#lib/shared/train/domain/train-database-models.js";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import StatsOverviewComponent from "./StatsOverview.svelte";
  import PersonalBests from "./PersonalBests.svelte";
  import SessionHistory from "./SessionHistory.svelte";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let isLoading = $state(true);
  let stats = $state<StatsOverview | null>(null);
  let personalBests = $state<PersonalBest[]>([]);
  let recentSessions = $state<StoredPerformance[]>([]);
  const hapticService = getHapticFeedback();
  const historyService = getPerformanceHistoryTracker();

  const hasData = $derived(stats && stats.totalSessions > 0);

  onMount(async () => {
    try {

      const [statsData, bestsData, sessionsData] = await Promise.all([
        historyService.getStatsOverview(),
        historyService.getPersonalBests(),
        historyService.getRecentSessions(10),
      ]);

      stats = statsData;
      personalBests = bestsData;
      recentSessions = sessionsData;
    } catch (error) {
      console.error("[ProgressPanel] Failed to load data:", error);
      showToast(t("train_load_progress_failed"), "error");
    } finally {
      isLoading = false;
    }
  });

  function navigateToPractice() {
    hapticService?.trigger("selection");
    navigationState.setActiveTab("practice");
  }
</script>

<div class="progress-panel">
  {#if isLoading}
    <div class="loading-state">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <p>{t("train_loading_stats")}</p>
    </div>
  {:else if !hasData}
    <!-- EMPTY STATE - Engaging placeholder -->
    <div class="empty-state">
      <!-- Header -->
      <header class="empty-header">
        <div class="header-icon">
          <i class="fas fa-chart-line" aria-hidden="true"></i>
        </div>
        <h1>{t("train_your_journey")}</h1>
        <p>{t("train_journey_subtitle")}</p>
      </header>

      <!-- Preview Stats Grid -->
      <section class="preview-stats">
        <div class="stat-card">
          <div class="stat-icon sessions">
            <i class="fas fa-dumbbell" aria-hidden="true"></i>
          </div>
          <div class="stat-content">
            <span class="stat-value">0</span>
            <span class="stat-label">{t("train_sessions")}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon time">
            <i class="fas fa-clock" aria-hidden="true"></i>
          </div>
          <div class="stat-content">
            <span class="stat-value placeholder">--:--</span>
            <span class="stat-label">{t("train_practice_time")}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon accuracy">
            <i class="fas fa-bullseye" aria-hidden="true"></i>
          </div>
          <div class="stat-content">
            <span class="stat-value placeholder">--%</span>
            <span class="stat-label">{t("train_avg_accuracy")}</span>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon combo">
            <i class="fas fa-fire" aria-hidden="true"></i>
          </div>
          <div class="stat-content">
            <span class="stat-value">0</span>
            <span class="stat-label">{t("train_best_combo")}</span>
          </div>
        </div>
      </section>

      <!-- Preview Sections -->
      <div class="preview-sections">
        <!-- Personal Bests Preview -->
        <section class="preview-section">
          <div class="section-header">
            <i class="fas fa-trophy" aria-hidden="true"></i>
            <h2>{t("train_personal_bests")}</h2>
          </div>
          <div class="empty-rows">
            <div class="empty-row">
              <div class="empty-bar" style="width: 75%"></div>
            </div>
            <div class="empty-row">
              <div class="empty-bar" style="width: 60%"></div>
            </div>
            <div class="empty-row">
              <div class="empty-bar" style="width: 45%"></div>
            </div>
          </div>
          <p class="section-hint">
            {t("train_bests_hint")}
          </p>
        </section>

        <!-- Recent Sessions Preview -->
        <section class="preview-section">
          <div class="section-header">
            <i class="fas fa-history" aria-hidden="true"></i>
            <h2>{t("train_recent_sessions")}</h2>
          </div>
          <div class="empty-rows">
            <div class="empty-row">
              <div class="empty-bar" style="width: 85%"></div>
            </div>
            <div class="empty-row">
              <div class="empty-bar" style="width: 70%"></div>
            </div>
            <div class="empty-row">
              <div class="empty-bar" style="width: 55%"></div>
            </div>
          </div>
          <p class="section-hint">{t("train_sessions_hint")}</p>
        </section>
      </div>

      <!-- CTA -->
      <div class="cta-section">
        <button class="start-btn" onclick={navigateToPractice}>
          <i class="fas fa-play" aria-hidden="true"></i>
          <span>{t("train_start_first_session")}</span>
          <i class="fas fa-arrow-right" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  {:else if stats}
    <!-- HAS DATA - Real content -->
    <div>
      <StatsOverviewComponent {stats} />
    </div>

    {#if personalBests.length > 0}
      <section class="section">
        <h2>{t("train_personal_bests")}</h2>
        <PersonalBests bests={personalBests} />
      </section>
    {/if}

    {#if recentSessions.length > 0}
      <section class="section">
        <h2>{t("train_recent_sessions")}</h2>
        <SessionHistory sessions={recentSessions} />
      </section>
    {/if}
  {/if}
</div>

<style>
  .progress-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 1.5rem;
    background: transparent;
    color: var(--theme-text);
  }

  /* Loading State */
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    min-height: 400px;
    text-align: center;
  }


  .empty-state {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    max-width: 600px;
    margin: 0 auto;
    width: 100%;
  }

  /* Header */
  .empty-header {
    text-align: center;
    padding: 1rem 0;
  }

  .header-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 10%,
          transparent
        )
        100%
    );
    border-radius: 18px;
    margin-bottom: 1rem;
    animation: pulse-glow 3s ease-in-out infinite;
  }

  .header-icon i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-error, var(--semantic-error));
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 20px
        color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 10%,
          transparent
        );
    }
    50% {
      box-shadow: 0 0 30px
        color-mix(
          in srgb,
          var(--semantic-error, var(--semantic-error)) 20%,
          transparent
        );
    }
  }

  .empty-header h1 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    letter-spacing: -0.02em;
  }

  .empty-header p {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Preview Stats Grid */
  .preview-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    transition: all var(--duration-normal) ease;
  }

  .stat-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke));
  }

  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    flex-shrink: 0;
    font-size: var(--font-size-lg);
  }

  .stat-icon.sessions {
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 12%,
      transparent
    );
    color: var(--semantic-error, var(--semantic-error));
  }

  .stat-icon.time {
    background: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 12%,
      transparent
    );
    color: var(--semantic-info, var(--semantic-info));
  }

  .stat-icon.accuracy {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 12%,
      transparent
    );
    color: var(--semantic-success, var(--semantic-success));
  }

  .stat-icon.combo {
    background: color-mix(
      in srgb,
      var(--semantic-warning, var(--semantic-warning)) 12%,
      transparent
    );
    color: var(--semantic-warning, var(--semantic-warning));
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
  }

  .stat-value.placeholder {
    color: color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  /* Preview Sections */
  .preview-sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .preview-section {
    padding: 20px;
    background: color-mix(
      in srgb,
      var(--theme-card-bg, white) 50%,
      transparent
    );
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
  }

  .section-header i {
    color: color-mix(in srgb, var(--theme-text, white) 40%, transparent);
    font-size: var(--font-size-base);
  }

  .section-header h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 70%, transparent);
  }

  .empty-rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .empty-row {
    height: 12px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    overflow: hidden;
  }

  .empty-bar {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--theme-stroke) 0%,
      color-mix(in srgb, var(--theme-stroke, white) 30%, transparent) 50%,
      var(--theme-stroke) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 2s ease-in-out infinite;
    border-radius: 6px;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .section-hint {
    margin: 12px 0 0;
    font-size: 0.8rem;
    color: color-mix(in srgb, var(--theme-text, white) 35%, transparent);
    text-align: center;
  }

  /* CTA Section */
  .cta-section {
    display: flex;
    justify-content: center;
    padding-top: 0.5rem;
  }

  .start-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: var(--min-touch-target);
    padding: 16px 28px;
    background: linear-gradient(
      135deg,
      var(--semantic-error, var(--semantic-error)) 0%,
      var(--semantic-error, var(--semantic-error)) 100%
    );
    border: none;
    border-radius: 16px;
    color: var(--theme-text, white);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    position: relative;
    overflow: hidden;
  }

  .start-btn::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-text, white) 15%, transparent) 0%,
      transparent 50%
    );
    pointer-events: none;
  }

  .start-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 32px
      color-mix(
        in srgb,
        var(--semantic-error, var(--semantic-error)) 35%,
        transparent
      );
  }

  .start-btn:active {
    transform: scale(0.98);
  }

  .start-btn i:last-child {
    font-size: var(--font-size-sm);
    opacity: 0.8;
    transition: transform var(--duration-normal) ease;
  }

  .start-btn:hover i:last-child {
    transform: translateX(4px);
  }


  .section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .section h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }


  @media (max-width: 480px) {
    .progress-panel {
      padding: 1rem;
      gap: 1.25rem;
    }

    .empty-state {
      gap: 1.5rem;
    }

    .header-icon {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
    }

    .header-icon i {
      font-size: var(--font-size-2xl);
    }

    .empty-header h1 {
      font-size: 1.25rem;
    }

    .preview-stats {
      gap: 10px;
    }

    .stat-card {
      padding: 12px;
      gap: 10px;
    }

    .stat-icon {
      width: 38px;
      height: 38px;
      font-size: var(--font-size-base);
    }

    .stat-value {
      font-size: 1.1rem;
    }

    .preview-section {
      padding: 16px;
    }

    .start-btn {
      min-height: var(--min-touch-target);
      padding: 14px 24px;
      font-size: 0.95rem;
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-panel {
      transition: none;
    }

    .stat-card,
    .start-btn {
      transition: none;
    }

    .start-btn:hover {
      transform: none;
    }

    .empty-bar {
      animation: none;
    }

    .header-icon {
      animation: none;
    }
  }
</style>
