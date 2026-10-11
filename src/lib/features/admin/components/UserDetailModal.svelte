<script lang="ts">
  import { tick } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import AvatarImage from "#lib/shared/browse/components/AvatarImage.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import ProfileAdminSection from "./ProfileAdminSection.svelte";
  import { getUserProfile } from "#lib/shared/community/services/user-repository.js";
  import type { AdminUserProfile } from "../domain/admin-user-profile";
  import { auth } from "#lib/shared/auth/firebase.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import UserActivityAnalytics from "./UserActivityAnalytics.svelte";

  type Tab = "profile" | "activity" | "admin";
  type AuthData = {
    uid: string;
    email: string | null;
    emailVerified: boolean;
    phoneNumber: string | null;
    disabled: boolean;
    providers: Array<{ providerId: string }>;
    metadata: { creationTime?: string; lastSignInTime?: string };
    multiFactor: {
      enrolledFactors: Array<{ factorId: string; displayName: string | null }>;
    } | null;
    adminMetadata: {
      adminLabel: string | null;
      adminNotes: string | null;
    };
    contributor: { active: boolean; id: string | null };
    privateProfile: {
      lastLocation: AdminUserProfile["location"];
    };
  };

  interface Props {
    open: boolean;
    userId: string | null;
    initialTab?: Tab;
    targetSessionId?: string | null;
    onclose: () => void;
    onUserDeleted?: () => void;
  }

  let {
    open = $bindable(false),
    userId,
    initialTab = "profile",
    targetSessionId = null,
    onclose,
    onUserDeleted,
  }: Props = $props();
  let userProfile = $state<AdminUserProfile | null>(null);
  let authData = $state<AuthData | null>(null);
  let loading = $state(false);
  let notFound = $state(false);
  let notFoundMessage = $state("User not found");
  let loadError = $state<string | null>(null);
  let activeTab = $state<Tab>("profile");
  let hasVisitedActivity = $state(false);
  let hasVisitedAdmin = $state(false);
  let shellElement: HTMLDivElement | undefined;
  let requestGeneration = 0;
  let retryGeneration = $state(0);

  const isAdmin = $derived(authState.isAdmin);
  const tabs = $derived([
    {
      value: "profile" as const,
      label: "Profile",
      id: "user-detail-tab-profile",
      controls: "user-detail-panel-profile",
    },
    {
      value: "activity" as const,
      label: "Activity",
      id: "user-detail-tab-activity",
      controls: "user-detail-panel-activity",
    },
    ...(isAdmin
      ? [
          {
            value: "admin" as const,
            label: "Admin",
            id: "user-detail-tab-admin",
            controls: "user-detail-panel-admin",
          },
        ]
      : []),
  ]);

  $effect(() => {
    const uid = userId;
    const shouldLoad = open && !!uid;
    const requestedTab = initialTab;
    retryGeneration;
    if (!shouldLoad || !uid) return;
    const generation = ++requestGeneration;
    const controller = new AbortController();
    activeTab = requestedTab;
    hasVisitedActivity = requestedTab === "activity";
    hasVisitedAdmin = false;
    void resetBodyScroll();
    void loadUser(uid, generation, controller.signal);
    return () => controller.abort();
  });

  async function loadUser(
    uid: string,
    generation: number,
    signal: AbortSignal
  ) {
    loading = true;
    loadError = null;
    notFound = false;
    notFoundMessage = "User not found";
    userProfile = null;
    authData = null;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Admin session expired");
      const token = await currentUser.getIdToken();
      const authResponse = await fetch(
        `/api/admin/user-auth/${encodeURIComponent(uid)}`,
        {
          signal,
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (generation !== requestGeneration || signal.aborted) return;

      // The admin endpoint migrates private legacy fields before this read.
      const profile = await getUserProfile(uid, authState.user?.uid);
      if (generation !== requestGeneration || signal.aborted) return;
      if (!profile && authResponse.status === 404) {
        notFound = true;
        notFoundMessage = "No Auth account or Firestore profile was found.";
        return;
      }
      if (authResponse.status === 404) {
        notFound = true;
        notFoundMessage =
          "The Firestore profile exists, but the Auth account is missing.";
        return;
      }
      if (!profile) {
        notFound = true;
        notFoundMessage =
          "The Auth account exists, but the Firestore profile is missing.";
        return;
      }

      const body = (await authResponse.json().catch(() => ({}))) as AuthData & {
        message?: string;
      };
      if (generation !== requestGeneration || signal.aborted) return;
      if (!authResponse.ok) {
        throw new Error(
          body.message || `Auth lookup failed (${authResponse.status})`
        );
      }

      userProfile = {
        ...profile,
        adminLabel: body.adminMetadata.adminLabel ?? undefined,
        adminNotes: body.adminMetadata.adminNotes ?? undefined,
        location: body.privateProfile?.lastLocation ?? null,
        isDisabled: body.disabled,
      };
      authData = body;
    } catch (cause) {
      if (signal.aborted || generation !== requestGeneration) return;
      loadError =
        cause instanceof Error
          ? cause.message
          : "User details could not be loaded";
    } finally {
      if (generation === requestGeneration && !signal.aborted) loading = false;
    }
  }

  function retry() {
    retryGeneration += 1;
  }

  function selectTab(tab: Tab) {
    activeTab = tab;
    if (tab === "activity") hasVisitedActivity = true;
    if (tab === "admin") hasVisitedAdmin = true;
    void resetBodyScroll();
  }

  async function resetBodyScroll() {
    await tick();
    const modalBody = shellElement?.closest<HTMLElement>(".modal-body");
    if (modalBody) modalBody.scrollTop = 0;
  }

  function handleAdminUpdate(updates: Partial<AdminUserProfile>) {
    if (userProfile) userProfile = { ...userProfile, ...updates };
    if (authData && typeof updates.isDisabled === "boolean") {
      authData = { ...authData, disabled: updates.isDisabled };
    }
  }

  function handleUserDeleted() {
    onUserDeleted?.();
    onclose();
  }

  function formatDate(value: Date | string | undefined | null): string {
    if (!value) return "Unknown";
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime())
      ? "Unknown"
      : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  }

  function roleColor(role: string | undefined): string {
    if (role === "admin") return "var(--semantic-error)";
    if (role === "tester") return "var(--semantic-info)";
    if (role === "premium") return "var(--semantic-warning)";
    return "var(--theme-text-dim)";
  }

  function location(profile: AdminUserProfile): string {
    return (
      [profile.location?.city, profile.location?.country]
        .filter(Boolean)
        .join(", ") || "Unknown"
    );
  }

  function propIdentity(profile: AdminUserProfile): string {
    const props = profile.propsISpinWith?.join(", ");
    return (profile.favoriteProp ?? profile.activeProp ?? props) || "Unknown";
  }

  function providerLabel(providerId: string): string {
    const known: Record<string, string> = {
      "google.com": "Google",
      "apple.com": "Apple",
      "facebook.com": "Facebook",
      password: "Email and password",
      phone: "Phone",
    };
    return known[providerId] ?? providerId;
  }

  function providers(data: AuthData): string {
    return (
      data.providers
        .map(({ providerId }) => providerLabel(providerId))
        .join(", ") || "None"
    );
  }
