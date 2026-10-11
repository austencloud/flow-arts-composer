<script lang="ts">
  import { untrack } from "svelte";
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import CopyForAIButton from "#lib/shared/foundation/ui/CopyForAIButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import SessionReplayPanel from "./SessionReplayPanel.svelte";
  import { getPostHogUserAnalytics } from "#lib/features/admin/get-post-hog-user-analytics.js";
  import { buildSessionExceptionReport } from "../domain/session-exception-report";
  import type {
    PostHogSessionEvent,
    PostHogSessionSummary,
    PostHogReplayAccessState,
    UserActivitySessionSummary,
  } from "../services/types";

  interface Props {
    userId: string;
    userDisplayName?: string | null;
    userUsername?: string | null;
    userEmail?: string | null;
    targetSessionId?: string | null;
    sessions: UserActivitySessionSummary[];
  }

  let {
    userId,
    userDisplayName = null,
    userUsername = null,
    userEmail = null,
    targetSessionId = null,
    sessions,
  }: Props = $props();

  type EventFilter = "exceptions" | "all";
  const eventFilterOptions: Array<{ value: EventFilter; label: string }> = [
    { value: "exceptions", label: "Exceptions" },
    { value: "all", label: "All events" },
  ];

  let selectedSessionId = $state<string | null>(null);
  let events = $state<PostHogSessionEvent[]>([]);
  let eventFilter = $state<EventFilter>("all");
  let loadingEvents = $state(false);
  let eventError = $state<string | null>(null);
  let retryGeneration = $state(0);
  let syncedUserId = "";
  let consumedTargetKey = "";
  let requestGeneration = 0;
  let replayState = $state<PostHogReplayAccessState | "loading">("loading");
  let replayUrl = $state<string | null>(null);
  let replayMessage = $state<string | null>(null);
  let replayRetryGeneration = $state(0);
  let replayRequestGeneration = 0;

  const selectedSession = $derived(
    sessions.find((session) => session.sessionId === selectedSessionId) ?? null
  );
  const visibleEvents = $derived(
    eventFilter === "exceptions"
      ? events.filter((event) => event.exception)
      : events
  );
  const loadedExceptionCount = $derived(
    events.filter((event) => event.exception !== null).length
  );
  const eventTrailStart = $derived(
    events[0]?.timestamp ?? selectedSession?.startedAt ?? null
  );

  $effect(() => {
    const uid = userId;
    if (uid === syncedUserId) return;
    syncedUserId = uid;
    untrack(closeSession);
  });

  $effect(() => {
    const sessionId = selectedSessionId;
    const session = selectedSession;
    replayRetryGeneration;
    if (!sessionId || session?.source === "composer") return;

    const generation = ++replayRequestGeneration;
    const controller = new AbortController();
    void loadReplay(sessionId, generation, controller.signal);
    return () => controller.abort();
  });

  $effect(() => {
    const target = targetSessionId;
    const targetKey = `${userId}:${target ?? ""}`;
    if (!target) {
      consumedTargetKey = "";
      return;
    }
    if (targetKey === consumedTargetKey) return;
    const session = sessions.find((item) => item.sessionId === target);
    consumedTargetKey = targetKey;
    untrack(() => {
      if (session) inspectSession(session);
      else inspectTargetSession(target);
    });
  });

  $effect(() => {
    const uid = userId;
    const sessionId = selectedSessionId;
    const session = selectedSession;
    retryGeneration;
    if (!uid || !sessionId || session?.source === "composer") return;

    const generation = ++requestGeneration;
    const controller = new AbortController();
    void loadEvents(uid, sessionId, generation, controller.signal);
    return () => controller.abort();
  });

  async function loadEvents(
    uid: string,
    sessionId: string,
    generation: number,
    signal: AbortSignal
  ) {
    loadingEvents = true;
    eventError = null;
    events = [];
    try {
      const result = await getPostHogUserAnalytics().getSessionEvents(
        uid,
        sessionId,
        signal
      );
      if (generation === requestGeneration && !signal.aborted) events = result;
    } catch (cause) {
      if (generation !== requestGeneration || signal.aborted) return;
      eventError =
        cause instanceof Error
          ? cause.message
          : "Session events could not be loaded";
    } finally {
      if (generation === requestGeneration && !signal.aborted) {
        loadingEvents = false;
      }
    }
  }

  async function loadReplay(
    sessionId: string,
    generation: number,
    signal: AbortSignal
  ) {
    replayState = "loading";
    replayUrl = null;
    replayMessage = null;
    try {
      const access = await getPostHogUserAnalytics().getSessionReplayAccess(
        sessionId,
        signal
      );
      if (generation !== replayRequestGeneration || signal.aborted) return;
      replayState = access.state;
      replayUrl = access.embedUrl;
      replayMessage = access.message;
    } catch (cause) {
      if (generation !== replayRequestGeneration || signal.aborted) return;
      replayState = "error";
      replayMessage =
        cause instanceof Error ? cause.message : "Replay request failed";
    }
  }

  function inspectSession(session: UserActivitySessionSummary) {
    eventFilter =
      session.source === "posthog" && session.exceptionCount > 0
        ? "exceptions"
        : "all";
    selectedSessionId = session.sessionId;
  }

  function inspectTargetSession(sessionId: string) {
    eventFilter = "all";
    selectedSessionId = sessionId;
  }

  function closeSession() {
    requestGeneration += 1;
    replayRequestGeneration += 1;
    selectedSessionId = null;
    events = [];
    eventFilter = "all";
    eventError = null;
    loadingEvents = false;
    replayState = "loading";
    replayUrl = null;
    replayMessage = null;
  }

  function retryEvents() {
    retryGeneration += 1;
  }

  function retryReplay() {
    replayRetryGeneration += 1;
  }

  function openPostHog() {
    if (selectedSession?.source !== "posthog" || !selectedSession.postHogUrl) {
      return;
    }
    window.open(selectedSession.postHogUrl, "_blank", "noopener,noreferrer");
  }

  function getExceptionReport(): string {
    if (!selectedSession || selectedSession.source !== "posthog") {
      throw new Error("No session is selected");
    }
    return buildSessionExceptionReport({
      user: {
        id: userId,
        displayName: userDisplayName,
        username: userUsername,
        email: userEmail,
      },
      session: selectedSession,
      events,
    });
  }

  function sessionDate(date: Date): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const sameDay = (left: Date, right: Date) =>
      left.toDateString() === right.toDateString();
    const time = date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    if (sameDay(date, now)) return `Today, ${time}`;
    if (sameDay(date, yesterday)) return `Yesterday, ${time}`;
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function absoluteDate(date: Date): string {
    return date.toLocaleString([], {
      dateStyle: "full",
      timeStyle: "medium",
    });
  }

  function duration(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function routeLabel(path: string | null): string {
    if (!path || path === "/") return "Home";
    return path.replace(/^\//, "").replace(/[-_]/g, " ");
  }

  function routeSummary(session: UserActivitySessionSummary): string {
    if (session.source === "composer") {
      return session.name || "Create session";
    }
    if (session.entryPath || session.exitPath) {
      const entry = routeLabel(session.entryPath);
      const exit = routeLabel(session.exitPath);
      return entry === exit ? entry : `${entry} → ${exit}`;
    }
    return session.modules.length
      ? session.modules.map(titleCase).join(" → ")
      : "No route captured";
  }

  function deviceSummary(session: PostHogSessionSummary): string {
    return [session.deviceType, session.browser, session.operatingSystem]
      .filter(Boolean)
      .join(" · ");
  }

  function composerStatus(session: UserActivitySessionSummary): string {
    if (session.source !== "composer") return "";
    return session.status ? titleCase(session.status) : "Unknown status";
  }

  function eventLabel(event: PostHogSessionEvent): string {
    if (event.exception) return event.exception.type ?? "Exception";
    if (event.event === "$pageview") return "Page view";
    if (event.event === "$autocapture") {
      return event.detail || "Interaction";
    }
    if (event.event === "$identify") return "User identified";
    return titleCase(event.event.replace(/^\$/, ""));
  }

  function eventIcon(event: PostHogSessionEvent): string {
    if (event.exception) return "fa-bug";
    if (event.event === "$pageview") return "fa-file-lines";
    if (event.event === "$autocapture") return "fa-arrow-pointer";
    if (event.event.includes("save")) return "fa-bookmark";
    if (event.event.includes("create")) return "fa-plus";
    if (event.event.includes("export")) return "fa-file-export";
    return "fa-circle";
  }

  function eventOffset(event: PostHogSessionEvent): string {
    if (!eventTrailStart) return "";
    const offset = Math.max(
      0,
      event.timestamp.getTime() - eventTrailStart.getTime()
    );
    return `+${duration(offset)}`;
  }

  function titleCase(value: string): string {
    return value
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }
</script>

{#if selectedSessionId}
  <div class="session-detail">
    <div class="detail-toolbar">
      <AdminActionButton
        variant="secondary"
        icon="fa-arrow-left"
        onclick={closeSession}
      >
        Sessions
      </AdminActionButton>
      <div class="detail-actions">
        {#if selectedSession?.source === "posthog" && selectedSession.exceptionCount > 0}
          <CopyForAIButton
            getData={getExceptionReport}
            ariaLabel="Copy session exceptions as a report for AI"
            variant="icon-text"
            size="md"
            class="exception-copy-button"
            idleIcon="fa-copy"
            labels={{
              idle: "Copy exceptions",
              loading: "Preparing report",
              success: "Report copied",
              error: "Copy failed",
            }}
            disabled={loadingEvents ||
              !!eventError ||
              loadedExceptionCount === 0}
            useToast={true}
          />
        {/if}
        {#if selectedSession?.source === "posthog" && selectedSession.postHogUrl}
          <AdminActionButton
            variant="info"
            icon="fa-arrow-up-right-from-square"
            onclick={openPostHog}
          >
            PostHog
          </AdminActionButton>
        {/if}
      </div>
    </div>

    {#if selectedSession}
      <div class="detail-heading">
        <div>
          <span class="detail-kicker"
            >{selectedSession.source === "composer"
              ? "Composer session record"
              : "Session inspection"}</span
          >
          <h4>{sessionDate(selectedSession.startedAt)}</h4>
        </div>
        {#if selectedSession.source === "composer"}
          <span class="record-badge">
            <i class="fas fa-database" aria-hidden="true"></i>
            {composerStatus(selectedSession)}
          </span>
        {:else if selectedSession.exceptionCount > 0}
          <span class="exception-badge">
            <i class="fas fa-bug" aria-hidden="true"></i>
            {selectedSession.exceptionCount}
          </span>
        {:else}
          <span class="clean-badge">
            <i class="fas fa-circle-check" aria-hidden="true"></i>
            Clean
          </span>
        {/if}
      </div>

      {#if selectedSession.source === "composer"}
        <div class="session-stats" aria-label="Composer session summary">
          <div>
            <strong>{duration(selectedSession.duration)}</strong><span
              >Recorded time</span
            >
          </div>
          <div>
            <strong>{selectedSession.stepCount ?? "—"}</strong><span>Steps</span
            >
          </div>
          <div>
            <strong
              >{selectedSession.isSaved === null
                ? "—"
                : selectedSession.isSaved
                  ? "Yes"
                  : "No"}</strong
            ><span>Saved</span>
          </div>
          <div>
            <strong
              >{selectedSession.lastAutosaveAt
                ? sessionDate(selectedSession.lastAutosaveAt)
                : "None"}</strong
            ><span>Last autosave</span>
          </div>
        </div>
        <div class="session-context">
          <div>
            <span>Draft</span>
            <strong>{routeSummary(selectedSession)}</strong>
          </div>
          <div>
            <span>Last recorded</span>
            <strong>{absoluteDate(selectedSession.endedAt)}</strong>
          </div>
        </div>
      {:else}
        <div class="session-stats" aria-label="Session summary">
          <div>
            <strong>{duration(selectedSession.duration)}</strong><span
              >Duration</span
            >
          </div>
          <div>
            <strong>{selectedSession.eventCount}</strong><span>Events</span>
          </div>
          <div>
            <strong>{selectedSession.contentActionCount}</strong><span
              >Content actions</span
            >
          </div>
          <div class:has-exceptions={selectedSession.exceptionCount > 0}>
            <strong>{selectedSession.exceptionCount}</strong><span
              >Exceptions</span
            >
          </div>
        </div>

        <div class="session-context">
          <div>
            <span>Route</span>
            <strong>{routeSummary(selectedSession)}</strong>
          </div>
          <div>
            <span>Client</span>
            <strong>{deviceSummary(selectedSession) || "Not captured"}</strong>
          </div>
        </div>
      {/if}
    {:else}
      <div class="detail-heading pending-heading">
        <div>
          <span class="detail-kicker">Session inspection</span>
          <h4>Current session</h4>
        </div>
        <span class="pending-badge">
          <i class="fas fa-clock" aria-hidden="true"></i>
          Indexing
        </span>
      </div>
      <p class="pending-session-note" role="status">
        Replay requested from the return notification. Session details will
        appear after PostHog indexes them.
      </p>
    {/if}

    {#if selectedSession?.source === "composer"}
      <div class="composer-source-note">
        <i class="fas fa-database" aria-hidden="true"></i>
        <div>
          <strong>Recovered from Composer storage</strong>
          <span
            >PostHog did not capture this visit, so replay, routes, events, and
            exceptions are unavailable.</span
          >
        </div>
      </div>
    {:else}
      <SessionReplayPanel
        state={replayState}
        embedUrl={replayUrl}
        message={replayMessage}
        onretry={retryReplay}
      />

      <div class="timeline-heading">
        <div>
          <h5>Event trail</h5>
          <span>{visibleEvents.length} shown · {events.length} loaded</span>
        </div>
        {#if selectedSession?.source === "posthog" && selectedSession.exceptionCount > 0}
          <div class="event-filter">
            <SegmentedControl
              options={eventFilterOptions}
              value={eventFilter}
              onchange={(filter) => (eventFilter = filter)}
              semantics="radiogroup"
              color="accent"
              size="sm"
              density="compact"
              ariaLabel="Session event filter"
            />
          </div>
        {/if}
      </div>

      {#if loadingEvents}
        <div class="detail-state" aria-live="polite">
          <ProgressRing percent={-1} size={28} strokeWidth={3} />
          <span>Loading event trail</span>
        </div>
      {:else if eventError}
        <div class="detail-state error" role="alert">
          <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
          <span>{eventError}</span>
          <AdminActionButton
            variant="secondary"
            icon="fa-rotate-right"
            onclick={retryEvents}
          >
            Retry
          </AdminActionButton>
        </div>
      {:else if events.length === 0}
        <div class="detail-state">
          <i class="fas fa-timeline" aria-hidden="true"></i>
          <span>No events were returned for this session</span>
        </div>
      {:else if visibleEvents.length === 0}
        <div class="detail-state">
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          <span>No exception events were returned</span>
        </div>
      {:else}
        <ol class="event-timeline themed-scrollbar">
          {#each visibleEvents as event (event.eventId)}
            <li class:exception={!!event.exception}>
              <span class="event-marker" aria-hidden="true">
                <i class="fas {eventIcon(event)}"></i>
              </span>
              <div class="event-copy">
                <div class="event-title-row">
                  <strong>{eventLabel(event)}</strong>
                  <time
                    datetime={event.timestamp.toISOString()}
                    title={absoluteDate(event.timestamp)}
                    >{eventOffset(event)}</time
                  >
                </div>
                {#if event.path}
                  <span class="event-path">{routeLabel(event.path)}</span>
                {/if}
                {#if event.exception?.message}
                  <p>{event.exception.message}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  </div>
{:else}
  <div class="session-list">
    {#each sessions as session (session.sessionId)}
      <button
        class="session-row"
        class:has-exceptions={session.source === "posthog" &&
          session.exceptionCount > 0}
        onclick={() => inspectSession(session)}
        aria-label="Inspect session from {absoluteDate(session.startedAt)}"
      >
        <div class="session-primary">
          <time
            datetime={session.startedAt.toISOString()}
            title={absoluteDate(session.startedAt)}
            >{sessionDate(session.startedAt)}</time
          >
          <span class="duration-badge">{duration(session.duration)}</span>
          {#if session.source === "composer"}
            <span class="record-badge">
              <i class="fas fa-database" aria-hidden="true"></i>
              {composerStatus(session)}
            </span>
          {:else if session.exceptionCount > 0}
            <span class="exception-badge">
              <i class="fas fa-bug" aria-hidden="true"></i>
              {session.exceptionCount}
            </span>
          {/if}
        </div>
        <strong class="session-route">{routeSummary(session)}</strong>
        <div class="session-meta">
          {#if session.source === "composer"}
            <span>{session.stepCount ?? "Unknown"} steps</span>
            <span>Composer autosave record</span>
          {:else}
            <span>{session.eventCount} events</span>
            {#if session.contentActionCount > 0}
              <span>{session.contentActionCount} content actions</span>
            {/if}
            {#if deviceSummary(session)}<span>{deviceSummary(session)}</span
              >{/if}
          {/if}
        </div>
        <i class="fas fa-chevron-right row-chevron" aria-hidden="true"></i>
      </button>
    {/each}
  </div>
{/if}

<style>
  .session-list,
  .session-detail {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .session-row {
    position: relative;
    display: grid;
    gap: 0.375rem;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0.875rem 2.75rem 0.875rem 1rem;
    text-align: left;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    color: var(--theme-text);
    cursor: pointer;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      transform var(--duration-normal) ease;
  }

  @media (hover: hover) {
    .session-row:hover {
      background: var(--theme-card-hover-bg);
      border-color: var(--theme-stroke-strong);
      transform: translateY(-1px);
    }
  }

  .session-row.has-exceptions {
    border-color: color-mix(in srgb, var(--semantic-error) 35%, transparent);
  }

  .session-primary,
  .session-meta,
  .detail-toolbar,
  .detail-actions,
  .detail-heading,
  .event-title-row,
  .timeline-heading {
    display: flex;
    align-items: center;
  }

  .session-primary {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .detail-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .session-primary time,
  .session-route {
    font-size: var(--font-size-sm);
  }

  .session-primary time,
  .session-route,
  .session-stats strong,
  .event-title-row strong {
    color: var(--theme-text);
    font-weight: 650;
  }

  .session-route {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .session-meta {
    flex-wrap: wrap;
    gap: 0.375rem 0.75rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .duration-badge,
  .exception-badge,
  .clean-badge,
  .pending-badge,
  .record-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 4.5ch;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    font-size: var(--font-size-compact);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
  }

  .duration-badge {
    background: color-mix(in srgb, var(--theme-accent) 13%, transparent);
    color: var(--theme-accent);
  }

  .exception-badge {
    background: color-mix(in srgb, var(--semantic-error) 14%, transparent);
    color: var(--semantic-error);
  }

  .clean-badge {
    background: color-mix(in srgb, var(--semantic-success) 14%, transparent);
    color: var(--semantic-success);
  }

  .pending-badge {
    background: color-mix(in srgb, var(--semantic-warning) 14%, transparent);
    color: var(--semantic-warning);
  }

  .record-badge {
    background: color-mix(in srgb, var(--theme-accent) 13%, transparent);
    color: var(--theme-accent);
  }

  .row-chevron {
    position: absolute;
    top: 50%;
    right: 1rem;
    color: var(--theme-text-dim);
    transform: translateY(-50%);
  }

  .detail-toolbar,
  .detail-heading,
  .event-title-row,
  .timeline-heading {
    justify-content: space-between;
    gap: 1rem;
  }

  .detail-heading {
    align-items: flex-end;
    padding-top: 0.25rem;
  }

  .timeline-heading {
    align-items: flex-end;
  }

  .detail-kicker,
  .session-context span,
  .timeline-heading span,
  .session-stats span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .detail-kicker,
  .timeline-heading h5 {
    letter-spacing: 0.055em;
    text-transform: uppercase;
  }

  .detail-heading h4,
  .timeline-heading h5 {
    margin: 0;
    color: var(--theme-text);
  }

  .detail-heading h4 {
    margin-top: 0.25rem;
    font-size: var(--font-size-lg);
  }

  .timeline-heading h5 {
    font-size: var(--font-size-sm);
  }

  .timeline-heading > div:first-child {
    display: grid;
    gap: 0.2rem;
  }

  .event-filter {
    width: min(100%, 15rem);
    min-width: 12rem;
  }

  .session-stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .session-stats > div {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.75rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
  }

  .session-stats strong {
    font-size: var(--font-size-lg);
    font-variant-numeric: tabular-nums;
  }

  .session-stats .has-exceptions strong {
    color: var(--semantic-error);
  }

  .session-context {
    display: grid;
    gap: 0.625rem;
    padding: 0.875rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
  }

  .session-context > div {
    display: grid;
    gap: 0.25rem;
  }

  .session-context strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 550;
    overflow-wrap: anywhere;
    text-transform: capitalize;
  }

  .pending-session-note {
    margin: 0;
    padding: 0.875rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .composer-source-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.875rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text-dim);
  }

  .composer-source-note > i {
    margin-top: 0.15rem;
    color: var(--theme-accent);
  }

  .composer-source-note div {
    display: grid;
    gap: 0.25rem;
  }

  .composer-source-note strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .composer-source-note span {
    font-size: var(--font-size-compact);
    line-height: 1.45;
  }

  .detail-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 12rem;
    padding: 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .detail-state.error {
    color: var(--semantic-error);
  }

  .event-timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 25rem;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  .event-timeline li {
    position: relative;
    display: grid;
    grid-template-columns: 1.75rem minmax(0, 1fr);
    gap: 0.625rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .event-timeline li:last-child {
    border-bottom: 0;
  }

  .event-marker {
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
  }

  li.exception .event-marker {
    background: color-mix(in srgb, var(--semantic-error) 14%, transparent);
    color: var(--semantic-error);
  }

  .event-copy {
    display: grid;
    min-width: 0;
    gap: 0.25rem;
  }

  .event-title-row strong {
    font-size: var(--font-size-sm);
  }

  .event-title-row time,
  .event-path {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .event-title-row time {
    flex: none;
    font-variant-numeric: tabular-nums;
  }

  .event-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .event-copy p {
    margin: 0.25rem 0 0;
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .session-row:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container (min-width: 30rem) {
    .session-stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .session-context {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 28rem) {
    .detail-actions :global(.exception-copy-button) {
      width: var(--min-touch-target);
      min-width: var(--min-touch-target);
      min-height: var(--min-touch-target);
      padding-inline: 0;
    }

    .detail-actions :global(.exception-copy-button .label) {
      display: none;
    }
  }

  @container (max-width: 20rem) {
    .detail-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .detail-actions {
      display: grid;
      grid-template-columns: var(--min-touch-target) minmax(0, 1fr);
      width: 100%;
    }

    .detail-toolbar > :global(button),
    .detail-actions :global(button:not(.exception-copy-button)) {
      width: 100%;
    }

    .timeline-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .event-filter {
      width: 100%;
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .session-row {
      transition: none;
    }

    .session-row:hover {
      transform: none;
    }
  }
</style>
