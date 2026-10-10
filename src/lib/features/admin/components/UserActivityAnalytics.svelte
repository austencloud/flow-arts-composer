<script lang="ts">
  import { untrack } from "svelte";
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getPostHogUserAnalytics } from "#lib/features/admin/get-post-hog-user-analytics.js";
  import { buildUserAnalyticsSignals } from "../domain/user-analytics-insights";
  import type {
    ContentMetrics,
    ModuleActivityBreakdown,
    TimePeriod,
    UserActivitySessionSummary,
    UserEngagementSummary,
  } from "../services/types";
  import UserSessionInspector from "./UserSessionInspector.svelte";

  interface Props {
    userId: string;
    userDisplayName?: string | null;
    userUsername?: string | null;
    userEmail?: string | null;
    targetSessionId?: string | null;
    compact?: boolean;
  }

  type Section = "engagement" | "activity" | "content" | "sessions";

  let {
    userId,
    userDisplayName = null,
    userUsername = null,
    userEmail = null,
    targetSessionId = null,
    compact = false,
  }: Props = $props();

  const periodOptions: Array<{ value: TimePeriod; label: string }> = [
    { value: "today", label: "Today" },
    { value: "week", label: "7 days" },
    { value: "month", label: "30 days" },
    { value: "all", label: "All time" },
  ];

  let selectedPeriod = $state<TimePeriod>("week");
  let engagement = $state<UserEngagementSummary | null>(null);
  let activityBreakdown = $state<ModuleActivityBreakdown[]>([]);
  let contentMetrics = $state<ContentMetrics | null>(null);
  let recentSessions = $state<UserActivitySessionSummary[]>([]);
  let syncedUserId = "";

  let loading = $state<Record<Section, boolean>>({
    engagement: true,
    activity: true,
    content: true,
    sessions: true,
  });
  let errors = $state<Record<Section, string | null>>({
    engagement: null,
    activity: null,
    content: null,
    sessions: null,
  });

  const requestVersions: Record<Section, number> = {
    engagement: 0,
    activity: 0,
    content: 0,
    sessions: 0,
  };
  const controllers = new Map<Section, AbortController>();

  const signals = $derived(
    buildUserAnalyticsSignals({
      engagement,
      activity: activityBreakdown,
      content: contentMetrics,
      sessions: recentSessions,
    })
  );
  const hasInsightData = $derived(
    engagement !== null ||
      activityBreakdown.length > 0 ||
      contentMetrics !== null ||
      recentSessions.length > 0
  );
  const isRefreshing = $derived(Object.values(loading).some(Boolean));
  const hasComposerSessions = $derived(
    recentSessions.some((session) => session.source === "composer")
  );

  $effect(() => {
    const uid = userId;
    const period = selectedPeriod;
    const limit = compact ? 6 : 10;
    if (!uid) return;

    if (uid !== syncedUserId) {
      syncedUserId = uid;
      untrack(resetSnapshot);
    }

    loadAll(uid, period, limit);
    return abortAll;
  });

  function resetSnapshot() {
    engagement = null;
    activityBreakdown = [];
    contentMetrics = null;
    recentSessions = [];
  }

  function abortAll() {
    for (const controller of controllers.values()) controller.abort();
    controllers.clear();
  }

  function loadAll(uid: string, period: TimePeriod, limit: number) {
    const analytics = getPostHogUserAnalytics();
    void loadSection(
      "engagement",
      (signal) => analytics.getEngagementSummary(uid, period, signal),
      (value) => (engagement = value)
    );
    void loadSection(
      "activity",
      (signal) => analytics.getActivityBreakdown(uid, period, signal),
      (value) => (activityBreakdown = value)
    );
    void loadSection(
      "content",
      (signal) => analytics.getContentMetrics(uid, period, signal),
      (value) => (contentMetrics = value)
    );
    void loadSection(
      "sessions",
      (signal) => analytics.getRecentSessions(uid, period, limit, signal),
      (value) => (recentSessions = value)
    );
  }

  async function loadSection<T>(
    section: Section,
    load: (signal: AbortSignal) => Promise<T>,
    assign: (value: T) => void
  ): Promise<void> {
    controllers.get(section)?.abort();
    const controller = new AbortController();
    controllers.set(section, controller);
    const version = ++requestVersions[section];

    loading[section] = true;
    errors[section] = null;
    try {
      const value = await load(controller.signal);
      if (version === requestVersions[section] && !controller.signal.aborted) {
        assign(value);
      }
    } catch (cause) {
      if (version !== requestVersions[section] || controller.signal.aborted) {
        return;
      }
      errors[section] =
        cause instanceof Error ? cause.message : "Analytics request failed";
    } finally {
      if (version === requestVersions[section] && !controller.signal.aborted) {
        loading[section] = false;
      }
      if (controllers.get(section) === controller) controllers.delete(section);
    }
  }

  function retry(section: Section) {
    const uid = userId;
    const period = selectedPeriod;
    if (!uid) return;
    const analytics = getPostHogUserAnalytics();

    if (section === "engagement") {
      void loadSection(
        section,
        (signal) => analytics.getEngagementSummary(uid, period, signal),
        (value) => (engagement = value)
      );
    } else if (section === "activity") {
      void loadSection(
        section,
        (signal) => analytics.getActivityBreakdown(uid, period, signal),
        (value) => (activityBreakdown = value)
      );
    } else if (section === "content") {
      void loadSection(
        section,
        (signal) => analytics.getContentMetrics(uid, period, signal),
        (value) => (contentMetrics = value)
      );
    } else {
      void loadSection(
        section,
        (signal) =>
          analytics.getRecentSessions(uid, period, compact ? 6 : 10, signal),
        (value) => (recentSessions = value)
      );
    }
  }

  function formatRelativeTime(isoString: string | null): string {
    if (!isoString) return "Never";
    const date = new Date(isoString);
    const diffMs = Math.max(0, Date.now() - date.getTime());
    const minutes = Math.floor(diffMs / 60_000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 30) return `${days}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function formatDuration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function periodLabel(period: TimePeriod): string {
    return periodOptions.find((option) => option.value === period)?.label ?? "";
  }

  function moduleColor(module: string): string {
    const colors: Record<string, string> = {
      browse: "var(--semantic-info)",
      create: "var(--semantic-success)",
      learn: "var(--semantic-warning)",
      train: "var(--theme-accent)",
      compose: "var(--prop-blue)",
      settings: "var(--theme-text-dim)",
    };
    return colors[module.toLowerCase()] ?? "var(--theme-accent)";
  }

  function titleCase(value: string): string {
    return value
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
</script>

<div class="analytics-container" class:compact>
  <header class="analytics-toolbar">
    <div class="toolbar-copy">
      <span class="toolbar-kicker">Behavior window</span>
      <strong>{periodLabel(selectedPeriod)}</strong>
      {#if isRefreshing && hasInsightData}
        <span class="refreshing" role="status" aria-live="polite">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Refreshing
        </span>
      {/if}
    </div>
    <div class="period-control">
      <SegmentedControl
        options={periodOptions}
        value={selectedPeriod}
        onchange={(period) => (selectedPeriod = period)}
        semantics="radiogroup"
        color="accent"
        size="sm"
        ariaLabel="Analytics window"
      />
    </div>
  </header>

  <section class="signals-section" aria-labelledby="signals-title">
    <div class="section-heading">
      <div>
        <h3 id="signals-title">
          <i class="fas fa-bolt" aria-hidden="true"></i>
          What stands out
        </h3>
        <p>Computed from the selected window and loaded sessions.</p>
      </div>
    </div>
    {#if !hasInsightData && isRefreshing}
      <div class="signals-grid" aria-label="Loading behavior signals">
        {#each [0, 1, 2] as item (item)}
          <div class="signal-card skeleton-card"></div>
        {/each}
      </div>
    {:else}
      <div class="signals-grid">
        {#each signals as signal (signal.id)}
          {#if signal.id === "exceptions" && loading.sessions && recentSessions.length === 0}
            <article
              class="signal-card skeleton-card"
              role="status"
              aria-label="Loading session diagnostics"
            ></article>
          {:else}
            <article class="signal-card" data-tone={signal.tone}>
              <span class="signal-icon" aria-hidden="true">
                <i class="fas {signal.icon}"></i>
              </span>
              <div>
                <strong>{signal.title}</strong>
                <p>{signal.detail}</p>
              </div>
            </article>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

  <div class="dashboard-grid">
    <section
      class="analytics-card engagement-card"
      aria-labelledby="engagement-title"
    >
      <div class="section-heading">
        <div>
          <h3 id="engagement-title">
            <i class="fas fa-chart-line" aria-hidden="true"></i>
            Engagement
          </h3>
          <p>
            {engagement?.source === "composer"
              ? "From Composer session records"
              : "Frequency and time spent"}
          </p>
        </div>
      </div>
      {#if loading.engagement && !engagement}
        <div
          class="skeleton-grid"
          role="status"
          aria-label="Loading engagement"
        >
          {#each [0, 1, 2, 3] as item (item)}<div
              class="skeleton-block"
            ></div>{/each}
        </div>
      {:else if errors.engagement && !engagement}
        <div class="inline-state error" role="alert">
          <span>{errors.engagement}</span>
          <AdminActionButton
            variant="secondary"
            icon="fa-rotate-right"
            onclick={() => retry("engagement")}>Retry</AdminActionButton
          >
        </div>
      {:else if engagement}
        <div class="metric-grid">
          <div class="metric featured">
            <span>Last active</span>
            <strong>{formatRelativeTime(engagement.lastActiveAt)}</strong>
          </div>
          <div class="metric">
            <span>Sessions</span>
            <strong>{engagement.sessionsCount}</strong>
          </div>
          <div class="metric">
            <span>Average</span>
            <strong>{formatDuration(engagement.avgSessionDuration)}</strong>
          </div>
          <div class="metric">
            <span>Total time</span>
            <strong>{formatDuration(engagement.totalTimeSpent)}</strong>
          </div>
        </div>
        {#if errors.engagement}
          <button class="stale-warning" onclick={() => retry("engagement")}
            >Refresh failed. Showing earlier data.</button
          >
        {/if}
      {:else}
        <div class="inline-state">No engagement data in this window.</div>
      {/if}
    </section>

    <section
      class="analytics-card activity-card"
      aria-labelledby="activity-title"
    >
      <div class="section-heading">
        <div>
          <h3 id="activity-title">
            <i class="fas fa-chart-simple" aria-hidden="true"></i>
            Module mix
          </h3>
          <p>Share of captured page views</p>
        </div>
      </div>
      {#if loading.activity && activityBreakdown.length === 0}
        <div
          class="bar-skeletons"
          role="status"
          aria-label="Loading module mix"
        >
          {#each [72, 48, 32, 18] as width (width)}
            <div><span></span><i style="--skeleton-width: {width}%"></i></div>
          {/each}
        </div>
      {:else if errors.activity && activityBreakdown.length === 0}
        <div class="inline-state error" role="alert">
          <span>{errors.activity}</span>
          <AdminActionButton
            variant="secondary"
            icon="fa-rotate-right"
            onclick={() => retry("activity")}>Retry</AdminActionButton
          >
        </div>
      {:else if activityBreakdown.length > 0}
        <div class="activity-bars">
          {#each activityBreakdown as activity (activity.module)}
            <div class="activity-row">
              <div class="activity-label">
                <strong>{titleCase(activity.module)}</strong>
                <span>{activity.eventCount} views</span>
              </div>
              <div class="activity-track" aria-hidden="true">
                <div
                  class="activity-fill"
                  style="--bar-width: {activity.percentage}%; --bar-color: {moduleColor(
                    activity.module
                  )}"
                ></div>
              </div>
              <strong class="activity-percent">{activity.percentage}%</strong>
            </div>
          {/each}
        </div>
        {#if errors.activity}
          <button class="stale-warning" onclick={() => retry("activity")}
            >Refresh failed. Showing earlier data.</button
          >
        {/if}
      {:else}
        <div class="inline-state">
          No page views in {periodLabel(selectedPeriod).toLowerCase()}.
        </div>
      {/if}
    </section>

    <section
      class="analytics-card content-card"
      aria-labelledby="content-title"
    >
      <div class="section-heading">
        <div>
          <h3 id="content-title">
            <i class="fas fa-layer-group" aria-hidden="true"></i>
            Content actions
          </h3>
          <p>Concrete creation and library events</p>
        </div>
      </div>
      {#if loading.content && !contentMetrics}
        <div
          class="content-list"
          role="status"
          aria-label="Loading content actions"
        >
          {#each [0, 1, 2, 3, 4] as item (item)}<div
              class="content-row skeleton-line"
            ></div>{/each}
        </div>
      {:else if errors.content && !contentMetrics}
        <div class="inline-state error" role="alert">
          <span>{errors.content}</span>
          <AdminActionButton
            variant="secondary"
            icon="fa-rotate-right"
            onclick={() => retry("content")}>Retry</AdminActionButton
          >
        </div>
      {:else if contentMetrics}
        <div class="content-list">
          <div class="content-row">
            <span><i class="fas fa-plus" aria-hidden="true"></i>Created</span
            ><strong>{contentMetrics.sequencesCreated}</strong>
          </div>
          <div class="content-row">
            <span><i class="fas fa-bookmark" aria-hidden="true"></i>Saved</span
            ><strong>{contentMetrics.sequencesSaved}</strong>
          </div>
          <div class="content-row">
            <span
              ><i class="fas fa-file-export" aria-hidden="true"
              ></i>Exported</span
            ><strong>{contentMetrics.sequencesExported}</strong>
          </div>
          <div class="content-row">
            <span
              ><i class="fas fa-share-nodes" aria-hidden="true"></i>Shared</span
            ><strong>{contentMetrics.sequencesShared}</strong>
          </div>
          <div class="content-row">
            <span
              ><i class="fas fa-folder-plus" aria-hidden="true"
              ></i>Collections</span
            ><strong>{contentMetrics.collectionsCreated}</strong>
          </div>
        </div>
        {#if errors.content}
          <button class="stale-warning" onclick={() => retry("content")}
            >Refresh failed. Showing earlier data.</button
          >
        {/if}
      {:else}
        <div class="inline-state">No content actions in this window.</div>
      {/if}
    </section>

    <section
      class="analytics-card sessions-card"
      aria-labelledby="sessions-title"
    >
      <div class="section-heading sessions-heading">
        <div>
          <h3 id="sessions-title">
            <i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
            Sessions
          </h3>
          <p>
            {hasComposerSessions
              ? "Recovered from Composer autosave records."
              : "Open one to inspect routes, events, and exceptions."}
          </p>
        </div>
        {#if recentSessions.length > 0}<span class="result-count"
            >{recentSessions.length} loaded</span
          >{/if}
      </div>
      {#if loading.sessions && recentSessions.length === 0 && !targetSessionId}
        <div
          class="session-skeletons"
          role="status"
          aria-label="Loading sessions"
        >
          {#each [0, 1, 2, 3] as item (item)}<div
              class="skeleton-session"
            ></div>{/each}
        </div>
      {:else if errors.sessions && recentSessions.length === 0 && !targetSessionId}
        <div class="inline-state error" role="alert">
          <span>{errors.sessions}</span>
          <AdminActionButton
            variant="secondary"
            icon="fa-rotate-right"
            onclick={() => retry("sessions")}>Retry</AdminActionButton
          >
        </div>
      {:else if recentSessions.length > 0 || targetSessionId}
        {#key `${userId}:${selectedPeriod}`}
          <UserSessionInspector
            {userId}
            {userDisplayName}
            {userUsername}
            {userEmail}
            {targetSessionId}
            sessions={recentSessions}
          />
        {/key}
        {#if errors.sessions}
          <button class="stale-warning" onclick={() => retry("sessions")}
            >Refresh failed. Showing earlier data.</button
          >
        {/if}
      {:else}
        <div class="inline-state empty-sessions">
          <i class="fas fa-moon" aria-hidden="true"></i>
          <strong>No sessions in this window</strong>
          <span>Choose a wider range to look further back.</span>
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .analytics-container {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }

  .analytics-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.25rem 0;
  }

  .toolbar-copy {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0.375rem 0.625rem;
    min-width: 0;
  }

  .toolbar-kicker,
  .refreshing,
  .result-count {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .toolbar-kicker {
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .toolbar-copy strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .refreshing {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .period-control {
    width: min(100%, 26rem);
    min-width: 20rem;
  }

  .signals-section,
  .analytics-card {
    min-width: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
  }

  .signals-section {
    padding: 1rem;
  }

  .section-heading,
  .sessions-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .section-heading h3 {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 650;
  }

  .section-heading h3 i {
    color: var(--theme-accent);
  }

  .section-heading p {
    margin: 0.25rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.4;
  }

  .signals-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.625rem;
    margin-top: 0.875rem;
  }

  .signal-card {
    --signal-color: var(--theme-text-dim);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: 4.5rem;
    padding: 0.75rem;
    border: 1px solid
      color-mix(in srgb, var(--signal-color) 24%, var(--theme-stroke));
    border-radius: 0.75rem;
    background: color-mix(
      in srgb,
      var(--signal-color) 6%,
      var(--theme-panel-bg)
    );
  }

  .signal-card[data-tone="info"] {
    --signal-color: var(--semantic-info);
  }

  .signal-card[data-tone="success"] {
    --signal-color: var(--semantic-success);
  }

  .signal-card[data-tone="warning"] {
    --signal-color: var(--semantic-warning);
  }

  .signal-card[data-tone="danger"] {
    --signal-color: var(--semantic-error);
  }

  .signal-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    background: color-mix(in srgb, var(--signal-color) 14%, transparent);
    color: var(--signal-color);
  }

  .signal-card strong {
    display: block;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 650;
  }

  .signal-card p {
    margin: 0.25rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "engagement"
      "activity"
      "content"
      "sessions";
    gap: 1rem;
    align-items: start;
  }

  .analytics-card {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1rem;
  }

  .engagement-card {
    grid-area: engagement;
  }

  .activity-card {
    grid-area: activity;
  }

  .content-card {
    grid-area: content;
  }

  .sessions-card {
    grid-area: sessions;
    container-type: inline-size;
  }

  .metric-grid,
  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .metric {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 0.5rem;
    min-height: 4.75rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-panel-bg);
  }

  .metric.featured {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 30%,
      var(--theme-stroke)
    );
    background: color-mix(
      in srgb,
      var(--theme-accent) 6%,
      var(--theme-panel-bg)
    );
  }

  .metric span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .metric strong {
    color: var(--theme-text);
    font-size: var(--font-size-lg);
    font-variant-numeric: tabular-nums;
  }

  .activity-bars {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    min-height: 12rem;
  }

  .activity-row {
    display: grid;
    grid-template-columns: minmax(5.5rem, 0.35fr) minmax(7rem, 1fr) 3rem;
    align-items: center;
    gap: 0.75rem;
  }

  .activity-label {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  .activity-label strong {
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .activity-label span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .activity-track {
    height: 0.75rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--theme-panel-bg);
    box-shadow: inset 0 0 0 1px var(--theme-stroke);
  }

  .activity-fill {
    width: var(--bar-width);
    height: 100%;
    border-radius: inherit;
    background: var(--bar-color);
    transition: width var(--duration-normal) ease;
  }

  .activity-percent {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .content-list,
  .session-skeletons,
  .bar-skeletons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .content-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: var(--min-touch-target);
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-panel-bg);
  }

  .content-row span {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .content-row span i {
    width: 1rem;
    color: var(--theme-accent);
    text-align: center;
  }

  .content-row strong {
    color: var(--theme-text);
    font-size: var(--font-size-base);
    font-variant-numeric: tabular-nums;
  }

  .result-count {
    flex: none;
    padding: 0.3rem 0.5rem;
    border-radius: 999px;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
  }

  .inline-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 9rem;
    padding: 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .inline-state.error {
    color: var(--semantic-error);
  }

  .empty-sessions i {
    color: var(--theme-accent);
    font-size: var(--font-size-xl);
  }

  .empty-sessions strong {
    color: var(--theme-text);
  }

  .stale-warning {
    min-height: var(--min-touch-target);
    padding: 0.5rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning) 35%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--semantic-warning) 8%, transparent);
    color: var(--semantic-warning);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-compact);
  }

  .stale-warning:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .skeleton-card,
  .skeleton-block,
  .skeleton-line,
  .skeleton-session,
  .bar-skeletons span,
  .bar-skeletons i {
    background: linear-gradient(
      90deg,
      var(--theme-panel-bg) 0%,
      var(--theme-card-hover-bg) 50%,
      var(--theme-panel-bg) 100%
    );
    background-size: 200% 100%;
    animation: shimmer var(--duration-emphasis) infinite;
  }

  .skeleton-card {
    border-color: var(--theme-stroke);
  }

  .skeleton-block {
    min-height: 4.75rem;
    border-radius: 0.625rem;
  }

  .skeleton-line {
    border: 0;
  }

  .skeleton-session {
    min-height: 5.25rem;
    border-radius: 0.75rem;
  }

  .bar-skeletons {
    justify-content: center;
    min-height: 12rem;
  }

  .bar-skeletons > div {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
  }

  .bar-skeletons span {
    height: 1rem;
    border-radius: 0.25rem;
  }

  .bar-skeletons i {
    display: block;
    width: var(--skeleton-width);
    height: 0.75rem;
    border-radius: 999px;
  }

  @keyframes shimmer {
    from {
      background-position: 200% 0;
    }
    to {
      background-position: -200% 0;
    }
  }

  @container (min-width: 38rem) {
    .signals-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (min-width: 54rem) {
    .dashboard-grid {
      grid-template-columns: minmax(18rem, 0.75fr) minmax(0, 1.25fr);
      grid-template-areas:
        "engagement activity"
        "content activity"
        "sessions sessions";
    }

    .activity-card {
      align-self: stretch;
    }
  }

  @container (min-width: 70rem) {
    .dashboard-grid {
      grid-template-columns: minmax(18rem, 0.78fr) minmax(28rem, 1.28fr) minmax(
          24rem,
          1fr
        );
      grid-template-areas:
        "engagement activity sessions"
        "content content sessions";
    }

    .sessions-card {
      align-self: stretch;
    }

    .content-list {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @media (min-width: 2600px) {
    .analytics-container,
    .dashboard-grid {
      gap: 1.5rem;
    }

    .signals-section,
    .analytics-card {
      padding: 1.5rem;
      border-radius: 1.125rem;
    }

    .signals-grid {
      gap: 1rem;
      margin-top: 1.25rem;
    }

    .signal-card {
      min-height: 6rem;
      padding: 1rem;
    }

    .metric {
      min-height: 6.5rem;
      padding: 1rem;
    }

    .content-row {
      padding: 0.875rem 1rem;
    }
  }

  @container (max-width: 38rem) {
    .analytics-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .period-control {
      width: 100%;
      min-width: 0;
    }

    .activity-row {
      grid-template-columns: minmax(4.75rem, 0.4fr) minmax(5rem, 1fr) 2.5rem;
      gap: 0.5rem;
    }
  }

  @container (max-width: 24rem) {
    .metric-grid,
    .skeleton-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .activity-label span {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-card,
    .skeleton-block,
    .skeleton-line,
    .skeleton-session,
    .bar-skeletons span,
    .bar-skeletons i {
      animation: none;
    }

    .activity-fill {
      transition: none;
    }
  }
</style>