</script>

<BaseModal
  bind:open
  {onclose}
  size="xl"
  class="user-detail-modal"
  labelledBy="user-detail-title"
  closeOnBackdrop={true}
  closeOnEscape={true}
>
  {#snippet header()}
    <header class="modal-header" class:has-user={!!userProfile && !!authData}>
      {#if userProfile && authData}
        <div class="header-identity">
          <AvatarImage
            src={userProfile.avatar}
            alt={userProfile.displayName}
            name={userProfile.displayName}
            size={72}
            className="header-avatar"
          />
          <div class="header-copy">
            <p class="eyebrow">User detail</p>
            <div class="name-line">
              <h2 id="user-detail-title">{userProfile.displayName}</h2>
              <div class="badges" aria-label="Account status">
                <span
                  class="badge role"
                  style="--role-color: {roleColor(userProfile.role)}"
                  >{userProfile.role ?? "user"}</span
                >
                <span
                  class:danger={authData.disabled}
                  class:success={!authData.disabled}
                  class="badge"
                  >{authData.disabled ? "Disabled" : "Enabled"}</span
                >
                {#if userProfile.isHidden}<span class="badge warning"
                    >Hidden</span
                  >{/if}
              </div>
            </div>
            <div class="identity-meta">
              <span>@{userProfile.username}</span>
              <span class="meta-divider" aria-hidden="true"></span>
              <span>{authData.email ?? "No email"}</span>
            </div>
          </div>
        </div>

        <nav class="header-tabs" aria-label="User detail sections">
          <SegmentedControl
            options={tabs}
            value={activeTab}
            onchange={selectTab}
            semantics="tabs"
            color="accent"
            ariaLabel="User detail sections"
          />
        </nav>
      {:else}
        <div class="header-placeholder">
          <p class="eyebrow">User detail</p>
          <h2 id="user-detail-title">Account</h2>
        </div>
      {/if}

      <button
        class="close-btn"
        onclick={onclose}
        aria-label="Close user detail"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </header>
  {/snippet}

  <div class="user-detail-shell" bind:this={shellElement}>
    {#if loading}
      <div class="center-state" aria-live="polite">
        <ProgressRing percent={-1} size={36} strokeWidth={3} />
        <span>Loading user details</span>
      </div>
    {:else if loadError}
      <div class="center-state error" role="alert">
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        <p>{loadError}</p>
        <button class="retry-btn" onclick={retry}>Retry</button>
      </div>
    {:else if notFound || !userProfile || !authData}
      <div class="center-state">
        <i class="fas fa-user-slash" aria-hidden="true"></i>
        <p>{notFoundMessage}</p>
      </div>
    {:else}
      {#if activeTab === "profile"}
        <div
          id="user-detail-panel-profile"
          role="tabpanel"
          aria-labelledby="user-detail-tab-profile"
          tabindex="0"
          class="panel profile-panel"
        >
          <section
            class="profile-card account-card"
            aria-labelledby="account-facts-title"
          >
            <header class="card-heading">
              <span class="heading-icon"
                ><i class="fas fa-key" aria-hidden="true"></i></span
              >
              <div>
                <h3 id="account-facts-title">Account</h3>
                <p>Authentication and recovery</p>
              </div>
            </header>
            <dl class="detail-list">
              <div>
                <dt>Email verified</dt>
                <dd
                  class:positive={authData.emailVerified}
                  class:negative={!authData.emailVerified}
                >
                  <i
                    class="fas {authData.emailVerified
                      ? 'fa-circle-check'
                      : 'fa-circle-xmark'}"
                    aria-hidden="true"
                  ></i>
                  {authData.emailVerified ? "Verified" : "Not verified"}
                </dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{authData.phoneNumber ?? "None"}</dd>
              </div>
              <div>
                <dt>Sign-in methods</dt>
                <dd>{providers(authData)}</dd>
              </div>
              <div>
                <dt>Multi-factor auth</dt>
                <dd>
                  {authData.multiFactor?.enrolledFactors.length ?? 0} enrolled
                </dd>
              </div>
            </dl>
          </section>

          <section
            class="profile-card timeline-card"
            aria-labelledby="timeline-title"
          >
            <header class="card-heading">
              <span class="heading-icon"
                ><i class="fas fa-timeline" aria-hidden="true"></i></span
              >
              <div>
                <h3 id="timeline-title">Timeline</h3>
                <p>Auth and profile timestamps</p>
              </div>
            </header>
            <dl class="timeline-list">
              <div>
                <dt>Auth created</dt>
                <dd>{formatDate(authData.metadata.creationTime)}</dd>
              </div>
              <div>
                <dt>Profile joined</dt>
                <dd>{formatDate(userProfile.joinedDate)}</dd>
              </div>
              <div>
                <dt>Last sign-in</dt>
                <dd>{formatDate(authData.metadata.lastSignInTime)}</dd>
              </div>
              <div>
                <dt>Profile activity</dt>
                <dd>{formatDate(userProfile.lastActiveAt)}</dd>
              </div>
            </dl>
          </section>

          <section
            class="profile-card community-card"
            aria-labelledby="community-title"
          >
            <header class="card-heading">
              <span class="heading-icon"
                ><i class="fas fa-people-group" aria-hidden="true"></i></span
              >
              <div>
                <h3 id="community-title">Community</h3>
                <p>Published profile totals</p>
              </div>
            </header>
            <div class="community-grid" aria-label="Profile counts">
              <div>
                <strong>{userProfile.sequenceCount ?? 0}</strong><span
                  >Sequences</span
                >
              </div>
              <div>
                <strong>{userProfile.collectionCount ?? 0}</strong><span
                  >Collections</span
                >
              </div>
              <div>
                <strong>{userProfile.followerCount ?? 0}</strong><span
                  >Followers</span
                >
              </div>
              <div>
                <strong>{userProfile.followingCount ?? 0}</strong><span
                  >Following</span
                >
              </div>
            </div>
          </section>

          <section
            class="profile-card context-card"
            aria-labelledby="context-title"
          >
            <header class="card-heading">
              <span class="heading-icon"
                ><i class="fas fa-fingerprint" aria-hidden="true"></i></span
              >
              <div>
                <h3 id="context-title">Profile context</h3>
                <p>Identity details supplied by the user or an admin</p>
              </div>
            </header>
            <dl class="context-grid">
              <div>
                <dt>
                  <i class="fas fa-location-dot" aria-hidden="true"></i>Location
                </dt>
                <dd>{location(userProfile)}</dd>
              </div>
              <div>
                <dt>
                  <i class="fas fa-wand-magic-sparkles" aria-hidden="true"
                  ></i>Prop identity
                </dt>
                <dd>{propIdentity(userProfile)}</dd>
              </div>
              <div>
                <dt>
                  <i class="fas fa-user-tag" aria-hidden="true"></i>Known as
                </dt>
                <dd>{userProfile.adminLabel || "Not set"}</dd>
              </div>
              <div class="bio-field">
                <dt><i class="fas fa-quote-left" aria-hidden="true"></i>Bio</dt>
                <dd>{userProfile.bio || "No bio provided"}</dd>
              </div>
            </dl>
          </section>
        </div>
      {/if}

      {#if hasVisitedActivity}
        <div
          id="user-detail-panel-activity"
          role="tabpanel"
          aria-labelledby="user-detail-tab-activity"
          tabindex="0"
          class="panel"
          hidden={activeTab !== "activity"}
        >
          <UserActivityAnalytics
            userId={userProfile.id}
            userDisplayName={userProfile.displayName}
            userUsername={userProfile.username}
            userEmail={authData?.email}
            {targetSessionId}
          />
        </div>
      {/if}

      {#if hasVisitedAdmin && isAdmin}
        <div
          id="user-detail-panel-admin"
          role="tabpanel"
          aria-labelledby="user-detail-tab-admin"
          tabindex="0"
          class="panel"
          hidden={activeTab !== "admin"}
        >
          <ProfileAdminSection
            {userProfile}
            contributorActive={authData.contributor?.active ?? false}
            onUserUpdated={handleAdminUpdate}
            onUserDeleted={handleUserDeleted}
          />
        </div>
      {/if}
    {/if}
  </div>
</BaseModal>

<style>
  .modal-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-panel-bg) 96%, transparent);
  }

  .modal-header.has-user {
    grid-template-columns: minmax(0, 1fr) minmax(22rem, 30rem) auto;
  }

  .header-identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }

  .header-copy {
    min-width: 0;
  }

  .eyebrow {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    letter-spacing: 0.075em;
    text-transform: uppercase;
  }

  .name-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.75rem;
    margin-top: 0.15rem;
  }

  .modal-header h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: var(--theme-text);
    font-size: var(--font-size-xl);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .identity-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    margin-top: 0.3rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .identity-meta span:not(.meta-divider) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta-divider {
    flex: none;
    width: 0.25rem;
    height: 0.25rem;
    border-radius: 50%;
    background: var(--theme-stroke-strong);
  }

  .badges {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .badge {
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: var(--theme-card-hover-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 650;
    text-transform: capitalize;
  }

  .badge.role {
    color: var(--role-color);
    background: color-mix(in srgb, var(--role-color) 14%, transparent);
  }

  .badge.danger {
    color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 14%, transparent);
  }

  .badge.success {
    color: var(--semantic-success);
    background: color-mix(in srgb, var(--semantic-success) 14%, transparent);
  }

  .badge.warning {
    color: var(--semantic-warning);
    background: color-mix(in srgb, var(--semantic-warning) 14%, transparent);
  }

  .header-tabs {
    width: 100%;
    min-width: 0;
  }

  .header-placeholder h2 {
    margin-top: 0.15rem;
  }

  .close-btn,
  .retry-btn {
    display: grid;
    place-items: center;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
  }

  .close-btn:hover,
  .retry-btn:hover {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  .close-btn:focus-visible,
  .retry-btn:focus-visible,
  .panel:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .user-detail-shell {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    min-height: 20rem;
    padding: 1.25rem;
  }

  .center-state {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 18rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .center-state.error {
    color: var(--semantic-error);
  }

  .center-state p {
    margin: 0;
  }

  .panel {
    container-type: inline-size;
    min-width: 0;
  }

  .panel[hidden] {
    display: none;
  }

  .profile-panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "account"
      "timeline"
      "community"
      "context";
    gap: 1rem;
    align-items: stretch;
  }

  .profile-card {
    min-width: 0;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--theme-card-bg) 88%, transparent);
  }

  .account-card {
    grid-area: account;
  }

  .timeline-card {
    grid-area: timeline;
  }

  .community-card {
    grid-area: community;
  }

  .context-card {
    grid-area: context;
  }

  .card-heading {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .heading-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.625rem;
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    color: var(--theme-accent);
  }

  .card-heading h3 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-base);
    font-weight: 650;
  }

  .card-heading p {
    margin: 0.2rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .detail-list,
  .timeline-list,
  .context-grid {
    margin: 0;
  }

  .detail-list > div,
  .timeline-list > div {
    display: grid;
    grid-template-columns: minmax(7rem, 0.8fr) minmax(0, 1.2fr);
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .detail-list > div:first-child,
  .timeline-list > div:first-child {
    padding-top: 0;
  }

  .detail-list > div:last-child,
  .timeline-list > div:last-child {
    padding-bottom: 0;
    border-bottom: 0;
  }

  .detail-list dt,
  .timeline-list dt,
  .context-grid dt {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .detail-list dd,
  .timeline-list dd,
  .context-grid dd {
    min-width: 0;
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 550;
    overflow-wrap: anywhere;
  }

  .detail-list dd {
    text-align: right;
  }

  .detail-list dd.positive,
  .detail-list dd.negative {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .detail-list dd.positive {
    color: var(--semantic-success);
  }

  .detail-list dd.negative {
    color: var(--semantic-error);
  }

  .timeline-list > div {
    position: relative;
    grid-template-columns: minmax(7rem, 0.7fr) minmax(0, 1.3fr);
    padding-left: 1.25rem;
  }

  .timeline-list > div::before {
    position: absolute;
    top: 1rem;
    left: 0;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--theme-accent);
    content: "";
  }

  .timeline-list > div:first-child::before {
    top: 0.25rem;
  }

  .timeline-list dd {
    font-variant-numeric: tabular-nums;
  }

  .community-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.625rem;
  }

  .community-grid > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-height: 5rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-panel-bg);
  }

  .community-grid strong {
    color: var(--theme-text);
    font-size: var(--font-size-xl);
    font-variant-numeric: tabular-nums;
  }

  .community-grid span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .context-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.625rem;
  }

  .context-grid > div {
    min-width: 0;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-panel-bg);
  }

  .context-grid dt {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .context-grid dt i {
    width: 1rem;
    color: var(--theme-accent);
    text-align: center;
  }

  .context-grid dd {
    margin-top: 0.4rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  @container (min-width: 44rem) {
    .profile-panel {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        "account timeline"
        "community context";
    }

    .context-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .bio-field {
      grid-column: 1 / -1;
    }
  }

  @container (min-width: 76rem) {
    .profile-panel {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-template-areas:
        "account timeline community"
        "context context context";
    }

    .context-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .bio-field {
      grid-column: 1 / -1;
    }
  }

  @media (min-width: 1680px) {
    :global(dialog.user-detail-modal[data-size="xl"]) {
      width: min(92vw, 108rem);
    }
  }

  @media (min-width: 2400px) {
    :global(dialog.user-detail-modal[data-size="xl"]) {
      width: min(92vw, 120rem);
    }
  }

  @media (min-width: 2600px) {
    :global(dialog.user-detail-modal[data-size="xl"]) {
      max-height: min(
        94dvh,
        calc(
          var(--viewport-height, 100dvh) - 3rem -
            env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)
        )
      );
      --font-size-compact: 1rem;
      --font-size-sm: 1.125rem;
      --font-size-base: 1.25rem;
      --font-size-lg: 1.5rem;
      --font-size-xl: 1.75rem;
      --min-touch-target: 3.75rem;
    }

    .modal-header {
      gap: 2rem;
      padding: 1.5rem 2rem;
    }

    .header-identity {
      gap: 1.5rem;
    }

    :global(.header-avatar) {
      width: 5.25rem !important;
      height: 5.25rem !important;
    }

    :global(.header-avatar .robust-avatar) {
      width: 100% !important;
      height: 100% !important;
    }

    .user-detail-shell {
      padding: 2rem;
    }

    .profile-panel {
      gap: 1.5rem;
    }

    .profile-card {
      padding: 1.5rem;
      border-radius: 1.125rem;
    }

    .card-heading {
      margin-bottom: 1.5rem;
    }

    .detail-list > div,
    .timeline-list > div {
      padding-block: 1rem;
    }
  }

  @media (min-width: 3200px) {
    :global(dialog.user-detail-modal[data-size="xl"]) {
      width: min(92vw, 136rem);
    }
  }

  @media (max-width: 960px) {
    .modal-header.has-user {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .header-tabs {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .close-btn {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media (max-width: 540px) {
    .modal-header {
      gap: 0.625rem;
      padding: 0.75rem;
    }

    :global(.header-avatar) {
      width: 3rem !important;
      height: 3rem !important;
    }

    :global(.header-avatar .robust-avatar) {
      width: 100% !important;
      height: 100% !important;
    }

    .header-identity {
      gap: 0.625rem;
    }

    .name-line {
      gap: 0.25rem 0.5rem;
    }

    .modal-header h2 {
      font-size: var(--font-size-lg);
    }

    .identity-meta {
      font-size: var(--font-size-compact);
      flex-wrap: wrap;
      gap: 0.15rem 0.4rem;
    }

    .identity-meta .meta-divider {
      display: none;
    }

    .identity-meta span:last-child {
      flex-basis: 100%;
    }

    .badge {
      padding: 0.15rem 0.4rem;
    }

    .user-detail-shell {
      min-height: 15rem;
      padding: 0.75rem;
    }

    .profile-card {
      padding: 0.875rem;
    }

    .detail-list > div,
    .timeline-list > div {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }

    .detail-list dd,
    .detail-list dd.positive,
    .detail-list dd.negative {
      justify-content: flex-start;
      text-align: left;
    }
  }

  @media (max-height: 500px) and (min-width: 700px) {
    .modal-header.has-user {
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 22rem) auto;
      gap: 0.625rem;
      padding: 0.5rem 0.75rem;
    }

    :global(.header-avatar) {
      width: 2.75rem !important;
      height: 2.75rem !important;
    }

    :global(.header-avatar .robust-avatar) {
      width: 100% !important;
      height: 100% !important;
    }

    .header-tabs {
      grid-column: 2;
      grid-row: 1;
    }

    .close-btn {
      grid-column: 3;
      grid-row: 1;
    }

    .eyebrow,
    .identity-meta span:last-child,
    .identity-meta .meta-divider {
      display: none;
    }

    .user-detail-shell {
      min-height: 12rem;
      padding: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-btn,
    .retry-btn {
      transition: none;
    }
  }
</style>
