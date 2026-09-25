<!-- The directory uses the four profile signals with meaningful coverage:
     face, prop, activity, and join date. Its panel-local `em` ramp keeps type,
     spacing, and avatars proportional at 4K without imposing a content cap. -->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { browser } from "$app/environment";
  import { page } from "$app/state";
  import { PUBLIC_GOOGLE_MAPS_API_KEY } from "$lib/shared/maps/google-maps-api-key";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import {
    followUser,
    unfollowUser,
  } from "$lib/shared/community/services/user-repository";
  import type { EnhancedUserProfile } from "$lib/shared/community/domain/models/enhanced-user-profile";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import LazyMount from "$lib/shared/components/LazyMount.svelte";
  import { setCommunityMapContext } from "$lib/features/community/context/community-map-context";
  import { createCommunityMapState } from "$lib/features/community/state/community-map-state.svelte";
  import { createFirestoreCommunityMapPort } from "$lib/features/community/services/community-map-port";
  import { createEdgeCitySuggestion } from "$lib/features/community/services/edge-city-suggestion";
  import { getGeocodingService } from "$lib/features/community/get-geocoding-service";
  import PanelSearch from "$lib/shared/components/panel/PanelSearch.svelte";
  import PanelState from "$lib/shared/components/panel/PanelState.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { creatorsDataState } from "../state/creators-data-state.svelte";
  import {
    openCreatorProfile,
    restoreCreatorProfileFromURL,
    syncCreatorsViewFromURL,
  } from "../state/creators-routing.svelte";
  import { creatorsViewState } from "../state/creators-view-state.svelte";
  import {
    BAND_LABEL,
    bandOf,
    mergeSmallBands,
    type BandKey,
  } from "../domain/creator-recency";
  import { fitColumns } from "../domain/fit-columns";
  import { dealByOwner } from "$lib/features/browse/gallery-home/pick-representatives";
  import { openSequenceViewer } from "$lib/shared/sequence-viewer/services/sequence-viewer-navigator";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import RosterBand from "./RosterBand.svelte";
  import WorkWall from "./WorkWall.svelte";
  import UserProfilePanel from "./UserProfilePanel.svelte";

  type RosterView = "active" | "new" | "following";

  const NEW_WINDOW_DAYS = 30;
  const DAY_MS = 86_400_000;
  const BAND_ORDER: BandKey[] = ["week", "month", "quarter", "earlier"];

  let searchQuery = $state("");
  let view = $state<RosterView>("active");
  let initError = $state<string | null>(null);
  let publicSequences = $state<SequenceData[]>([]);
  // Reassigned wholesale rather than mutated, so a plain Set stays reactive.
  let followPending = $state<Set<string>>(new Set());
  let hapticService: HapticFeedback | undefined;

  // The sidebar makes module dimensions differ from viewport dimensions.
  let boxWidth = $state(0);
  let boxHeight = $state(0);

  // The parent owns map identity because the lazy band may never mount.
  const communityMapState = createCommunityMapState({
    port: createFirestoreCommunityMapPort(),
    getSuggestion: () => edgeCitySuggestion,
  });

  setCommunityMapContext({
    state: communityMapState,
    getApiKey: () => PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  // Browser-only geocoding remains null through SSR and resolves on hydration.
  const edgeCitySuggestion = $derived(
    browser
      ? createEdgeCitySuggestion(page.data.geo, getGeocodingService())
      : null
  );

  let mapBandHost = $state<HTMLDivElement | null>(null);
  let mapBandActive = $state(false);

  const currentUserId = $derived(authState.user?.uid);
  const canFollow = $derived(authState.isFullAccount);
  const users = $derived(creatorsDataState.users);
  const searchResults = $derived(creatorsDataState.searchResults);
  const isLoading = $derived(creatorsDataState.isLoading);
  const error = $derived(creatorsDataState.error);
  const publicCounts = $derived(creatorsDataState.publicCounts);

  // Counts follow the visitor-filtered roster, including moderation visibility.
  const roster = $derived(searchResults !== null ? searchResults : users);

  const newCreatorIds = $derived.by(() => {
    const cutoff = Date.now() - NEW_WINDOW_DAYS * DAY_MS;
    return new Set(
      roster
        .filter((creator) => creator.joinedDate.getTime() >= cutoff)
        .map((creator) => creator.id)
    );
  });

  const viewed = $derived.by(() => {
    if (view === "following") return roster.filter((c) => c.isFollowing);
    if (view === "new") {
      return roster
        .filter((c) => newCreatorIds.has(c.id))
        .sort((a, b) => b.joinedDate.getTime() - a.joinedDate.getTime());
    }
    return roster;
  });

  const viewOptions = $derived([
    { value: "active" as const, label: "Active", count: roster.length },
    { value: "new" as const, label: "New here", count: newCreatorIds.size },
    {
      value: "following" as const,
      label: "Following",
      count: roster.filter((c) => c.isFollowing).length,
      disabled: !canFollow,
    },
  ]);

  const isSearching = $derived(searchResults !== null);

  // Filtered and searched rosters stay one unheaded group; recency merging can
  // otherwise bury a small result in the long-tail band.
  const bands = $derived.by(() => {
    if (view !== "active" || isSearching) {
      return [
        { key: "week" as BandKey, members: viewed, heading: null as string | null },
      ];
    }
    const now = Date.now();
    const byBand = new Map<BandKey, EnhancedUserProfile[]>();
    for (const key of BAND_ORDER) byBand.set(key, []);
    for (const creator of viewed) {
      byBand.get(bandOf(creator.lastActiveAt, now))!.push(creator);
    }
    return mergeSmallBands(
      BAND_ORDER.map((key) => ({ key, members: byBand.get(key)! }))
    ).map((band) => ({ ...band, heading: BAND_LABEL[band.key] as string | null }));
  });

  // Wide, short surfaces use index density to keep creators above the fold.
  const isShortLandscape = $derived(
    boxHeight > 0 && boxHeight <= 600 && boxWidth / boxHeight > 1.7
  );


  // `LazyMount` fetches on activation but does not observe visibility itself.
  $effect(() => {
    const host = mapBandHost;
    if (!host || mapBandActive) return;

    if (typeof IntersectionObserver === "undefined") {
      // Unsupported browsers load the band eagerly.
      mapBandActive = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        mapBandActive = true;
        observer.disconnect();
      },
      { rootMargin: "200px" }
    );
    observer.observe(host);
    return () => observer.disconnect();
  });

  // Delay identity-dependent reads until the band will render.
  $effect(() => {
    if (!mapBandActive) return;

    if (!authState.initialized) {
      communityMapState.setIdentity({ status: "pending" });
      return;
    }

    const uid = authState.user?.uid;
    communityMapState.setIdentity(
      authState.isFullAccount && uid
        ? { status: "user", uid }
        : { status: "guest" }
    );
  });

  // Geometry is authored against 16px logical units. Wider panels gain
  // columns; viewing-distance magnification is a separate mode.
  const unitPx = 16;

  // A bounded share of measured panel height keeps the map legible but secondary.
  const MAP_STAGE_SHARE = 0.34;
  const MAP_STAGE_MIN_EM = 8.5;
  const MAP_STAGE_MAX_EM = 22;

  const mapStageEm = $derived(
    Math.round(
      Math.min(
        MAP_STAGE_MAX_EM,
        Math.max(
          MAP_STAGE_MIN_EM,
          ((boxHeight || 900) * MAP_STAGE_SHARE) / unitPx
        )
      ) * 100
    ) / 100
  );

  // Minimum widths choose column counts; `RosterBand` separately caps growth.
  const PORTRAIT_CELL_EM = 9.5;
  const INDEX_CELL_EM = 11;

  // Measure the real content box because its stable scrollbar gutter invalidates
  // width-minus-padding arithmetic. The calculation below is only a first-frame fallback.
  let measuredContentWidth = $state(0);

  const gutterPx = $derived(Math.min(56, Math.max(16, boxWidth * 0.022)));

  const contentWidth = $derived(
    measuredContentWidth || Math.max(0, boxWidth - 2 * gutterPx)
  );

  const portraitCap = $derived(
    isShortLandscape
      ? 0 // portrait disabled entirely — no vertical room
      : Math.max(2, Math.floor(contentWidth / (PORTRAIT_CELL_EM * unitPx)))
  );

  const indexCap = $derived(
    Math.max(1, Math.floor(contentWidth / (INDEX_CELL_EM * unitPx)))
  );

  // Work needs a wider target than identity-only roster cells.
  const WALL_TILE_EM = 16;

  const wallCap = $derived(
    Math.max(2, Math.floor(contentWidth / (WALL_TILE_EM * unitPx)))
  );

  /** One responsive row with owner balancing keeps people, not work, primary. */
  const wallItems = $derived.by(() => {
    // Only the default view has room and context for a community-wide work row.
    if (
      isShortLandscape ||
      view !== "active" ||
      searchQuery.trim() ||
      publicSequences.length === 0
    ) {
      return [];
    }
    const byOwner = new Map(users.map((user) => [user.id, user]));
    // Matching the limit to the column count prevents a stranded second row.
    const limit = wallCap;
    return dealByOwner(publicSequences, {
      // Prefer breadth, allowing repeats only when a wide row can support them.
      perOwner: Math.max(1, Math.ceil(limit / 6)),
      limit,
    })
      .flatMap((sequence) => {
        // Do not reintroduce owners filtered from this visitor's roster.
        const creator = sequence.ownerId
          ? byOwner.get(sequence.ownerId)
          : undefined;
        return creator ? [{ sequence, creator }] : [];
      });
  });

  // One width per density, derived from the busiest band, keeps every band on
  // the same grid instead of content-sizing each one to different insets.
  const GAP_EM = 0.5;
  // Portraits cap earlier than name-bearing index rows.
  const CELL_MAX_EM: Record<"portrait" | "index", number> = {
    portrait: 14,
    index: 22,
  };

  const bandLayout = $derived.by(() => {
    const rows = bands.map((band) => {
      const density: "portrait" | "index" =
        isShortLandscape || band.key === "earlier" ? "index" : "portrait";
      const cap = Math.max(1, density === "portrait" ? portraitCap : indexCap);
      return {
        ...band,
        density,
        columns: fitColumns(
          band.members.length,
          Math.min(cap, Math.max(1, band.members.length))
        ),
      };
    });

    const cellPxFor = (density: "portrait" | "index") => {
      const widest = Math.max(
        1,
        ...rows.filter((row) => row.density === density).map((row) => row.columns)
      );
      const ceiling = CELL_MAX_EM[density] * unitPx;
      if (contentWidth <= 0) return ceiling;
      const fair = (contentWidth - (widest - 1) * GAP_EM * unitPx) / widest;
      return Math.max(1, Math.min(ceiling, fair));
    };

    const portraitCell = cellPxFor("portrait");
    const indexCell = cellPxFor("index");

    return rows.map((row) => ({
      ...row,
      cellPx: row.density === "portrait" ? portraitCell : indexCell,
    }));
  });

  function handleWorkSelect(sequence: SequenceData) {
    hapticService?.trigger("selection");
    openSequenceViewer(sequence, {
      source: "creator_directory",
      returnPath: "/creators",
      returnLabel: "Creators",
    });
  }

  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function handleCreatorsPopState() {
    syncCreatorsViewFromURL();
  }

  /** Work metadata enriches the page but never blocks the roster. */
  async function loadPublicWorkOwners() {
    try {
      const sequences = await getBrowseLoader().loadSequenceMetadata();
      publicSequences = sequences;
      creatorsDataState.setPublicWorkOwnerIds(
        new Set(
          sequences
            .map((sequence) => sequence.ownerId)
            .filter((id): id is string => Boolean(id))
        )
      );
    } catch (workError) {
      console.warn("[CreatorsPanel] Public work index unavailable:", workError);
    }
  }

  onMount(() => {
    restoreCreatorProfileFromURL();
    window.addEventListener("popstate", handleCreatorsPopState);
    return () => {
      window.removeEventListener("popstate", handleCreatorsPopState);
      creatorsViewState.reset();
    };
  });

  onMount(async () => {
    hapticService = getHapticFeedback();
    try {
      const creatorsRequest = creatorsDataState.isInitialized
        ? Promise.resolve()
        : creatorsDataState.loadCreators(currentUserId);

      // The optional work caption must not delay the directory.
      void loadPublicWorkOwners();
      await creatorsRequest;
    } catch (loadError) {
      console.error("[CreatorsPanel] Error loading creators:", loadError);
      initError = "Failed to load creators. Please try again.";
    }
  });

  /** Auth can resolve after mount, so follow state must react to viewer identity. */
  let followStateLoadedFor: string | null = null;
  $effect(() => {
    const viewerId = currentUserId;
    if (!viewerId) return;
    if (!creatorsDataState.isInitialized) return;
    if (creatorsDataState.hasFollowState) return;
    if (followStateLoadedFor === viewerId) return;

    followStateLoadedFor = viewerId;
    void creatorsDataState.refreshCreators(viewerId).catch((refreshError) => {
      console.error("[CreatorsPanel] Follow state unavailable:", refreshError);
      followStateLoadedFor = null;
    });
  });

  onDestroy(() => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  });

  function handleSelect(creator: EnhancedUserProfile) {
    hapticService?.trigger("selection");
    void openCreatorProfile(
      creator.id,
      creator.displayName,
      "creator_directory"
    );
  }

  /** Confirm writes before updating every roster projection of the relationship. */
  async function handleFollow(creator: EnhancedUserProfile) {
    const viewerId = currentUserId;
    if (!viewerId || followPending.has(creator.id)) return;

    hapticService?.trigger("selection");
    followPending = new Set(followPending).add(creator.id);
    const wasFollowing = creator.isFollowing;

    try {
      if (wasFollowing)
        await unfollowUser(viewerId, creator.id, "creator_directory");
      else await followUser(viewerId, creator.id, "creator_directory");
      creatorsDataState.updateUserFollowStatus(
        creator.id,
        !wasFollowing,
        wasFollowing ? -1 : 1
      );
    } catch (followError) {
      console.error("[CreatorsPanel] Follow toggle failed:", followError);
    } finally {
      const next = new Set(followPending);
      next.delete(creator.id);
      followPending = next;
    }
  }

  function handleSearchInput(value: string) {
    searchQuery = value;
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      creatorsDataState.setSearchQuery(value);
    }, 220);
  }

  const activeError = $derived(initError ?? error);
