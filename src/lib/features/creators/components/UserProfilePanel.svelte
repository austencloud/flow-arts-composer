<script lang="ts">
  import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount, untrack } from "svelte";
  import {
    getUserProfile,
    followUser,
    unfollowUser,
    setCreatorDisabled,
    getFollowers,
    getFollowing,
  } from "#lib/shared/community/services/user-repository.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { authDrawerState } from "#lib/shared/auth/state/auth-drawer-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { profileActionsFor } from "../domain/profile-viewer";
  import { creatorsDataState } from "../state/creators-data-state.svelte";
  import { createProfileSession } from "../state/profile-session.svelte";
  import { hasProfileWork } from "../domain/profile-tenure";
  import { scene3dCollectionState } from "#lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte.js";
  import { tunnelCollectionState } from "#lib/features/tunnel-collection/state/tunnel-collection-state.svelte.js";
  import { mandalaCollectionState } from "#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
  import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    openCreatorProfile,
    backToCreatorsList,
  } from "../state/creators-routing.svelte";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import ProfileHeaderBar from "./profile/ProfileHeaderBar.svelte";
  import ProfileHeroSection from "./profile/ProfileHeroSection.svelte";
  import ProfileStage from "./profile/stage/ProfileStage.svelte";
  import ProfileWorkEmpty from "./profile/ProfileWorkEmpty.svelte";
  import ProfileConnectionSection from "./profile/ProfileConnectionSection.svelte";
  import FollowersModal from "./profile/FollowersModal.svelte";
  import { openSequenceViewer } from "#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js";

  interface Props {
    userId: string;
  }

  let { userId }: Props = $props();

  // The host keys this panel by userId, so one panel only ever shows one person.
  const session = createProfileSession(
    untrack(() => userId),
    {
      fetchProfile: (id, viewerId) => getUserProfile(id, viewerId),
      fetchSequences: (id, isOwn) =>
        getLibraryRepository().getUserSequences(id, {
          visibility: isOwn ? undefined : "public",
        }),
      follow: (viewerId, id) => followUser(viewerId, id, "creator_profile"),
      unfollow: (viewerId, id) => unfollowUser(viewerId, id, "creator_profile"),
      setDisabled: setCreatorDisabled,
      startOwnStores: (id) => {
        scene3dCollectionState.ensureStarted(id);
        tunnelCollectionState.ensureStarted(id);
        mandalaCollectionState.ensureStarted(id);
      },
    }
  );
  const userProfile = $derived<EnhancedUserProfile | null>(session.profile);
  const userSequences = $derived<LibrarySequence[]>(session.sequences);
  const isLoading = $derived(session.isLoading);
  const failure = $derived(session.failure);
  const followInProgress = $derived(session.followInProgress);

  // Followers/Following modal state
  let followersModalOpen = $state(false);
  let followersModalType = $state<"followers" | "following">("followers");
  let followerUsers = $state<UserProfile[]>([]);
  let followingUsers = $state<UserProfile[]>([]);
  let followersLoading = $state(false);
  let followingLoading = $state(false);
  let followersLoaded = $state(false);
  let followingLoaded = $state(false);

  // Services
  let hapticService: HapticFeedback;

  const currentUserId = $derived(authState.user?.uid);
  const isOwnProfile = $derived(currentUserId === userId);
  const actions = $derived(
    profileActionsFor({
      viewerId: currentUserId,
      isFullAccount: authState.isFullAccount,
      isOwnProfile,
    })
  );
  const failureTitle = $derived(
    failure === "not-found" || !failure
      ? t("creators_profile_not_found_title")
      : t("creators_profile_load_failed_title")
  );
  const failureMessage = $derived.by(() => {
    switch (failure) {
      case "denied":
        return t("creators_profile_load_denied");
      case "offline":
        return t("creators_profile_load_offline");
      case "unknown":
        return t("creators_profile_load_unknown");
      default:
        return t("creators_profile_not_found_body");
    }
  });

  /**
   * The composition is decided HERE, before anything paints.
   *
   * It used to be reported up from the stage, defaulting to "has work" until the
   * stage's own Firestore read settled. On an empty profile that painted the
   * two-column layout with a hole where the work should be, then collapsed to the
   * centred card — a visible jump on every empty profile, which is most of them.
   * Austen (2026-07-29): "we should have a consistent layout and we should show it
   * as empty if it really is empty rather than showing it empty and then
   * immediately making the whole thing disappear."
   *
   * There is nothing to wait for: `onMount` already awaits the full sequence list
   * before it clears `isLoading`, and pinned items ride on the profile document.
   * So every input is in hand at first paint and the layout never changes shape.
   * `hasProfileWork` is the same predicate the stage used, so the two cannot
   * disagree about what "empty" means.
   */
  const savedTotal = $derived(
    isOwnProfile
      ? scene3dCollectionState.collection.length +
          tunnelCollectionState.collection.length +
          mandalaCollectionState.collection.length
      : undefined
  );

  const hasWork = $derived(
    hasProfileWork({
      showcase: userProfile?.pinnedItems?.length ?? 0,
      sequences: userSequences.length,
      collections: savedTotal ?? 0,
    })
  );

  /**
   * Saved art is owner-only by Firestore rule, so a visitor has nothing to wait
   * for. On your own profile the three stores are global singletons that are
   * usually already warm; when they are not, holding the loading state for them
   * is what keeps the composition from being decided on a count of zero that is
   * about to become forty-six.
   */
  const collectionsSettled = $derived(
    !isOwnProfile ||
      (!scene3dCollectionState.loading &&
        !tunnelCollectionState.loading &&
        !mandalaCollectionState.loading)
  );

  const modalUsers = $derived(
    followersModalType === "followers" ? followerUsers : followingUsers
  );
  const modalLoading = $derived(
    followersModalType === "followers" ? followersLoading : followingLoading
  );

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Loads on mount, and again when the viewer changes after it: on a warm
  // reload auth restores after the shell renders, and without this the Follow
  // button and own-profile view stayed as they were for a signed-out visitor.
  $effect(() => {
    const viewerId = currentUserId;
    void untrack(() => session.syncViewer(viewerId));
  });

  function handleBack() {
    hapticService?.trigger("selection");
    // Return to the creators list. The browser Back button walks the full pushed
    // history (including profile -> profile) via the panel's popstate handler;
    // this in-page button always lands safely on the list.
    backToCreatorsList();
  }

  async function handleFollowPress() {
    if (actions.follow === "gate") {
      authDrawerState.show("signup", "follow");
      return;
    }
    if (actions.follow !== "toggle" || !currentUserId) return;

    hapticService?.trigger("selection");
    const nowFollowing = await session.toggleFollow(currentUserId);
    if (nowFollowing === null) return;
    // The roster, its Following tab and this profile describe one relationship.
    creatorsDataState.applyFollowChange(userId, nowFollowing);
    // A loaded follower list no longer includes (or still includes) the viewer.
    followersLoaded = false;
  }

  let moderationInProgress = $state(false);

  async function handleToggleDisabled() {
    if (!userProfile || moderationInProgress) return;
    const disabling = !userProfile.isDisabled;
    moderationInProgress = true;
    const saved = await session.setDisabled(disabling);
    moderationInProgress = false;
    if (!saved) {
      toast.error(t("creators_moderation_failed"));
      return;
    }
    creatorsDataState.patchUser(userId, { isDisabled: disabling });
    toast.success(
      disabling
        ? t("creators_profile_disabled_done")
        : t("creators_profile_restored_done")
    );
  }

  function handleSequenceClick(sequence: LibrarySequence) {
    hapticService?.trigger("selection");
    openSequenceViewer(sequence, {
      source: "creator_profile",
      returnPath: `/creators/${encodeURIComponent(userId)}`,
      returnLabel: userProfile?.displayName ?? "Creator",
    });
  }

  async function loadFollowerUsers() {
    if (followersLoaded || followersLoading) return;
    followersLoading = true;
    try {
      followerUsers = await getFollowers(userId, 50);
      followersLoaded = true;
    } catch (err) {
      console.error("[UserProfilePanel] Error loading followers:", err);
      toast.error("Failed to load followers. Please try again.");
    } finally {
      followersLoading = false;
    }
  }

  async function loadFollowingUsers() {
    if (followingLoaded || followingLoading) return;
    followingLoading = true;
    try {
      followingUsers = await getFollowing(userId, 50);
      followingLoaded = true;
    } catch (err) {
      console.error("[UserProfilePanel] Error loading following:", err);
      toast.error("Failed to load following list. Please try again.");
    } finally {
      followingLoading = false;
    }
  }

  function openFollowersModal(type: "followers" | "following") {
    followersModalType = type;
    followersModalOpen = true;
    if (type === "followers") loadFollowerUsers();
    else loadFollowingUsers();
  }

  function handleUserCardClick(user: UserProfile) {
    hapticService?.trigger("selection");
    void openCreatorProfile(
      user.id,
      user.displayName,
      "creator_connection"
    );
  }
