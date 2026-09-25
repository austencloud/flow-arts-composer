<!-- ActiveUsersPanel.svelte - Admin view of all users with activity-based presence -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { getUserActivityTracker } from "$lib/features/admin/get-user-activity-tracker";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  import type { UserPresenceWithId } from "$lib/shared/presence/domain/models/presence-models";
  import UserPresenceCard from "./active-users/UserPresenceCard.svelte";
  import UserDetailModal from "./UserDetailModal.svelte";
  import PanelGrid from "$lib/shared/components/panel/PanelGrid.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { PUBLIC_GOOGLE_MAPS_API_KEY } from "$lib/shared/maps/google-maps-api-key";
  import GlobalUserMap from "$lib/features/community/components/GlobalUserMap.svelte";
  import { buildUserPins } from "$lib/features/admin/services/user-pins";
  import type { UserActivityTracker } from "../services/user-activity-tracker";
  import { page } from "$app/state";
  import { removeCurrentUrlParams } from "$lib/shared/navigation/services/url-state";
  import {
    ADMIN_SESSION_TARGET_PARAM,
    ADMIN_USER_TARGET_PARAM,
    parseAdminSessionReplayTarget,
  } from "../domain/session-replay-target";

  // Services
  let userActivityService: UserActivityTracker | null = null;

  // State
  let users = $state<UserPresenceWithId[]>([]);
  let selectedUserId = $state<string | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let modalOpen = $state(false);
  let initialDetailTab = $state<"profile" | "activity">("profile");
  let targetSessionId = $state<string | null>(null);
  let consumedTargetKey = $state("");

  // Filter state: "all" | "active" | "inactive"
  let statusFilter = $state<"all" | "active" | "inactive">("all");

  // Real (signed-up) accounts — anonymous guest sessions are split out below.
  let realUsers = $derived(users.filter((u) => u.isAnonymous !== true));

  // Anonymous guests who are active right now (online + interacted < 5 min).
  // Stale/offline guest sessions are intentionally never shown.
  let liveAnonUsers = $derived(
    users.filter((u) => u.isAnonymous === true && u.activityStatus === "active")
  );

  // Stats computed from real accounts only
  let activeCount = $derived(
    realUsers.filter((u) => u.activityStatus === "active").length
  );
  let inactiveCount = $derived(
    realUsers.filter((u) => u.activityStatus !== "active").length
  );
  let totalUsers = $derived(realUsers.length);

  // Filtered users based on status filter
  let filteredUsers = $derived(
    statusFilter === "all"
      ? realUsers
      : statusFilter === "active"
        ? realUsers.filter((u) => u.activityStatus === "active")
        : realUsers.filter((u) => u.activityStatus !== "active")
  );

  const userPins = $derived(buildUserPins(users));
  const mapsApiKey = $derived(PUBLIC_GOOGLE_MAPS_API_KEY ?? "");
  const mapsKeyMissing = $derived(
    !mapsApiKey || mapsApiKey === "your-google-maps-api-key"
  );

  // Unsubscribe function
  let unsubscribe: (() => void) | null = null;

  $effect(() => {
    const target = parseAdminSessionReplayTarget(page.url.searchParams);
    if (!target) {
      consumedTargetKey = "";
      return;
    }

    const targetKey = `${target.userId}:${target.sessionId ?? ""}`;
    if (targetKey === consumedTargetKey) return;
    consumedTargetKey = targetKey;
    selectedUserId = target.userId;
    targetSessionId = target.sessionId;
    initialDetailTab = "activity";
    modalOpen = true;
  });

  onMount(async () => {
    try {
      userActivityService = getUserActivityTracker();

      if (userActivityService) {
        // Subscribe to all users (Firestore + presence data merged)
        unsubscribe = userActivityService.subscribeToAllUsers((allUsers) => {
          users = allUsers;
          isLoading = false;
        });
      }
    } catch (e) {
      console.error("Failed to initialize user activity service:", e);
      error = "Failed to load user data";
      isLoading = false;
    }
  });

  onDestroy(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  function selectUser(userId: string) {
    initialDetailTab = "profile";
    targetSessionId = null;
    selectedUserId = userId;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    targetSessionId = null;
    initialDetailTab = "profile";
    removeCurrentUrlParams([
      ADMIN_USER_TARGET_PARAM,
      ADMIN_SESSION_TARGET_PARAM,
    ]);
  }

  function handleUserDeleted() {
    // Remove user from local list and close modal
    if (selectedUserId) {
      users = users.filter((u) => u.userId !== selectedUserId);
      selectedUserId = null;
      modalOpen = false;
    }
  }

  function setFilter(filter: "all" | "active" | "inactive") {
    statusFilter = filter;
  }
</script>

<div class="active-users-panel">
  <header class="panel-header">
    <div class="header-content">
      <h2>{t("admin_active_users")}</h2>
      <p class="subtitle">{t("admin_presence_monitoring")}</p>
    </div>
    <div
      class="stats-row"
      role="group"
      aria-label={t("admin_filter_by_status")}
    >
      <button
        class="stat-button"
        class:selected={statusFilter === "active"}
        onclick={() => setFilter(statusFilter === "active" ? "all" : "active")}
        aria-pressed={statusFilter === "active"}
        aria-label={t("admin_filter_active", { count: activeCount.toString() })}
      >
        <span class="stat-value active" aria-hidden="true">{activeCount}</span>
        <span class="stat-label">{t("admin_active")}</span>
      </button>
      <button
        class="stat-button"
        class:selected={statusFilter === "inactive"}
        onclick={() =>
          setFilter(statusFilter === "inactive" ? "all" : "inactive")}
        aria-pressed={statusFilter === "inactive"}
        aria-label={t("admin_filter_inactive", {
          count: inactiveCount.toString(),
        })}
      >
        <span class="stat-value inactive" aria-hidden="true"
          >{inactiveCount}</span
        >
        <span class="stat-label">{t("admin_inactive")}</span>
      </button>
    </div>
  </header>

  <!-- Filter indicator -->
  {#if statusFilter !== "all"}
    <div class="filter-bar">
      <span class="filter-label">
        {t("admin_showing_users", {
          status: statusFilter,
          count: filteredUsers.length.toString(),
        })}
      </span>
      <button class="clear-filter" onclick={() => setFilter("all")}>
        <i class="fas fa-times" aria-hidden="true"></i>
        {t("admin_show_all")}
      </button>
    </div>
  {/if}

  <div class="active-users-body">
    {#if isLoading}
      <div class="loading" role="status" aria-live="polite" aria-busy="true">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>{t("admin_loading_users")}</span>
      </div>
    {:else if error}
      <div class="error">
        <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
        <span>{error}</span>
      </div>
    {:else if realUsers.length === 0}
      <div class="empty">
        <i class="fas fa-users" aria-hidden="true"></i>
        <span>{t("admin_no_users_found")}</span>
        <p>{t("admin_no_registered_users")}</p>
      </div>
    {:else if filteredUsers.length === 0}
      <div class="empty">
        <i class="fas fa-filter" aria-hidden="true"></i>
        <span>{t("admin_no_status_users", { status: statusFilter })}</span>
        <button class="link-button" onclick={() => setFilter("all")}>
          {t("admin_show_all_users")}
        </button>
      </div>
    {:else}
      <div class="users-grid-container themed-scrollbar">
        <PanelGrid minCardWidth="200px" gap="16px">
          {#each filteredUsers as user (user.userId)}
            <UserPresenceCard {user} onSelect={() => selectUser(user.userId)} />
          {/each}
        </PanelGrid>
      </div>
    {/if}
  </div>

  <!-- Anonymous Activity: only guests active right now (no stale sessions) -->
  {#if !isLoading && liveAnonUsers.length > 0}
    <section class="anon-activity" aria-label={t("admin_anonymous_activity")}>
      <header class="anon-header">
        <div class="anon-title-group">
          <h3 class="anon-title">{t("admin_anonymous_activity")}</h3>
          <p class="anon-hint">{t("admin_anonymous_activity_hint")}</p>
        </div>
        <span class="anon-count">
          {t("admin_anonymous_online", {
            count: liveAnonUsers.length.toString(),
          })}
        </span>
      </header>
      <div class="anon-grid-container themed-scrollbar">
        <PanelGrid minCardWidth="200px" gap="16px">
          {#each liveAnonUsers as user (user.userId)}
            <UserPresenceCard {user} onSelect={() => selectUser(user.userId)} />
          {/each}
        </PanelGrid>
      </div>
    </section>
  {/if}

  <!-- User Map: where signed-in users connect from (IP geo) -->
  {#if !isLoading && userPins.length > 0}
    <section class="user-map-section" aria-label={t("admin_user_map")}>
      <header class="user-map-header">
        <h3 class="user-map-title">{t("admin_user_map")}</h3>
        <p class="user-map-hint">{t("admin_user_map_hint")}</p>
      </header>
      {#if mapsKeyMissing}
        <p class="user-map-key-missing">{t("admin_user_map_key_missing")}</p>
      {:else}
        <div class="user-map-container">
          <GlobalUserMap
            locations={[]}
            userLocation={null}
            apiKey={mapsApiKey}
            scanMarkers={userPins}
            onScanMarkerClick={(id) => selectUser(id)}
          />
        </div>
      {/if}
    </section>
  {/if}

  <!-- User Detail Modal -->
  <UserDetailModal
    bind:open={modalOpen}
    userId={selectedUserId}
    initialTab={initialDetailTab}
    {targetSessionId}
    onclose={closeModal}
    onUserDeleted={handleUserDeleted}
  />
</div>

<style>
  .active-users-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1.5rem;
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
  }

  .header-content h2 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .subtitle {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .stats-row {
    display: flex;
    gap: 0.5rem;
  }

  .stat-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .stat-button:hover {
    background: var(--theme-card-hover-bg);
  }

  .stat-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .stat-button.selected {
    background: var(--theme-accent-bg);
    border-color: var(--theme-accent);
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text);
  }

  .stat-value.active {
    color: var(--semantic-success);
  }

  .stat-value.inactive {
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .stat-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1.5rem;
    background: var(--theme-accent-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .filter-label {
    font-size: 0.875rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .clear-filter {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    font-size: 0.75rem;
    cursor: pointer;
    transition: color var(--duration-fast) ease;
  }

  .clear-filter:hover {
    color: var(--theme-text);
  }

  .clear-filter:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .link-button {
    background: transparent;
    border: none;
    color: var(--theme-accent);
    font-size: 0.875rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .link-button:hover {
    color: var(--theme-accent-hover);
  }

  .link-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .active-users-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .loading,
  .error,
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    height: 100%;
    color: var(--theme-text-secondary, var(--theme-text-dim));
    text-align: center;
  }

  .error {
    color: var(--semantic-error);
  }

  .empty i,
  .error i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .users-grid-container {
    padding: 1rem;
    overflow-y: auto;
    height: 100%;
  }

  .anon-activity {
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke);
  }

  .anon-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.5rem 0.5rem;
  }

  .anon-title-group {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .anon-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .anon-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .anon-count {
    flex-shrink: 0;
    padding: 0.25rem 0.625rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--semantic-success) 18%, transparent);
    color: var(--semantic-success);
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .anon-grid-container {
    padding: 0.5rem 1rem 1rem;
  }

  .user-map-section {
    flex-shrink: 0;
    border-top: 1px solid var(--theme-stroke);
    padding: 1rem 1.5rem 1.5rem;
  }

  .user-map-header {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin-bottom: 0.75rem;
  }

  .user-map-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text);
  }

  .user-map-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .user-map-key-missing {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .user-map-container {
    border-radius: 12px;
    overflow: hidden;
  }
</style>