</script>

<div
  class="creators-panel"
  class:short-landscape={isShortLandscape}
  style:--map-band-stage-h="{mapStageEm}em"
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
>
  <Crossfade
    key={creatorsViewState.currentView === "user-profile"
      ? `profile:${creatorsViewState.viewingUserId}`
      : "roster"}
    duration={DURATION.normal}
    fill
  >
    {#if creatorsViewState.currentView === "user-profile" && creatorsViewState.viewingUserId}
      <UserProfilePanel userId={creatorsViewState.viewingUserId} />
    {:else}
      <div class="roster-view">
        <header class="command-row">
          <h2 class="title">
            Creators
            <span class="population" aria-label="{roster.length} creators">
              <span class="dot" aria-hidden="true">·</span>{roster.length}
            </span>
          </h2>

          <div class="search-slot">
            <PanelSearch
              value={searchQuery}
              placeholder="Search creators"
              oninput={handleSearchInput}
              maxWidth="100%"
            />
          </div>

          <SegmentedControl
            options={viewOptions}
            value={view}
            onchange={(next) => {
              hapticService?.trigger("selection");
              view = next;
            }}
            size="sm"
            density="compact"
            semantics="radiogroup"
            ariaLabel="Roster view"
          />
        </header>

        <div class="scroller">
          <!-- Keep the invitation reachable even if the roster fails. -->
          <div class="map-band-slot" bind:this={mapBandHost}>
            <LazyMount
              loader={() =>
                import(
                  "$lib/features/community/components/CommunityMapBand.svelte"
                )}
              active={mapBandActive}
              props={{ compact: isShortLandscape }}
              placeholder={mapBandPlaceholder}
              debugName="CommunityMapBand"
            />
          </div>

          {#if activeError}
            <PanelState
              type="error"
              compact
              title="Couldn't load creators"
              message={activeError}
            />
          {:else if isLoading && roster.length === 0}
            <!-- Match real band geometry to avoid a loading-state jump. -->
            <div class="skeleton" aria-hidden="true">
              {#each Array(3) as _, bandIndex (bandIndex)}
                <div class="skeleton-band">
                  <span class="skeleton-rule"></span>
                  <div
                    class="skeleton-cells"
                    style:--cols={Math.max(portraitCap, 2)}
                  >
                    {#each Array(Math.max(portraitCap, 2)) as __, cellIndex (cellIndex)}
                      <span class="skeleton-cell"></span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          {:else if viewed.length === 0}
            <PanelState
              type="empty"
              compact
              icon="fa-user-group"
              title={searchQuery.trim() ? "No matches" : "Nobody here yet"}
              message={searchQuery.trim()
                ? `No creator matches "${searchQuery.trim()}".`
                : view === "following"
                  ? "Creators you follow will collect here."
                  : "New creators will appear as they join."}
            />
          {:else}
            {#if wallItems.length > 0}
              <div class="wall-slot">
                <WorkWall
                  items={wallItems}
                  cap={wallCap}
                  {unitPx}
                  onselect={handleWorkSelect}
                  oncreator={handleSelect}
                />
              </div>
            {/if}

            <div class="bands" bind:clientWidth={measuredContentWidth}>
              {#each bandLayout as band, index (band.key)}
                <RosterBand
                  band={band.key}
                  heading={band.heading}
                  members={band.members}
                  density={band.density}
                  columns={band.columns}
                  cellPx={band.cellPx}
                  {newCreatorIds}
                  {unitPx}
                  loading={index === 0 ? "eager" : "lazy"}
                  onselect={handleSelect}
                  onfollow={handleFollow}
                  {followPending}
                />
              {/each}
            </div>

            {#if publicCounts.creatorsWithWork > 0}
              <p class="denominator">
                <span class="tabular">{publicCounts.creatorsWithWork}</span>
                of
                <span class="tabular">{publicCounts.totalCreators}</span>
                creators have shared public work
              </p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </Crossfade>
</div>

<!-- Reserve both halves of the lazy band so loading cannot move the roster. -->
{#snippet mapBandPlaceholder()}
  <div class="map-band-ph" class:compact={isShortLandscape} aria-hidden="true">
    <span class="ph-header"></span>
    <div class="ph-body">
      <span class="ph-stage"></span>
      <span class="ph-slot"></span>
    </div>
  </div>
{/snippet}

<style>
  .creators-panel {
    /* `inline-size` rather than `size` because nothing queries height in CSS.
       The short-landscape branch is decided from the measured box, avoiding
       size containment's requirement for a definite height. */
    container-type: inline-size;
    container-name: creators;

    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .roster-view {
    /* The live band and its placeholder share this in-flow height; the fixed
       prediction overlay contributes nothing. */
    --map-band-slot-h: calc(
      var(--min-touch-target) * 2 + 0.5em + 0.4em + 2.2em + 0.35em + 2.2em
    );

    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .command-row {
    display: flex;
    align-items: center;
    gap: 1em;
    flex: 0 0 auto;
    padding: 0.75em clamp(1rem, 2.2cqw, 3.5rem);
    /* Scrim controls against the animated module background. */
    border-bottom: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-surface, #0b1622) 72%,
      transparent
    );
    backdrop-filter: blur(14px) saturate(1.1);
  }

  .command-row :global(.segmented-control) {
    /* Override the primitive's full-width root until the narrow layout needs it. */
    flex: 0 0 auto;
    width: auto;
    margin-left: auto;
  }

  .command-row :global(.segmented-control .segment) {
    white-space: nowrap;
  }

  .title {
    margin: 0;
    font-size: 1.375em;
    font-weight: 650;
    letter-spacing: -0.01em;
    white-space: nowrap;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .population {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-weight: 500;
    /* Changing counts must not nudge the adjacent search field. */
    font-variant-numeric: tabular-nums;
  }

  .population .dot {
    margin: 0 0.35em;
  }

  .search-slot {
    /* Grow within a readable field width without claiming a phone row. */
    flex: 1 1 6rem;
    min-width: 0;
    max-width: 26em;
  }

  .scroller {
    /* This is the module's sole scroll owner. */
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 1.25em clamp(1rem, 2.2cqw, 3.5rem) 2em;
    scrollbar-gutter: stable;

    /* Keep animated scenery visible without sacrificing text legibility. */
    background: color-mix(
      in srgb,
      var(--theme-surface, #0b1622) 62%,
      transparent
    );
    backdrop-filter: blur(10px) saturate(1.05);
  }

  .wall-slot {
    margin-bottom: 2.25em;
  }

  /* Mirrors `CommunityMapBand` through shared custom properties. */
  .map-band-ph {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
    margin-bottom: 2.25em;
  }

  .ph-header {
    height: 1.25em;
  }

  .ph-body {
    display: grid;
    gap: 1em;
  }

  .ph-stage {
    height: var(--map-band-stage-h, 15em);
    border-radius: 0.75em;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .ph-slot {
    min-height: var(--map-band-slot-h);
  }

  @container creators (min-width: 900px) {
    .ph-body {
      grid-template-columns: minmax(0, 1fr) minmax(17em, 24em);
      align-items: center;
    }
  }

  .map-band-ph.compact {
    margin-bottom: 1.25em;
  }

  .map-band-ph.compact .ph-body {
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    align-items: center;
  }

  .bands {
    display: flex;
    flex-direction: column;
    gap: 1.75em;
  }

  .denominator {
    margin: 2em 0 0;
    font-size: 0.8125em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .tabular {
    font-variant-numeric: tabular-nums;
  }

  .skeleton {
    display: flex;
    flex-direction: column;
    gap: 1.75em;
  }

  .skeleton-band {
    display: flex;
    flex-direction: column;
    gap: 0.75em;
  }

  .skeleton-rule {
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.1));
  }

  .skeleton-cells {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: 0.5em;
  }

  .skeleton-cell {
    /* Match the portrait cell height. */
    height: 9.5em;
    border-radius: 0.75em;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  /* Give the switcher its own row before it crushes the search field. */
  @container creators (max-width: 700px) {
    .command-row {
      flex-wrap: wrap;
      row-gap: 0.6em;
    }

    .search-slot {
      max-width: none;
    }

    .command-row :global(.segmented-control) {
      /* Restore full width when the control becomes its own row. */
      flex: 1 0 100%;
      width: 100%;
      margin-left: 0;
    }
  }

  .creators-panel.short-landscape .command-row {
    padding-block: 0.4em;
  }

  .creators-panel.short-landscape .scroller {
    padding-bottom: 1em;
  }

  .creators-panel.short-landscape .bands {
    gap: 1em;
  }

  .creators-panel.short-landscape .denominator {
    display: none;
  }
</style>
