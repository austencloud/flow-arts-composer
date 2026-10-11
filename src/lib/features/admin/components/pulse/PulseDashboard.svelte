<script lang="ts">
  /**
   * Pulse Dashboard — live visitor activity and alert controls.
   *
   * The glanceable half of the Pulse system (the other half is phone push
   * via the pulse cloud functions). Surfaces site-wide PostHog data through
   * the /api/admin/analytics proxy: who's on the site right now, where
   * visitors come from, and a merged recent-activity feed. Alert mute
   * switches write notificationPreferences on the admin's user doc — the
   * same field the push pipeline checks server-side.
   *
   * Spec: docs/superpowers/specs/2026-07-09-pulse-activity-system-design.md
   */
  import { onMount } from "svelte";
  import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
  import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
  import {
    collection,
    query as fsQuery,
    where,
    getDocs,
    getDoc,
    doc,
    Timestamp,
  } from "firebase/firestore";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { NotificationPreferences } from "#lib/shared/feedback/domain/models/notification-models.js";
  import { DEFAULT_NOTIFICATION_PREFERENCES } from "#lib/shared/feedback/domain/models/notification-models.js";
  import {
    getPreferences,
    togglePreference,
  } from "#lib/features/feedback/services/notification-preferences-manager.js";
  import PreferenceGroup from "#lib/features/feedback/components/notifications/PreferenceGroup.svelte";
  import type { PreferenceItem } from "#lib/features/feedback/components/notifications/preference-item.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";


  interface Overview {
    visitors: [number, number, number]; // today, 7d, 30d
    scans: [number, number, number];
    saves: [number, number, number];
    signups: [number, number, number];
  }
  interface BreakdownRow {
    name: string;
    visitors: number;
  }
  interface FeedItem {
    ts: string;
    event: string;
    distinctId: string;
    city: string | null;
    country: string | null;
    device: string | null;
    displayName: string | null;
  }


  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let overview = $state<Overview | null>(null);
  let liveTotal = $state(0);
  let liveAnon = $state(0);
  let feed = $state<FeedItem[]>([]);
  let breakdowns = $state<Record<string, BreakdownRow[]>>({
    country: [],
    city: [],
    referrer: [],
    device: [],
  });
  let lastRefreshed = $state<Date | null>(null);

  let preferences = $state<NotificationPreferences>({
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  });
  let prefsLoaded = $state(false);
  let busyKeys = $state<Set<string>>(new Set());

  const nameCache = new Map<string, string | null>();


  async function pulseQuery(
    type: string,
    extra?: Record<string, unknown>
  ): Promise<unknown[][]> {
    const response = await authedFetch("/api/admin/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, ...extra }),
    });
    const body = (await response.json().catch(() => null)) as {
      success?: boolean;
      results?: unknown[][];
      message?: string;
    } | null;
    if (!response.ok) {
      throw new Error(body?.message ?? `Analytics proxy ${response.status}`);
    }
    if (!body?.success) throw new Error(body?.message ?? "Query failed");
    return body.results ?? [];
  }

  /** Signup counts come from Firestore (source of truth for accounts). */
  async function fetchSignupCounts(): Promise<[number, number, number]> {
    const db = await getFirestoreInstance();
    const monthAgo = Timestamp.fromMillis(Date.now() - 30 * 86400_000);
    const snap = await getDocs(
      fsQuery(collection(db, "users"), where("createdAt", ">", monthAgo))
    );
    const dayMs = Date.now() - 86400_000;
    const weekMs = Date.now() - 7 * 86400_000;
    let today = 0,
      week = 0,
      month = 0;
    snap.forEach((d) => {
      const u = d.data();
      if (u.isAnonymous === true) return; // guests aren't signups
      const created = (u.createdAt as Timestamp | undefined)?.toMillis?.();
      if (!created) return;
      month++;
      if (created > weekMs) week++;
      if (created > dayMs) today++;
    });
    return [today, week, month];
  }

  const isUid = (id: string) => /^[A-Za-z0-9]{28}$/.test(id);

  async function resolveName(distinctId: string): Promise<string | null> {
    if (!isUid(distinctId)) return null;
    if (nameCache.has(distinctId)) return nameCache.get(distinctId) ?? null;
    try {
      const db = await getFirestoreInstance();
      const snap = await getDoc(doc(db, "users", distinctId));
      const u = snap.data();
      const name =
        (u?.displayName as string) || (u?.username as string) || null;
      nameCache.set(distinctId, name);
      return name;
    } catch {
      nameCache.set(distinctId, null);
      return null;
    }
  }

  async function refresh(full: boolean): Promise<void> {
    try {
      const jobs: Promise<void>[] = [
        pulseQuery("pulse-overview").then(async (rows) => {
          const r = (rows[0] ?? []) as number[];
          const signups = await fetchSignupCounts();
          overview = {
            visitors: [r[0] ?? 0, r[1] ?? 0, r[2] ?? 0],
            scans: [r[3] ?? 0, r[4] ?? 0, r[5] ?? 0],
            saves: [r[6] ?? 0, r[7] ?? 0, r[8] ?? 0],
            signups,
          };
        }),
        pulseQuery("pulse-live").then((rows) => {
          const r = (rows[0] ?? []) as number[];
          liveTotal = r[0] ?? 0;
          liveAnon = r[1] ?? 0;
        }),
      ];

      if (full) {
        jobs.push(
          pulseQuery("pulse-feed", { limit: 60 }).then(async (rows) => {
            const items = rows.map((r) => ({
              ts: r[0] as string,
              event: r[1] as string,
              distinctId: r[2] as string,
              city: (r[3] as string) ?? null,
              country: (r[4] as string) ?? null,
              device: (r[5] as string) ?? null,
              displayName: null as string | null,
            }));
            await Promise.all(
              items.map(async (item) => {
                item.displayName = await resolveName(item.distinctId);
              })
            );
            feed = items;
          })
        );
        for (const dim of ["country", "city", "referrer", "device"]) {
          jobs.push(
            pulseQuery("pulse-breakdown", { dimension: dim }).then((rows) => {
              breakdowns = {
                ...breakdowns,
                [dim]: rows.map((r) => ({
                  name: r[0] as string,
                  visitors: r[1] as number,
                })),
              };
            })
          );
        }
      }

      await Promise.all(jobs);
      lastRefreshed = new Date();
      loadError = null;
    } catch (err) {
      console.error("[Pulse] refresh failed:", err);
      loadError = err instanceof Error ? err.message : "Refresh failed";
    } finally {
      loading = false;
    }
  }

  // --- Alert switches ---

  const alertItems: PreferenceItem[] = [
    {
      key: "adminNewUserSignup",
      label: "Signups & upgrades",
      description: "Someone creates an account or upgrades from guest",
    },
    {
      key: "adminUserReturned",
      label: "Returning users",
      description: "A known user opens the app again (max one ping per 6h each)",
    },
    {
      key: "adminQrScan",
      label: "QR scans",
      description: "Someone scans a shared code and lands on the scan page",
    },
    {
      key: "adminContentCreated",
      label: "Content created",
      description: "A user saves a sequence or creates a collection",
    },
  ];

  async function onToggle(key: keyof NotificationPreferences): Promise<void> {
    const uid = authState.effectiveUserId;
    if (!uid) return;
    busyKeys = new Set([...busyKeys, key]);
    try {
      await togglePreference(uid, key);
      preferences = { ...preferences, [key]: !preferences[key] };
    } catch {
      toast.error("Failed to update alert setting");
    } finally {
      const next = new Set(busyKeys);
      next.delete(key);
      busyKeys = next;
    }
  }

  // --- Display helpers ---

  const EVENT_LABELS: Record<string, { icon: string; text: string }> = {
    session_start: { icon: "fa-door-open", text: "opened the app" },
    card_scanned: { icon: "fa-qrcode", text: "scanned a QR code" },
    sequence_save: { icon: "fa-wand-magic-sparkles", text: "saved a sequence" },
    collection_create: { icon: "fa-folder-plus", text: "created a collection" },
    $identify: { icon: "fa-right-to-bracket", text: "signed in" },
  };

  function feedWho(item: FeedItem): string {
    if (item.displayName) return item.displayName;
    const place = item.city || item.country;
    return place ? `Guest in ${place}` : "A guest";
  }

  function feedWhen(ts: string): string {
    const t = Date.parse(ts.replace(" ", "T") + "Z");
    if (Number.isNaN(t)) return ts;
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  const heroCards = $derived(
    overview
      ? [
          { label: "Visitors", icon: "fa-earth-americas", values: overview.visitors },
          { label: "Signups", icon: "fa-user-plus", values: overview.signups },
          { label: "QR scans", icon: "fa-qrcode", values: overview.scans },
          { label: "Saves", icon: "fa-wand-magic-sparkles", values: overview.saves },
        ]
      : []
  );

  const BREAKDOWN_TITLES: Record<string, string> = {
    country: "Countries",
    city: "Cities",
    referrer: "Referrers",
    device: "Devices",
  };

  // --- Lifecycle: poll every 60s (light), full refresh every 5 min ---

  onMount(() => {
    let tick = 0;
    void refresh(true);
    void getPreferences(authState.effectiveUserId ?? "").then((p) => {
      preferences = p;
      prefsLoaded = true;
    });

    const interval = setInterval(() => {
      if (document.hidden) return;
      tick++;
      void refresh(tick % 5 === 0);
    }, 60_000);

    const onVisible = () => {
      if (!document.hidden) void refresh(false);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  });
</script>

<div class="pulse-dashboard themed-scrollbar">
  <header class="pulse-header">
    <div class="header-title">
      <h2><i class="fas fa-wave-square" aria-hidden="true"></i> Pulse</h2>
      <p class="subtitle">Live visitor activity — dev traffic and your own accounts excluded</p>
    </div>
    <div class="live-badge" class:has-visitors={liveTotal > 0}>
      <span class="live-dot" aria-hidden="true"></span>
      <span class="live-count">{liveTotal}</span>
      <span class="live-label">
        on the site now{liveAnon > 0 ? ` (${liveAnon} guest${liveAnon === 1 ? "" : "s"})` : ""}
      </span>
    </div>
  </header>

  {#if loading}
    <div class="state-block">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>Reading the pulse…</p>
    </div>
  {:else if loadError && !overview}
    <div class="state-block" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <p>{loadError}</p>
      <button class="retry-button" onclick={() => refresh(true)}>
        <i class="fas fa-rotate-right" aria-hidden="true"></i>
        Retry
      </button>
    </div>
  {:else}
    <!-- Hero counters -->
    <section class="hero-grid" aria-label="Activity totals">
      {#each heroCards as card (card.label)}
        <div class="hero-card">
          <div class="hero-card-header">
            <i class="fas {card.icon}" aria-hidden="true"></i>
            <span>{card.label}</span>
          </div>
          <div class="hero-values">
            <div class="hero-value">
              <span class="value">{card.values[0]}</span>
              <span class="window">today</span>
            </div>
            <div class="hero-value">
              <span class="value">{card.values[1]}</span>
              <span class="window">7d</span>
            </div>
            <div class="hero-value">
              <span class="value">{card.values[2]}</span>
              <span class="window">30d</span>
            </div>
          </div>
        </div>
      {/each}
    </section>

    <div class="pulse-columns">
      <!-- Activity feed -->
      <section class="panel feed-panel" aria-label="Recent activity">
        <h3><i class="fas fa-bolt" aria-hidden="true"></i> Recent activity</h3>
        {#if feed.length === 0}
          <p class="empty">No activity in the last 14 days.</p>
        {:else}
          <ul class="feed-list">
            {#each feed as item, i (item.ts + item.distinctId + i)}
              {@const label = EVENT_LABELS[item.event] ?? { icon: "fa-circle", text: item.event }}
              <li class="feed-item">
                <i class="fas {label.icon} feed-icon" aria-hidden="true"></i>
                <div class="feed-body">
                  <span class="feed-line">
                    <strong>{feedWho(item)}</strong>
                    {label.text}
                  </span>
                  <span class="feed-meta">
                    {feedWhen(item.ts)}
                    {#if item.displayName && (item.city || item.country)}
                      · {item.city || item.country}
                    {/if}
                    {#if item.device}
                      · {item.device.toLowerCase()}
                    {/if}
                  </span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <div class="side-column">
        <!-- Breakdowns -->
        {#each Object.entries(BREAKDOWN_TITLES) as [dim, title] (dim)}
          {@const rows = breakdowns[dim] ?? []}
          <section class="panel breakdown-panel" aria-label={title}>
            <h3>{title} <span class="panel-window">30d</span></h3>
            {#if rows.length === 0}
              <p class="empty">No data.</p>
            {:else}
              {@const max = rows[0]?.visitors ?? 1}
              <ul class="breakdown-list">
                {#each rows as row (row.name)}
                  <li class="breakdown-row">
                    <span class="breakdown-name" title={row.name}>{row.name}</span>
                    <span class="breakdown-bar-track" aria-hidden="true">
                      <span
                        class="breakdown-bar"
                        style="width: {Math.max(4, (row.visitors / max) * 100)}%"
                      ></span>
                    </span>
                    <span class="breakdown-count">{row.visitors}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </section>
        {/each}
      </div>
    </div>

    <!-- Alert switches -->
    <section class="panel alerts-panel" aria-label="Pulse alerts">
      <h3><i class="fas fa-bell" aria-hidden="true"></i> Phone alerts</h3>
      <p class="panel-desc">
        Each event type pings your devices through push. Muting a type stops
        both the push and the inbox entry.
      </p>
      {#if prefsLoaded}
        <PreferenceGroup
          title="Alert types"
          description="One switch per event type"
          items={alertItems}
          {preferences}
          isBusyKey={(key) => busyKeys.has(key)}
          {onToggle}
        />
      {:else}
        <p class="empty">Loading alert settings…</p>
      {/if}
    </section>

    {#if lastRefreshed}
      <p class="refresh-stamp">
        Updated {lastRefreshed.toLocaleTimeString()} · refreshes every minute
      </p>
    {/if}
  {/if}
</div>

<style>
  .pulse-dashboard {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    height: 100%;
    overflow-y: auto;
    color: var(--theme-text, #fff);
  }

  .pulse-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .header-title h2 {
    margin: 0;
    font-size: 1.4rem;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-title h2 i {
    color: #ec4899;
  }

  .subtitle {
    margin: 4px 0 0;
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.65;
  }

  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    min-height: var(--min-touch-target, 44px);
    border-radius: 999px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    font-variant-numeric: tabular-nums;
  }

  .live-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .live-badge.has-visitors .live-dot {
    background: #22c55e;
    box-shadow: 0 0 8px rgba(34, 197, 94, 0.8);
  }

  .live-count {
    font-weight: 700;
    min-width: 2ch;
    text-align: right;
  }

  .live-label {
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.8;
  }

  .state-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 16px;
    opacity: 0.8;
  }

  .state-block i {
    font-size: 2rem;
  }

  .retry-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 8px 20px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: inherit;
    cursor: pointer;
  }

  .hero-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .hero-card {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 14px 16px;
  }

  .hero-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.75;
    margin-bottom: 10px;
  }

  .hero-values {
    display: flex;
    gap: 16px;
  }

  .hero-value {
    display: flex;
    flex-direction: column;
    min-width: 3.5ch;
  }

  .hero-value .value {
    font-size: 1.5rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .hero-value .window {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.55;
  }

  .pulse-columns {
    display: grid;
    grid-template-columns: minmax(280px, 1.4fr) minmax(240px, 1fr);
    gap: 12px;
    align-items: start;
  }

  @media (max-width: 860px) {
    .pulse-columns {
      grid-template-columns: 1fr;
    }
  }

  .panel {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 14px 16px;
  }

  .panel h3 {
    margin: 0 0 10px;
    font-size: var(--font-size-base, 1rem);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-window {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.5;
    margin-left: auto;
  }

  .panel-desc {
    margin: 0 0 12px;
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.65;
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .feed-list,
  .breakdown-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .feed-list {
    gap: 2px;
    max-height: 560px;
    overflow-y: auto;
  }

  .feed-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 6px;
    border-radius: 8px;
  }

  .feed-item:nth-child(odd) {
    background: color-mix(in srgb, var(--theme-text, #fff) 3%, transparent);
  }

  .feed-icon {
    margin-top: 3px;
    width: 18px;
    text-align: center;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .feed-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .feed-line {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .feed-meta {
    font-size: 0.75rem;
    opacity: 0.55;
    font-variant-numeric: tabular-nums;
  }

  .breakdown-list {
    gap: 6px;
  }

  .breakdown-row {
    display: grid;
    grid-template-columns: minmax(80px, 40%) 1fr 3.5ch;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .breakdown-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .breakdown-bar-track {
    height: 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--theme-text, #fff) 8%, transparent);
    overflow: hidden;
  }

  .breakdown-bar {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, #f472b6, #ec4899);
  }

  .breakdown-count {
    text-align: right;
    font-variant-numeric: tabular-nums;
    opacity: 0.8;
  }

  .empty {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
    opacity: 0.55;
  }

  .refresh-stamp {
    margin: 0;
    text-align: center;
    font-size: 0.75rem;
    opacity: 0.45;
    font-variant-numeric: tabular-nums;
  }
</style>
