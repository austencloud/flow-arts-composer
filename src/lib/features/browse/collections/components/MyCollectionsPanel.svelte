<!--
MyCollectionsPanel.svelte

The Browse > Library tab: YOUR stuff, one place — the All shelf (the whole
library), Favorites, your collections, and collections you follow. Discovery
of other people's collections lives in the gallery drill ("Collections"
category), not here; following one from there lands it in this list.

Two layouts share one nav model:
- Phones (stacked): the classic list → detail flow, one screen at a time.
- Desktop (side-by-side): a persistent collection rail on the left with the
  real detail view filling the rest of the monitor — no more tiny folders
  swimming in space, and switching collections is one click, not a
  back-and-forth. Nothing selected shows the All shelf, so the pane is never
  empty.

List vs detail is derived straight from browseNavigationState's current
location, so the module's back/forward buttons, deep links, and the
localStorage restore all work in both layouts without extra sync wiring.

Signed out, a library has nowhere to live, so the tab explains itself
instead of showing an empty shell.
-->
<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { dev } from "$app/environment";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import { followedCollectionsState } from "$lib/features/library/state/followed-collections-state.svelte";
  import { getBrowseNavigationContext } from "$lib/shared/browse/context/browse-navigation-context";
  import { navigationState } from "$lib/shared/navigation/state/navigation-state.svelte";
  import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
  import { PLAYGROUND_TABS } from "$lib/shared/navigation/config/tab-definitions";
  import { tunnelCollectionState } from "$lib/features/tunnel-collection/state/tunnel-collection-state.svelte";
  import { scene3dCollectionState } from "$lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte";
  import { mandalaCollectionState } from "$lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte";
  import { filmCollectionState } from "$lib/features/film-collection/state/film-collection-state.svelte";
  import CollectionCard from "./CollectionCard.svelte";
  import CollectionAddTile from "./CollectionAddTile.svelte";
  import CollectionDetailView from "./CollectionDetailView.svelte";
  import SmartCollectionDetailView from "./SmartCollectionDetailView.svelte";
  import SmartCollectionBuilderSheet from "./SmartCollectionBuilderSheet.svelte";
  import AllLibraryView from "./AllLibraryView.svelte";
  import {
    FOUNDING_SMART_COLLECTIONS,
    toSyntheticCollection,
    isFoundingId,
  } from "$lib/features/browse/collections/config/founding-collections";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import { getGalleryPrefetcher } from "$lib/features/browse/shared/get-gallery-prefetcher";
  import type { LibraryCollection } from "$lib/shared/library/domain/models/collection";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getSharedCollectionsContext } from "../context/shared-collections-context";
  import UserVideoLibraryView from "$lib/shared/video-collaboration/components/UserVideoLibraryView.svelte";
  import WorkShelfRail, { type WorkShelfId } from "./WorkShelfRail.svelte";
  import {
    trackBrowseCollectionOpened,
    trackBrowseVisualTypeOpened,
    type BrowseCollectionEntry,
    type BrowseVisualType,
  } from "$lib/shared/analytics/browse-events";

  const signedIn = $derived(authState.isFullAccount);
  const hasLibrarySession = $derived(!!authState.effectiveUserId);
  const previewReadOnly = $derived(userPreviewState.isActive);

  /**
   * The Films shelf is the director's, and the director is not public.
   *
   * `dev` as well as admin because the director still lives under `/test/`,
   * which `src/routes/test/+layout.ts` redirects away in production — a Films
   * card there would list films that cannot be opened. That half comes off when
   * the director gets a real route.
   *
   * Not during a user preview: the film collection is never previewed, so the
   * shelf would show the admin's own films beside the previewed user's art.
   */
  const canSeeFilms = $derived(dev && authState.isAdmin && !previewReadOnly);
  const browseNavigationState = getBrowseNavigationContext();
  const sharedCollectionsState = getSharedCollectionsContext();
  const sharedCollections = $derived(sharedCollectionsState.items);

  $effect(() => {
    if (hasLibrarySession) {
      collectionsState.ensureStarted();
    }
    if (signedIn) {
      followedCollectionsState.ensureStarted();
    }
    const signedInUserId = authState.user?.uid;
    const effectiveUserId = authState.effectiveUserId;
    if (signedInUserId) {
      // The Art shelf's three singletons are also started at auth boot
      // (auth-boot-orchestrator), but a fast Library visit can beat that
      // non-blocking chain — ensureStarted() is idempotent per uid, so
      // this becomes a no-op once boot's own init() has already fired.
      tunnelCollectionState.ensureStarted(signedInUserId);
      scene3dCollectionState.ensureStarted(signedInUserId);
      mandalaCollectionState.ensureStarted(signedInUserId);
      if (canSeeFilms) filmCollectionState.ensureStarted(signedInUserId);
    }

    if (previewReadOnly && effectiveUserId) {
      void Promise.all([
        tunnelCollectionState.startReadOnlyPreview(effectiveUserId),
        scene3dCollectionState.startReadOnlyPreview(effectiveUserId),
        mandalaCollectionState.startReadOnlyPreview(effectiveUserId),
      ]).catch((error: unknown) =>
        console.warn("[MyCollectionsPanel] Saved Art preview failed:", error)
      );
    } else {
      tunnelCollectionState.stopReadOnlyPreview();
      scene3dCollectionState.stopReadOnlyPreview();
      mandalaCollectionState.stopReadOnlyPreview();
    }
  });

  // Wide screens get the rail + detail split; phones keep the stacked flow.
  let isSideBySide = $state(false);
  onMount(() => {
    // The Smart Collection entry is visible on this surface, so warm its
    // catalog from local storage now instead of waiting for the modal click.
    // The live Firestore sync remains the app shell's background job.
    void getGalleryPrefetcher()
      .prefetch({ skipNetworkSync: true })
      .catch((error: unknown) =>
        console.warn("[MyCollectionsPanel] Gallery warm failed:", error)
      );

    isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    const unsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });
    return unsubscribe;
  });

  // Favorites stays pinned (sortOrder -1000); after that, most recently
  // touched first — adding or removing a sequence bumps updatedAt, so the
  // collection you're actively building floats to the front. All user
  // collections share sortOrder 0, so without this the tie-break is
  // whatever order Firestore returns.
  const collections = $derived(
    [...collectionsState.collections].sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
    )
  );
  const loading = $derived(collectionsState.loading);

  // Founding decks (TKA 1/2/3) — read-only, config-defined, shown to everyone.
  const foundingCards = FOUNDING_SMART_COLLECTIONS.map(toSyntheticCollection);

  // Own smart collections render the live-derived view; everything else uses
  // the standard member grid. (Foreign collections are never smart in v1.)
  function isOwnSmart(id: string, ownerId: string | null): boolean {
    if (ownerId) return false;
    return (
      collectionsState.collections.find((c) => c.id === id)?.kind === "smart"
    );
  }

  // "New smart collection" opens the builder from scratch.
  let smartBuilderOpen = $state(false);
  let smartEditTarget = $state<LibraryCollection | null>(null);

  // The library pile itself, pinned above Favorites (it's the superset).
  // Synthetic — not a Firestore doc. Its id "all" can't collide with real
  // collections (Firestore auto-ids are 20 chars; system ids use "system_").
  let libraryCount = $state(0);
  let libraryCountRevision = 0;
  $effect(() => {
    const effectiveUserId = authState.effectiveUserId;
    const revision = ++libraryCountRevision;
    if (!effectiveUserId) {
      libraryCount = 0;
      return;
    }
    getLibraryRepository()
      .getSequences()
      .then((seqs) => {
        if (
          revision === libraryCountRevision &&
          authState.effectiveUserId === effectiveUserId
        ) {
          libraryCount = seqs.length;
        }
      })
      .catch(() => {});
  });

  const allShelf = $derived<LibraryCollection>({
    id: "all",
    name: "Saved sequences",
    ownerId: authState.effectiveUserId ?? "",
    sequenceIds: [],
    sequenceCount: libraryCount,
    icon: "fa-layer-group",
    isPublic: false,
    sortOrder: -2000,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  // Performance uploads are still sequence artifacts, but their owner needs a
  // reliable way back to private uploads and collaboration invites. Watch used
  // to be the only host for this existing library view; Browse > Library now
  // owns that personal doorway.
  const PERFORMANCES_SHELF_ID = "video_performances";
  const performancesShelf = $derived<LibraryCollection>({
    id: PERFORMANCES_SHELF_ID,
    name: "Performances",
    ownerId: authState.effectiveUserId ?? "",
    sequenceIds: [],
    sequenceCount: 0,
    icon: "fa-video",
    isPublic: false,
    sortOrder: -1900,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });

  // The nav state is the single source of truth for which view is showing.
  // Foreign (community) collections encode their owner in the contextId as
  // "ownerId:collectionId" — own collection ids never contain a colon
  // (Firestore auto-ids + "system_favorites").
  const detail = $derived.by(() => {
    const loc = browseNavigationState.currentLocation;
    if (loc?.primary !== "you") {
      return null;
    }

    if (loc.section === "videos") {
      return {
        id: PERFORMANCES_SHELF_ID,
        ownerId: null,
        ownerName: undefined,
      };
    }

    if (loc.section === "visuals") {
      const artIdByType = {
        tunnels: "art_tunnels",
        scenes: "art_scenes",
        mandalas: "art_mandala",
      } as const;
      return {
        id: artIdByType[loc.visualType ?? "tunnels"],
        ownerId: null,
        ownerName: undefined,
      };
    }

    if (
      loc.section !== "collections" ||
      loc.view !== "detail" ||
      !loc.contextId
    ) {
      return null;
    }

    if (loc.ownerId) {
      const shared = sharedCollections.find(
        (item) =>
          item.grant.ownerId === loc.ownerId &&
          item.grant.collectionId === loc.contextId
      );
      return {
        id: loc.contextId,
        ownerId: loc.ownerId,
        ownerName: shared?.ownerName ?? loc.filter?.displayName,
        accessRole: shared?.grant.role,
      };
    }
    // Art categories work signed OUT too (guest saves live in localStorage),
    // so they bypass the signed-in gate below.
    if (isArtId(loc.contextId)) {
      return { id: loc.contextId, ownerId: null, ownerName: undefined };
    }
    // Anonymous sessions own collections too. Only a missing session prevents
    // resolving a collection; the local sequence shelf remains available.
    if (loc.contextId !== "all" && !hasLibrarySession) return null;
    return { id: loc.contextId, ownerId: null, ownerName: undefined };
  });

  // Split mode never shows an empty pane: with nothing selected, the All
  // shelf fills in. Display-only — no history entry is written until the
  // user actually clicks something, so back/forward stay truthful.
  const railSelection = $derived(
    detail ?? {
      id: "all",
      ownerId: null as string | null,
      ownerName: undefined as string | undefined,
    }
  );

  let activeShelf = $state<WorkShelfId>("collections");

  const hasSharedShelf = $derived(
    sharedCollections.length > 0 ||
      sharedCollectionsState.loading ||
      !!sharedCollectionsState.error ||
      followedCollectionsState.items.length > 0
  );

  function shelfForSelection(selection: {
    id: string;
    ownerId: string | null;
  }): WorkShelfId {
    if (selection.ownerId) return "shared";
    if (isPerformancesId(selection.id)) return "performances";
    if (isArtId(selection.id)) return "art";
    if (isFoundingId(selection.id)) return "core";
    return "collections";
  }

  // Back, forward, and restored deep links keep the rail on the shelf that
  // contains the item showing in the detail pane. Switching shelves locally
  // does not disturb that detail until the user chooses a new card.
  $effect(() => {
    activeShelf = shelfForSelection(railSelection);
  });
  const isYouSequences = $derived(
    browseNavigationState.currentLocation?.primary === "you" &&
      browseNavigationState.currentLocation?.section === "sequences"
  );

  function openCollection(
    id: string,
    name: string,
    entry: BrowseCollectionEntry = "owned-card"
  ) {
    trackBrowseCollectionOpened(entry);
    browseNavigationState.viewCollectionDetail(id, name);
  }

  function openForeignCollection(
    ownerId: string,
    collectionId: string,
    name: string,
    ownerName?: string
  ) {
    trackBrowseCollectionOpened("shared-card");
    browseNavigationState.navigateTo({
      primary: "you",
      section: "collections",
      view: "detail",
      ownerId,
      contextId: collectionId,
      filter: {
        type: "collectionName",
        value: name,
        displayName: ownerName ?? "Collection owner",
      },
    });
  }

  function backToList() {
    browseNavigationState.viewCollections();
  }

  // The three Art collections (tunnels, 3D scenes, mandalas) as category
  // cards — a count + latest-poster cover per category. Selecting one opens
  // its gallery IN the detail pane, exactly like a sequence collection: same
  // nav-detail seam (back/forward + restore free), same rail highlight. The
  // gallery components are the former Playground tabs, lazy-mounted here.
  const ART_DETAIL: Record<
    string,
    {
      label: string;
      load: () => Promise<{ default: Component }>;
      /** Hidden, and unresolvable from a stale link, unless `canSeeFilms`. */
      adminOnly?: boolean;
    }
  > = {
    art_tunnels: {
      label: "Tunnels",
      load: () =>
        import("$lib/features/tunnel-collection/TunnelCollectionModule.svelte"),
    },
    art_scenes: {
      label: "3D Scenes",
      load: () =>
        import(
          "$lib/features/scene-3d-collection/Scene3DCollectionModule.svelte"
        ),
    },
    art_mandala: {
      label: "Mandalas",
      load: () => import("$lib/features/mandala/MandalaModule.svelte"),
    },
    art_films: {
      label: "Films",
      adminOnly: true,
      load: () =>
        import("$lib/features/film-collection/FilmCollectionGallery.svelte"),
    },
  };

  function isArtId(id: string): boolean {
    const entry = ART_DETAIL[id];
    if (!entry) return false;
    return entry.adminOnly ? canSeeFilms : true;
  }

  function isPerformancesId(id: string): boolean {
    return id === PERFORMANCES_SHELF_ID;
  }

  function openArtDetail(id: string) {
    const typeById: Record<string, BrowseVisualType> = {
      art_tunnels: "tunnel",
      art_scenes: "scene",
      art_mandala: "mandala",
      art_films: "film",
    };
    const visualType = typeById[id];
    if (visualType) trackBrowseVisualTypeOpened(visualType);
    browseNavigationState.viewCollectionDetail(
      id,
      ART_DETAIL[id]?.label ?? "Visuals"
    );
  }

  // Call sites are gated by isArtId, so the lookup can't miss.
  function artLoad(id: string): Promise<{ default: Component }> {
    return ART_DETAIL[id]!.load();
  }

  function playgroundTabColor(tabId: string): string {
    return (
      PLAYGROUND_TABS.find((t) => t.id === tabId)?.color ??
      "var(--theme-accent)"
    );
  }

  function artCollection(
    id: string,
    name: string,
    icon: string,
    color: string,
    sequenceCount: number,
    coverImageUrl?: string
  ): LibraryCollection {
    return {
      id,
      name,
      ownerId: authState.effectiveUserId ?? "",
      sequenceIds: [],
      sequenceCount,
      coverImageUrl,
      color,
      icon,
      isPublic: false,
      sortOrder: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  const tunnelsArtCard = $derived(
    artCollection(
      "art_tunnels",
      "Tunnels",
      "fa-fan",
      playgroundTabColor("tunnels"),
      tunnelCollectionState.collection.length,
      tunnelCollectionState.collection[0]?.poster
    )
  );
  const scenesArtCard = $derived(
    artCollection(
      "art_scenes",
      "3D Scenes",
      "fa-cube",
      playgroundTabColor("scenes"),
      scene3dCollectionState.collection.length,
      scene3dCollectionState.collection[0]?.poster
    )
  );
  const mandalaArtCard = $derived(
    // Mandalas have no poster field — the card falls back to icon + color.
    artCollection(
      "art_mandala",
      "Mandalas",
      "fa-dharmachakra",
      playgroundTabColor("mandala"),
      mandalaCollectionState.collection.length,
      undefined
    )
  );
  const filmsArtCard = $derived(
    // Films were never a Playground tab, so the amber is declared here rather
    // than borrowed — it has to stay distinct from tunnels, scenes, mandalas.
    artCollection(
      "art_films",
      "Films",
      "fa-clapperboard",
      "#fbbf24",
      filmCollectionState.collection.length,
      filmCollectionState.collection[0]?.poster
    )
  );

  function unitLabel(n: number, singular: string, plural: string): string {
    return `${n} ${n === 1 ? singular : plural}`;
  }

  // ── New collection (inline, same interaction as the picker's add tile) ──
  let showInput = $state(false);
  let newName = $state("");
  let creating = $state(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    creating = true;
    try {
      const created = await collectionsState.create(name);
      newName = "";
      showInput = false;
      // In the split view the detail pane is right there — open the new
      // collection immediately so the next click can be "Add" or "Scan".
      if (created && isSideBySide) {
        openCollection(created.id, created.name);
      }
    } finally {
      creating = false;
    }
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      showInput = false;
      newName = "";
    }
  }
</script>

<!-- Shared shelf markup: the phone grid and the desktop rail render the same
     cards; only the wrapper (grid vs single column) and the selection
     highlight differ. -->
<!-- TKA Core: the founding "everybody's joint" decks (TKA 1/2/3, Book).
     Curated by TKA, read-only — a distinct group from the user's own work. -->
{#snippet tkaOriginalsShelf(sel: { id: string; ownerId: string | null } | null)}
  {#each foundingCards as f (f.id)}
    <CollectionCard
      collection={f}
      readonly
      countLabel={f.id === "founding_tka-1"
        ? unitLabel(f.sequenceCount, "letter", "letters")
        : unitLabel(f.sequenceCount, "sequence", "sequences")}
      minimalMetadata
      selected={!!sel && sel.id === f.id && !sel.ownerId}
      onOpen={() => openCollection(f.id, f.name)}
    />
  {/each}
{/snippet}

{#snippet sharedShelves(sel: { id: string; ownerId: string | null } | null)}
  {#each sharedCollections as item (item.grant.ownerId + item.grant.collectionId)}
    <CollectionCard
      collection={item.collection}
      ownerName={item.ownerName}
      accessRole={item.grant.role}
      readonly
      selected={!!sel &&
        sel.ownerId === item.grant.ownerId &&
        sel.id === item.grant.collectionId}
      onOpen={() =>
        openForeignCollection(
          item.grant.ownerId,
          item.grant.collectionId,
          item.collection.name,
          item.ownerName
        )}
    />
  {/each}
{/snippet}

{#snippet sharedShelfContent(
  sel: { id: string; ownerId: string | null } | null
)}
  {#if sharedCollectionsState.loading}
    <div class="shared-shelf-state" role="status">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      Loading shared collections…
    </div>
  {:else if sharedCollectionsState.error}
    <div class="shared-shelf-state warning" role="status">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      {sharedCollectionsState.error}
    </div>
  {:else}
    {@render sharedShelves(sel)}
  {/if}
{/snippet}

<!-- My Collections: the All shelf (everything you saved) + your own manual/smart
     collections + the create tiles. -->
{#snippet ownShelves(sel: { id: string; ownerId: string | null } | null)}
  <CollectionCard
    collection={allShelf}
    readonly
    selected={!!sel && sel.id === "all" && !sel.ownerId}
    onOpen={() => openCollection("all", "Saved sequences")}
  />

  {#each collections as c (c.id)}
    <CollectionCard
      collection={c}
      readonly={previewReadOnly}
      selected={!!sel && sel.id === c.id && !sel.ownerId}
      onOpen={() => openCollection(c.id, c.name)}
      onEditRule={c.kind === "smart" && !previewReadOnly
        ? () => (smartEditTarget = c)
        : undefined}
    />
  {/each}

  {#if !previewReadOnly}
    {#if showInput}
      <div class="new-tile-input">
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="name-field"
          placeholder="Collection name"
          aria-label="New collection name"
          bind:value={newName}
          onkeydown={handleInputKeydown}
          maxlength="60"
          autofocus
        />
        <button
          type="button"
          class="confirm-create"
          onclick={handleCreate}
          disabled={!newName.trim() || creating}
          aria-label="Create collection"
        >
          <i class="fas fa-check" aria-hidden="true"></i>
        </button>
      </div>
    {:else}
      <CollectionAddTile
        label="New collection"
        hint="Choose the sequences yourself"
        icon="fa-plus"
        onclick={() => (showInput = true)}
      />
    {/if}

    <CollectionAddTile
      label="New Smart Collection"
      hint="Build a live collection from filters"
      icon="fa-wand-magic-sparkles"
      onclick={() => (smartBuilderOpen = true)}
    />
  {/if}
{/snippet}

{#snippet performancesShelfCard(
  sel: { id: string; ownerId: string | null } | null
)}
  <CollectionCard
    collection={performancesShelf}
    readonly
    selected={!!sel && !sel.ownerId && isPerformancesId(sel.id)}
    countLabel="Uploads, collaborations, and invites"
    onOpen={() =>
      openCollection(
        PERFORMANCES_SHELF_ID,
        "Performances",
        "performance-shelf"
      )}
  />
{/snippet}

{#snippet artShelf(sel: { id: string; ownerId: string | null } | null)}
  <CollectionCard
    collection={tunnelsArtCard}
    readonly
    selected={!!sel && !sel.ownerId && sel.id === "art_tunnels"}
    countLabel={unitLabel(tunnelsArtCard.sequenceCount, "tunnel", "tunnels")}
    onOpen={() => openArtDetail("art_tunnels")}
  />
  <CollectionCard
    collection={scenesArtCard}
    readonly
    selected={!!sel && !sel.ownerId && sel.id === "art_scenes"}
    countLabel={unitLabel(scenesArtCard.sequenceCount, "3D scene", "3D scenes")}
    onOpen={() => openArtDetail("art_scenes")}
  />
  <CollectionCard
    collection={mandalaArtCard}
    readonly
    selected={!!sel && !sel.ownerId && sel.id === "art_mandala"}
    countLabel={unitLabel(mandalaArtCard.sequenceCount, "mandala", "mandalas")}
    onOpen={() => openArtDetail("art_mandala")}
  />
  {#if canSeeFilms}
    <CollectionCard
      collection={filmsArtCard}
      readonly
      selected={!!sel && !sel.ownerId && sel.id === "art_films"}
      countLabel={unitLabel(filmsArtCard.sequenceCount, "film", "films")}
      onOpen={() => openArtDetail("art_films")}
    />
  {/if}
{/snippet}

{#snippet artDetail(artId: string, showBack: boolean)}
  <!-- The former Playground gallery, lazy-mounted inside the Library the same
	     way the other detail views fill this space. Phone (stacked) flow gets a
	     back bar; the desktop split has the rail right there. -->
  <div class="art-detail">
    {#if showBack}
      <header class="art-detail-bar">
        <button type="button" class="art-back" onclick={backToList}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>You</span>
        </button>
        <span class="art-detail-title">{ART_DETAIL[artId]?.label}</span>
      </header>
    {/if}
    <div class="art-detail-body">
      {#await artLoad(artId)}
        <div class="art-detail-loading" aria-hidden="true">
          <i class="fas fa-circle-notch fa-spin"></i>
        </div>
      {:then mod}
        {@const ArtGallery = mod.default}
        <ArtGallery />
      {:catch}
        <div class="art-detail-loading">Couldn't load this gallery.</div>
      {/await}
    </div>
  </div>
{/snippet}

{#snippet performancesDetail(showBack: boolean)}
  <div class="art-detail">
    {#if showBack}
      <header class="art-detail-bar">
        <button type="button" class="art-back" onclick={backToList}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>You</span>
        </button>
        <span class="art-detail-title">Performances</span>
      </header>
    {/if}
    <div class="art-detail-body">
      <UserVideoLibraryView />
    </div>
  </div>
{/snippet}

{#snippet followedShelves(sel: { id: string; ownerId: string | null } | null)}
  {#each followedCollectionsState.items as item (item.ownerId + item.collection.id)}
    <CollectionCard
      collection={item.collection}
      ownerName={item.ownerName}
      readonly
      selected={!!sel &&
        sel.ownerId === item.ownerId &&
        sel.id === item.collection.id}
      onUnfollow={previewReadOnly
        ? undefined
        : () =>
            followedCollectionsState.unfollow(
              item.ownerId,
              item.collection.id,
              "followed_collection"
            )}
      onOpen={() =>
        openForeignCollection(
          item.ownerId,
          item.collection.id,
          item.collection.name,
          item.ownerName
        )}
    />
  {/each}
{/snippet}

{#snippet shelfContent(shelfId: WorkShelfId)}
  {#if shelfId === "collections"}
    {#if loading && collections.length === 0}
      <div class="rail-cards" aria-hidden="true">
        {#each Array(5) as _}
          <span class="tile-skeleton"></span>
        {/each}
      </div>
    {:else}
      <div class="rail-cards">
        {@render ownShelves(railSelection)}
      </div>
    {/if}
  {:else if shelfId === "performances"}
    <div class="rail-cards">
      {@render performancesShelfCard(railSelection)}
    </div>
  {:else if shelfId === "art"}
    <div class="rail-cards">
      {@render artShelf(railSelection)}
    </div>
  {:else if shelfId === "core"}
    <div class="rail-cards">
      {@render tkaOriginalsShelf(railSelection)}
    </div>
  {:else}
    {#if sharedCollections.length > 0 || sharedCollectionsState.loading || sharedCollectionsState.error}
      <h4 class="shelf-subheading">Shared with you</h4>
      <div class="rail-cards">
        {@render sharedShelfContent(railSelection)}
      </div>
    {/if}

    {#if followedCollectionsState.items.length > 0}
      <h4 class="shelf-subheading">Following</h4>
      <div class="rail-cards">
        {@render followedShelves(railSelection)}
      </div>
    {/if}
  {/if}
{/snippet}

{#if isYouSequences && (!isSideBySide || !hasLibrarySession)}
  <AllLibraryView onBack={backToList} />
{:else if isSideBySide && hasLibrarySession}
  <div class="library-split">
    <aside class="rail" aria-label="Your collections">
      <WorkShelfRail
        value={activeShelf}
        sharedAvailable={hasSharedShelf}
        onchange={(shelfId) => (activeShelf = shelfId)}
        content={shelfContent}
      />
    </aside>

    <section class="detail-pane">
      {#if railSelection.id === "all" && !railSelection.ownerId}
        <AllLibraryView />
      {:else if !railSelection.ownerId && isPerformancesId(railSelection.id)}
        {@render performancesDetail(false)}
      {:else if !railSelection.ownerId && isArtId(railSelection.id)}
        {#key railSelection.id}
          {@render artDetail(railSelection.id, false)}
        {/key}
      {:else if isOwnSmart(railSelection.id, railSelection.ownerId) || isFoundingId(railSelection.id)}
        {#key railSelection.id}
          <SmartCollectionDetailView
            collectionId={railSelection.id}
            onBack={backToList}
            showBack={false}
          />
        {/key}
      {:else}
        <CollectionDetailView
          collectionId={railSelection.id}
          foreignOwnerId={railSelection.ownerId}
          ownerName={railSelection.ownerName}
          accessRole={"accessRole" in railSelection
            ? railSelection.accessRole
            : undefined}
          onBack={backToList}
          showBack={false}
        />
      {/if}
    </section>
  </div>
{:else if detail}
  {#if detail.id === "all" && !detail.ownerId}
    <AllLibraryView onBack={backToList} />
  {:else if !detail.ownerId && isPerformancesId(detail.id)}
    {@render performancesDetail(true)}
  {:else if !detail.ownerId && isArtId(detail.id)}
    {#key detail.id}
      {@render artDetail(detail.id, true)}
    {/key}
  {:else if isOwnSmart(detail.id, detail.ownerId) || isFoundingId(detail.id)}
    {#key detail.id}
      <SmartCollectionDetailView collectionId={detail.id} onBack={backToList} />
    {/key}
  {:else}
    <CollectionDetailView
      collectionId={detail.id}
      foreignOwnerId={detail.ownerId}
      ownerName={detail.ownerName}
      accessRole={detail.accessRole}
      onBack={backToList}
    />
  {/if}
{:else}
  <div class="collections-list">
    <header class="list-header">
      <h2 class="list-title">Your work</h2>
    </header>

    {#if !hasLibrarySession}
      <div class="signed-out">
        <span class="signed-out-icon">
          <i class="fas fa-folder-open" aria-hidden="true"></i>
        </span>
        <p class="signed-out-title">
          Your saved sequences and collections appear here.
        </p>
        <p class="signed-out-hint">
          Browse the Gallery to find something to save. Create a free account to
          access your collections on other devices.
        </p>
        <div class="auth-actions">
          <PanelButton
            variant="primary"
            onclick={() => navigationState.setActiveTab("explore")}
          >
            Browse Gallery
          </PanelButton>
          <PanelButton
            variant="secondary"
            onclick={() => authDrawerState.show("signup", "sync-library")}
          >
            Create account
          </PanelButton>
        </div>
      </div>
    {:else if loading && collections.length === 0}
      <div class="card-grid" aria-hidden="true">
        {#each Array(4) as _}
          <span class="tile-skeleton"></span>
        {/each}
      </div>
    {:else}
      <h3 class="shelf-heading">My Collections</h3>
      <div class="card-grid">
        {@render ownShelves(null)}
      </div>

      <h3 class="shelf-heading">Performances</h3>
      <div class="card-grid">
        {@render performancesShelfCard(null)}
      </div>

      <h3 class="shelf-heading">Visuals</h3>
      <div class="card-grid">
        {@render artShelf(null)}
      </div>

      <h3 class="shelf-heading">TKA Core</h3>
      <div class="card-grid">
        {@render tkaOriginalsShelf(null)}
      </div>

      {#if sharedCollections.length > 0 || sharedCollectionsState.loading || sharedCollectionsState.error}
        <h3 class="shelf-heading">Shared with you</h3>
        <div class="card-grid">
          {@render sharedShelfContent(null)}
        </div>
      {/if}

      {#if followedCollectionsState.items.length > 0}
        <h3 class="shelf-heading">Following</h3>
        <div class="card-grid">
          {@render followedShelves(null)}
        </div>
      {/if}
    {/if}
  </div>
{/if}

{#if smartBuilderOpen && !previewReadOnly}
  <SmartCollectionBuilderSheet
    mode="create"
    onClose={() => (smartBuilderOpen = false)}
  />
{/if}

{#if smartEditTarget?.filterSpec && !previewReadOnly}
  <SmartCollectionBuilderSheet
    mode="edit"
    editCollectionId={smartEditTarget.id}
    initialSpec={smartEditTarget.filterSpec}
    onClose={() => (smartEditTarget = null)}
  />
{/if}

<style>
  /* ── Desktop split: rail + detail pane ──────────────────────────── */

  .library-split {
    display: grid;
    grid-template-columns: clamp(300px, 24cqi, 400px) minmax(0, 1fr);
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .rail {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .shelf-subheading {
    margin: 4px 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .rail-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .detail-pane {
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

  /* ── Embedded Art gallery (tunnels / scenes / mandalas) ──────────── */

  .art-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Fixed-height bar: content below never shifts as the title changes. */
  .art-detail-bar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 48px;
    padding: 0 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .art-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .art-back:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .art-detail-title {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 14px;
    font-weight: 600;
  }

  .art-detail-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .art-detail-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 14px;
  }

  .art-detail-loading i {
    font-size: 24px;
  }

  .collections-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    padding: clamp(12px, 3cqi, 28px);
    /* A handful of collections on a narrow panel otherwise huddles in
		   the top-left corner — cap the column and center it so the page reads
		   composed at any count. */
    width: 100%;
    max-width: 880px;
    margin-inline: auto;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .list-title {
    margin: 0;
    font-size: clamp(17px, 2.6cqi, 22px);
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    align-content: start;
  }

  /* Section headers: My Collections / TKA Core / Following each read as
	   their own labeled shelf. */
  .shelf-heading {
    margin: 10px 0 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .new-tile-input {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 72px;
  }

  .name-field {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 12px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-family: inherit;
  }

  .name-field:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent) 70%, transparent);
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--theme-accent) 14%, transparent);
  }

  .name-field::placeholder {
    color: color-mix(in srgb, var(--theme-text-dim, #888) 70%, transparent);
  }

  .confirm-create {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
    color: var(--theme-text, white);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .confirm-create:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 34%, transparent);
  }

  .confirm-create:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .confirm-create:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .tile-skeleton {
    min-height: 72px;
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #888) 12%,
      transparent
    );
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .shared-shelf-state {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 72px;
    padding: 14px 16px;
    border: 1px solid var(--theme-stroke);
    border-radius: 14px;
    background: var(--theme-card-bg);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .shared-shelf-state.warning {
    color: var(--semantic-warning);
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.85;
    }
  }

  .signed-out {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: clamp(40px, 12cqh, 96px) 24px;
    text-align: center;
  }

  .signed-out-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--theme-accent) 14%, transparent);
    color: color-mix(in srgb, var(--theme-accent) 80%, white);
    font-size: 24px;
  }

  .signed-out-title {
    margin: 0;
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .signed-out-hint {
    margin: 0;
    max-width: 380px;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.5;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
  }

  .auth-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }

  @media (prefers-reduced-motion: reduce) {
    .confirm-create {
      transition: none;
    }
    .tile-skeleton {
      animation: none;
    }
  }
</style>