</script>

<div class="profile-panel">
  <!-- `collectionsSettled` is part of the loading gate, not a separate spinner:
       the layout is chosen from these counts, so painting before they are known
       is what produced the empty-column flash. -->
  {#if isLoading || !collectionsSettled}
    <PanelState type="loading" message={t("creators_profile_loading")} />
  {:else if failure || !userProfile}
    <div class="error-with-action">
      <PanelState type="error" title={failureTitle} message={failureMessage} />
      <PanelButton variant="secondary" onclick={handleBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        {t("creators_go_back")}
      </PanelButton>
    </div>
  {:else}
    <ProfileHeaderBar onBack={handleBack} />

    <div class="profile-content">
      <!-- One composition for everyone. The work column is always here; what
           changes is whether it holds bands or an invitation to fill it. -->
      <div class="profile-layout">
        <!-- The person, not their work. Everything about them lives in this one
             column: identity, tenure, place, props, counts, and — when you are
             signed in looking at someone else — your connection to them, which
             is also about the person rather than about what they made. -->
        <div class="rail-area">
          <ProfileHeroSection
            {userProfile}
            followMode={actions.follow}
            showReport={actions.showReport}
            viewerIsAdmin={authState.isEffectiveAdmin}
            {moderationInProgress}
            onToggleDisabled={handleToggleDisabled}
            {followInProgress}
            collectionsCount={savedTotal}
            onFollowToggle={handleFollowPress}
            onFollowersClick={() => openFollowersModal("followers")}
            onFollowingClick={() => openFollowersModal("following")}
          />

          {#if actions.showConnection}
            <ProfileConnectionSection
              targetUserId={userId}
              targetUserName={userProfile.displayName}
              isFollowing={userProfile.isFollowing}
            />
          {/if}
        </div>

        <!-- Three bands, each artifact in its own medium — replaces the pinned
             showcase strip plus the single wall of choreo-card fronts that
             ProfileShowcase and ProfileTabs rendered. The stage loads its own
             library and collections from the userId, so nothing upstream needs to
             fetch on its behalf.

             When there is nothing to show, the column holds ProfileWorkEmpty
             instead — it is never removed. `hasWork` is settled before this
             branch is evaluated (see the derivation above), so the choice is made
             once and neither side ever swaps in after paint. -->
        <div class="work-area">
          {#if hasWork}
            <ProfileStage {userId} displayName={userProfile.displayName} />
          {:else}
            <ProfileWorkEmpty
              {isOwnProfile}
              displayName={userProfile.displayName}
            />
          {/if}
        </div>

      </div>
    </div>

    <FollowersModal
      bind:open={followersModalOpen}
      listType={followersModalType}
      users={modalUsers}
      isLoading={modalLoading}
      onUserClick={handleUserCardClick}
    />
  {/if}
</div>

<style>
  .profile-panel {
    container-type: inline-size;
    container-name: profile-panel;

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  .error-with-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    height: 100%;
    padding: 40px 20px;
  }

  .profile-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;

    display: flex;
    flex-direction: column;
    align-items: center;
    padding: clamp(16px, 4cqi, 32px);
  }

  /* Identity rail beside the work, not a banner above it.
     `--shell-w` rather than a hardcoded cap: the old `max-width: 1920px` left
     960px of dead rail per side at 3840 and the page used half its width.
     4k-native-layout.md forbids hardcoding a band and names this variable as the
     mechanism (floor 1720px, fluid 88vw, ceiling 2600px). */
  .profile-layout {
    width: 100%;
    max-width: var(--shell-w, min(1720px, 92vw));
    margin-inline: auto;
    display: grid;
    gap: 24px;
    grid-template-columns: 1fr;
    grid-template-areas:
      "rail"
      "work";
    align-items: start;
  }

  .rail-area {
    grid-area: rail;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  /* A height-capped flex column shrinks its children by default, and the rail
     card sets `overflow: hidden` for its ambient gradient — so at 1440x900 the
     card was squeezed and clipped its own stats and Follow button rather than
     letting the column scroll. Children keep their natural height; the scroll
     belongs to the column. */
  .rail-area > :global(*) {
    flex: 0 0 auto;
  }

  .work-area {
    grid-area: work;
    min-width: 0;
    /* Fills the row rather than stopping at its content, so the two columns end
       together. Without it an empty profile put a 474px panel beside a 957px rail
       and the right side just stopped halfway down. The rail opts out via
       `align-self: start` in the wide tier below, since it is sticky. */
    align-self: stretch;
    /* Sit above the sticky admin column so the gallery's sort popover can
       overlap it instead of being covered (both are backdrop-filter panels =
       separate stacking contexts). */
    z-index: 2;
  }

  /* Static while stacked; the wide tier below turns it sticky alongside the rail. */
  /* Frosted glass panels so all content reads against calm surfaces; the ocean
     breathes in the grid gaps + page margins. Reuses the app modal-surface
     token (--theme-panel-bg). */
  .rail-area > :global(*),
  .work-area {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(18, 20, 30, 0.98)) 90%,
      transparent
    );
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(16px, 2cqi, 24px);
    padding: clamp(16px, 2cqi, 28px);
    box-shadow: var(--theme-shadow, 0 8px 32px rgba(0, 0, 0, 0.3));
  }

  /* Wide enough for the rail to stand beside the work. Below this the rail
     stacks on top, where the rail's own container query (640px) turns it into a
     horizontal band so it does not become a tall column of single facts pushing
     the Showcase below the fold. */
  @container profile-panel (min-width: 1100px) {
    /* Rail track in `em`, not `rem`, so it grows with the panel's type ramp — a
       416px rail beside a 2160px work column at 4K reads as an afterthought. */
    .profile-layout {
      grid-template-columns: clamp(20em, 22cqi, 26em) minmax(0, 1fr);
      grid-template-areas: "rail work";
    }

    /* Sticky so the person stays visible while their work scrolls, with its own
       scroll for the case where identity plus a connection section outgrows the
       viewport — otherwise the Follow button at its bottom would be unreachable. */
    .rail-area {
      position: sticky;
      top: 0;
      align-self: start;
      max-height: 100dvh;
      overflow-y: auto;
      scrollbar-width: thin;
    }

  }

  @container profile-panel (max-width: 768px) {
    .profile-content {
      padding: clamp(12px, 3cqi, 20px);
    }
  }

  @container profile-panel (max-width: 480px) {
    .profile-content {
      padding: 12px;
    }
  }

  @container profile-panel (min-width: 1400px) {
    .profile-content {
      padding: clamp(32px, 5cqi, 48px);
    }
  }
</style>
