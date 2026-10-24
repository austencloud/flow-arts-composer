<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getOfflineCacheOrchestrator } from "#lib/shared/offline/get-offline-cache-orchestrator.js";
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { DeviceDetector } from "#lib/shared/device/services/device-detector.js";
  import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";
  import { getBrowseEventHandler } from "../get-browse-event-handler";
  import { getThumbnailRenderOrchestrator } from "#lib/shared/browse/get-thumbnail-render-orchestrator.js";
  import type { ResponsiveSettings } from "#lib/shared/device/domain/models/device-models.js";
  import { onMount, onDestroy, setContext } from "svelte";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import ErrorBanner from "../../../create/shared/components/ErrorBanner.svelte";

  import { createOfflineCacheState } from "#lib/shared/offline/state/offline-cache-state.svelte.js";
  import { setOfflineCacheContext } from "#lib/shared/offline/context/offline-cache-context.js";

  import { networkStatusState } from "#lib/shared/offline/state/network-status-state.svelte.js";

  import type { BrowseEventHandler } from "../services/browse-event-handler";
  import MyCollectionsPanel from "../../collections/components/MyCollectionsPanel.svelte";
  import CommunityCollectionsPanel from "../../collections/components/CommunityCollectionsPanel.svelte";
  import { createBrowseEngine } from "#lib/shared/browse/engine/create-browse-engine.svelte.js";
  import GalleryTab from "./GalleryTab.svelte";
  import BrowseHeaderBar from "./BrowseHeaderBar.svelte";
  import BrowseScopeBar from "./BrowseScopeBar.svelte";
  import { scopeForLocation } from "#lib/shared/browse/navigation/browse-scope.js";
  import {
    bindBrowseQuery,
    createBrowseQueryState,
    setBrowseQueryContext,
  } from "#lib/shared/browse/state/browse-query-state.svelte.js";
  import { createBrowseHeaderState } from "#lib/shared/browse/state/browse-header-state.svelte.js";
  import { setBrowseHeaderContext } from "#lib/shared/browse/context/browse-header-context.js";
  import SmartCollectionSaveDialog from "#lib/features/library/components/SmartCollectionSaveDialog.svelte";
  import FilterWorkspace from "#lib/features/browse/gallery-home/FilterWorkspace.svelte";
  import { loadCanonicalTnDSequences } from "#lib/features/browse/gallery-home/canonical-tnd-pool.js";
  import { browseScrollState } from "#lib/shared/browse/state/browse-scroll-state.svelte.js";
  import {
    createBrowseNavigationState,
    getCollectionScanTargetFromURL,
    type BrowseLocation,
  } from "#lib/shared/browse/state/browse-navigation-state.svelte.js";
  import { setBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
  import {
    browseDestinationForLocation,
    browseLocationForDestination,
    type BrowseDestination,
    type BrowsePrimary,
  } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import { setPendingScanIntent } from "#lib/features/browse/state/pending-scan-intent.svelte.js";
  import { removeCurrentUrlParams } from "#lib/shared/navigation/services/url-state.js";
  import { BrowseScrollBehavior } from "../services/browse-scroll-behavior";
  import { desktopSidebarState } from "#lib/shared/layout/desktop-sidebar-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";
  import AnimationSheetCoordinator from "../../../../shared/coordinators/AnimationSheetCoordinator.svelte";
  import { consumePendingSequenceView } from "../../state/pending-sequence.svelte";
  import {
    peekPendingBrowseIntent,
    clearPendingBrowseIntent,
    setPendingLibraryReveal,
  } from "../../state/pending-browse-intent.svelte";
  import { openSequenceViewer } from "../../../../shared/sequence-viewer/services/sequence-viewer-navigator";
  import {
    getGalleryViewState,
    setGalleryViewState,
  } from "../services/gallery-view-persister";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { communityCollectionsState } from "#lib/features/browse/collections/state/community-collections-state.svelte.js";
  import { createSharedCollectionsState } from "#lib/features/browse/collections/state/shared-collections-state.svelte.js";
  import { setSharedCollectionsContext } from "#lib/features/browse/collections/context/shared-collections-context.js";
  import { getCollectionCollaborationManager } from "#lib/shared/library/get-collection-collaboration-manager.js";
  import { getCollectionOptions } from "#lib/features/browse/gallery-home/collection-options.svelte.js";
  import BrowsePanel from "#lib/shared/browse/components/BrowsePanel.svelte";
  import { trackBrowseDestinationEntered } from "#lib/shared/analytics/browse-events.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getAccessibleSectionsForModule } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import ExploreVisualsPanel from "#lib/features/browse/visuals/components/ExploreVisualsPanel.svelte";
  import BrowseHome, {
    type BrowseHomeDestination,
  } from "#lib/features/browse/home/BrowseHome.svelte";
  import { Crossfade, growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { page } from "$app/state";
  import {
    GALLERY_LETTER_QUERY_PARAM,
    parseGalleryLetterQuery,
  } from "#lib/shared/browse/navigation/gallery-letter-link.js";

  type ExploreSection = "sequences" | "collections" | "visuals";
  const EXPLORE_OPTIONS: Array<{
    value: ExploreSection;
    label: string;
  }> = [
    { value: "sequences", label: t("browse_ui_sequences_tab") },
    { value: "collections", label: t("browse_ui_collections_tab") },
    { value: "visuals", label: t("browse_ui_visuals_tab") },
  ];

  // STATE MANAGEMENT (Shared Coordination)

  // `visible` is passed by ModuleRenderer's keep-alive host (browse stays mounted
  // across module switches; the host toggles display). Browse has no render loop
  // to pause — off-screen thumbnails already idle via their IntersectionObserver
  // when display:none — so this is accepted for prop hygiene / future use.
  const { visible = true }: { visible?: boolean } = $props();

  const initialGalleryLetter = parseGalleryLetterQuery(
    new URLSearchParams(page.url.searchParams.toString())
  );
  // Review-only comparison. The unflagged Browse route keeps its current entry.
  const contentFirstShowAllPreview = $derived(
    page.url.searchParams.get("browseShowAll") === "results"
  );

  const engine = createBrowseEngine({
    persistKey: "tka-browse-gallery",
    initialSource: "community",
    sections: true,
    // No defaultSectionGroupBy: the left section index follows the active sort
    // (A–Z → letters, Level → difficulty, Date → dates, Length → lengths).
    // Gallery is pure discovery — your saved work lives in Library
    // (Collections module: the All shelf). A previously persisted
    // "my-library" source sanitizes back to community in the engine.
    sources: ["community"],
    // The canonical T&D alphabet joins the community pool as normal sequences:
    // one card per word ("AAAA" displays simplified as "A"), 49 turn combos as
    // its variations in the standard picker. Same citizenship as saved work.
    extraCommunitySequences: loadCanonicalTnDSequences,
  });

  // Restore where this SESSION was (sessionStorage — survives reload/HMR,
  // dies with the tab). Mid-browse: re-apply the search. The drill is now a
  // filter WORKSPACE with a rule strip, so persisted filters are visible and
  // editable there — restoring them no longer strands invisible state (the
  // old failure that forced a clear). Search stays transient.
  const restoredGalleryView = getGalleryViewState();
  if (initialGalleryLetter) {
    // A shared letter link is a content query, not the toolbar's fuzzy search.
    // Start from a clean rule set and apply the exact notation-only filter.
    engine.clearUserFilters();
    engine.setSearch("");
    engine.addFilter(
      BrowseFilterType.LETTER_OCCURRENCE,
      initialGalleryLetter,
      initialGalleryLetter,
      "var(--theme-accent)"
    );
  } else if (restoredGalleryView?.view === "browse-all") {
    engine.setSearch(restoredGalleryView.search);
  } else {
    engine.setSearch("");
  }

  // Service resolved lazily in onMount to ensure feature module is loaded
  let eventHandlerService: BrowseEventHandler | null = null;

  // Offline cache: create reactive state, publish to context for descendants
  const orchestrator = getOfflineCacheOrchestrator();
  const offlineCacheState = createOfflineCacheState(orchestrator);
  setOfflineCacheContext(offlineCacheState);

  const sharedCollectionsState = createSharedCollectionsState(
    getCollectionCollaborationManager()
  );
  setSharedCollectionsContext(sharedCollectionsState);

  const browseNavigationState = setBrowseNavigationContext(
    createBrowseNavigationState()
  );
  setBrowseHeaderContext(createBrowseHeaderState());

  // One query for every grid: seeded from the community engine (after the
  // restore above) so a returning visitor's filters survive, then carried to
  // whichever scope is open. Each scope's grid binds its own engine.
  const browseQuery = setBrowseQueryContext(createBrowseQueryState(engine));

  $effect(() => {
    sharedCollectionsState.start(authState.effectiveUserId);
  });

  // ✅ PURE RUNES: Local state
  let _selectedSequence = $state<SequenceData | null>(null);
  let error = $state<string | null>(null);
  const activePrimary = $derived<BrowsePrimary>(
    browseNavigationState.currentLocation?.primary ?? "explore"
  );
  const exploreSection = $derived<ExploreSection>(
    browseNavigationState.currentLocation?.primary === "explore" &&
      browseNavigationState.currentLocation.section === "collections"
      ? "collections"
      : browseNavigationState.currentLocation?.primary === "explore" &&
          browseNavigationState.currentLocation.section === "visuals"
        ? "visuals"
        : "sequences"
  );
  // Opening Browse lands on its home screen; the inner location stays
  // underneath so a tile or tab returns to it.
  const homeOpen = $derived(navigationState.isModuleHomeOpen("browse"));

  // Which pile the search bar runs over; null on pages that are not a
  // sequence grid (collection lists, visuals), which have no scope bar.
  const browseScope = $derived(
    homeOpen || !browseNavigationState.currentLocation
      ? null
      : scopeForLocation(browseNavigationState.currentLocation)
  );
  // Everyone's engine stays bound on every page, not only its own: it is the
  // one that persists, so a reload anywhere comes back to the last query
  // rather than to whatever Everyone held when you last stood on it.
  bindBrowseQuery(browseQuery, () => engine);
  // Your collections list has no pile of its own, but it keeps the bar: the
  // search and the scopes are how you leave it for a grid.
  const onCollectionsList = $derived(
    !homeOpen &&
      browseNavigationState.currentLocation?.primary === "you" &&
      browseNavigationState.currentLocation.section === "collections" &&
      browseNavigationState.currentLocation.view === "list"
  );

  function openFromHome(destination: BrowseHomeDestination): void {
    const location: BrowseLocation =
      destination.kind === "visuals"
        ? {
            primary: "explore",
            section: "visuals",
            view: "list",
            ...(destination.visualType
              ? { visualType: destination.visualType }
              : {}),
          }
        : browseLocationForDestination(destination.kind);
    // Push the inner route first so the address names the destination, then
    // close the home: setActiveTab clears it and the two agree on the shelf.
    browseNavigationState.navigateTo(location, { forceUrl: true });
    navigationState.setActiveTab(browseDestinationForLocation(location));
  }

  // Leaving the home through a sidebar tab writes the generic
  // /browse/{primary}/sequences address. Once the home closes, restate the
  // location Browse actually shows so the address and content agree.
  let wasHomeOpen = false;
  $effect(() => {
    const open = homeOpen;
    const closed = wasHomeOpen && !open;
    wasHomeOpen = open;
    if (!closed) return;
    queueMicrotask(() => {
      const location = browseNavigationState.currentLocation;
      // Only when the home closed into a Browse page. Leaving Browse for
      // another module also closes the home, and that address is not ours.
      if (
        location &&
        navigationState.currentModule === "browse" &&
        !navigationState.isModuleHomeOpen("browse")
      ) {
        const selected = navigationState.activeTab as BrowseDestination;
        if (browseDestinationForLocation(location) !== selected) {
          browseNavigationState.navigateTo(
            browseLocationForDestination(selected),
            {
              replace: true,
            }
          );
        } else {
          browseNavigationState.replace(location);
        }
      }
    });
  });

  let lastTrackedDestination: "gallery" | "library" | "collections" | null =
    null;

  // Browse stays mounted while someone uses another module. Resetting when it
  // is hidden means returning to the same destination counts as a fresh visit,
  // while unrelated reactive updates never inflate the event.
  $effect(() => {
    if (!visible || homeOpen) {
      lastTrackedDestination = null;
      return;
    }
    const destination =
      activePrimary === "you"
        ? "library"
        : exploreSection === "collections"
          ? "collections"
          : "gallery";
    if (destination === lastTrackedDestination) return;
    lastTrackedDestination = destination;
    trackBrowseDestinationEntered(destination);
  });
  // Gallery opens on the drill front door (GalleryDrill); any pick or
  // "Browse all" reveals the full GalleryTab. Stays on the chosen view
  // while mounted, and this session's view survives reload/HMR.
  let galleryView = $state<"start-here" | "browse-all">(
    initialGalleryLetter
      ? "browse-all"
      : (restoredGalleryView?.view ?? "start-here")
  );

  let appliedGalleryLetter = $state(initialGalleryLetter);

  // Keep the stable ?letter= route and the live exact-content filter in sync.
  // Browse is keep-alive, so this also handles a later letter link without
  // requiring a remount.
  $effect(() => {
    const requested = parseGalleryLetterQuery(
      new URLSearchParams(page.url.searchParams.toString())
    );
    if (requested === appliedGalleryLetter) return;

    engine.removeFilter(String(BrowseFilterType.LETTER_OCCURRENCE));
    appliedGalleryLetter = requested;
    if (!requested) return;

    engine.clearUserFilters();
    engine.setSearch("");
    engine.addFilter(
      BrowseFilterType.LETTER_OCCURRENCE,
      requested,
      requested,
      "var(--theme-accent)"
    );
    galleryView = "browse-all";
  });

  // If someone dismisses the query chip, the address bar must stop claiming
  // the view is still filtered. The next reload therefore tells the same truth.
  $effect(() => {
    const requested = parseGalleryLetterQuery(
      new URLSearchParams(page.url.searchParams.toString())
    );
    if (!requested) return;
    const active = engine.activeFilters.get(
      String(BrowseFilterType.LETTER_OCCURRENCE)
    );
    if (active?.value === requested) return;
    removeCurrentUrlParams([GALLERY_LETTER_QUERY_PARAM]);
  });

  // Record view + search whenever they change so a reload/HMR remount
  // restores this exact spot (filters restore via the engine's own persist).
  $effect(() => {
    setGalleryViewState({ view: galleryView, search: engine.searchQuery });
  });

  // Instant tap feel. A drill pick used to apply the filter AND mount the grid
  // in the same task, so the filter/sort/section compute (~250ms on the prod
  // pool) blocked the first paint — a dead beat where nothing changed on tap.
  // Instead: flip to the grid + paint its skeleton THIS frame, then run the
  // mutation (the expensive compute) a frame later, behind the skeleton. The
  // layout changes the instant you tap; cards fill in a beat afterward.
  let gridWarming = $state(false);
  let smartSaveOpen = $state(false);

  // Collections are a FILTER in the gallery, not a door out of it: the tile
  // opens a value editor and picking one stacks an "In: <name>" rule. The
  // Library tab stays the management home (create, edit membership, share).
  const collectionOptions = $derived.by(() => getCollectionOptions());
  function applyToGrid(mutate: () => void) {
    galleryView = "browse-all";
    gridWarming = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        mutate();
        gridWarming = false;
      })
    );
  }
  // A handoff from another module — today the profile's Archive doorway, which
  // displays a count above its button and so must land on the pool that count
  // was read from. Consumed in an effect rather than onMount because Browse is
  // keep-alive: it mounts once and every later handoff would be dropped.
  //
  // Deferred a frame in both branches. The tab-sync effect below writes its own
  // `navigateTo({ view: "list" })` when the active tab changes, and effect order
  // between the two is not guaranteed — running after the frame settles means
  // the intent always wins rather than usually winning.
  $effect(() => {
    const intent = peekPendingBrowseIntent();
    if (!intent) return;
    clearPendingBrowseIntent();

    if (intent.kind === "creator-gallery") {
      const name = intent.ownerName;
      requestAnimationFrame(() => {
        // Browse restores its own last location from localStorage, and the
        // effect that mirrors it into the active tab will happily pull the
        // Library tab back over a gallery handoff. Say where we are in that
        // vocabulary too, so both sources of truth agree.
        browseNavigationState.viewExploreSequences();
        // Exactly what the drill's own creator row applies
        // (GalleryDrill.svelte), so the destination is the familiar filtered
        // grid rather than a second thing that means the same.
        applyToGrid(() => {
          engine.clearUserFilters();
          engine.setSearch("");
          engine.addFilter(BrowseFilterType.OWNER, name, name, "#6aa0ff");
        });
      });
    } else if (intent.kind === "art-shelf") {
      const { shelfId, label } = intent;
      requestAnimationFrame(() =>
        browseNavigationState.viewCollectionDetail(shelfId, label)
      );
    } else if (intent.kind === "explore-visual-detail") {
      const { visualType, artifactId } = intent;
      requestAnimationFrame(() =>
        browseNavigationState.navigateTo({
          primary: "explore",
          section: "visuals",
          view: "detail",
          visualType,
          contextId: artifactId,
        })
      );
    } else if (intent.kind === "public-collection-detail") {
      const { ownerId, collectionId, collectionName } = intent;
      requestAnimationFrame(() =>
        browseNavigationState.viewPublicCollectionDetail(
          ownerId,
          collectionId,
          collectionName
        )
      );
    } else if (intent.kind === "collection-detail") {
      const contextId = intent.foreignOwnerId
        ? `${intent.foreignOwnerId}:${intent.collectionId}`
        : intent.collectionId;
      // Park the reveal before routing: the detail view reads it on mount.
      if (intent.revealSequenceId) {
        setPendingLibraryReveal(intent.revealSequenceId);
      }
      requestAnimationFrame(() =>
        browseNavigationState.viewCollectionDetail(
          contextId,
          intent.collectionName
        )
      );
    } else {
      if (intent.revealSequenceId) {
        setPendingLibraryReveal(intent.revealSequenceId);
      }
      requestAnimationFrame(() =>
        browseNavigationState.viewCollectionDetail("all", "All")
      );
    }
  });

  let showAnimator = $state<boolean>(false);
  let sequenceToAnimate = $state<SequenceData | null>(null);
  let isAnimationModalOpen = $state(false);

  function openAnimationModal(sequence: SequenceData) {
    sequenceToAnimate = sequence;
    isAnimationModalOpen = true;
  }

  function closeAnimationModal() {
    isAnimationModalOpen = false;
    sequenceToAnimate = null;
  }

  // Services
  let deviceDetector: DeviceDetector | null = null;

  // Reactive responsive settings from DeviceDetector
  let responsiveSettings = $state<ResponsiveSettings | null>(null);

  // ✅ PURE RUNES: Device detection for UI adaptation
  const isMobile = $derived(
    responsiveSettings?.isMobile || responsiveSettings?.isTablet || false
  );

  // Desktop sidebar visibility (to hide top section when sidebar is visible)
  const showDesktopSidebar = $derived(desktopSidebarState.isVisible);

  // ✅ Calculate drawer width for 60/40 split (grid gets 60%, detail panel gets 40% of remaining space)
  // Use actual sidebar width which reflects collapsed state (220px expanded, 64px collapsed, 0px hidden)
  const sidebarWidth = $derived(
    showDesktopSidebar ? desktopSidebarState.width : 0
  );
  // Keep drawer width constant to avoid flashing when opening/closing
  const drawerWidth = $derived(
    !isMobile
      ? `calc((100vw - ${sidebarWidth}px) * 0.4)` // Detail panel takes 40% of remaining space
      : "min(600px, 90vw)"
  );

  // Only an outer section change selects a new inner destination. Reading the
  // location here also lets the effect wait for Browse's cold-route restore.
  let observedNavTab = navigationState.activeTab;
  $effect(() => {
    const navTab = navigationState.activeTab;
    const location = browseNavigationState.currentLocation;
    if (!location) return;
    if (homeOpen || navTab === observedNavTab) return;
    observedNavTab = navTab;
    if (
      browseDestinationForLocation(location) !== navTab &&
      !browseNavigationState.isNavigating
    ) {
      // The coordinator pushes the sidebar choice after its View Transition.
      // Updating the URL here would replace the previous history entry first,
      // so Back would return to the same destination instead of the prior one.
      browseNavigationState.navigateTo(
        browseLocationForDestination(navTab as BrowseDestination),
        { replace: true, syncUrl: false }
      );
    }
  });

  // Back/forward and inner Browse actions select the matching outer section.
  $effect(() => {
    const location = browseNavigationState.currentLocation;
    if (!location) return;
    if (homeOpen) return;
    const destination = browseDestinationForLocation(location);
    if (navigationState.activeTab !== destination) {
      navigationState.setActiveTab(destination);
    }
  });

  /**
   * Handle navigation from history back/forward buttons
   */
  function handleHistoryNavigation(location: BrowseLocation) {
    const destination = browseDestinationForLocation(location);
    if (destination !== navigationState.activeTab) {
      navigationState.setActiveTab(destination);
    }

    if (
      location.primary === "explore" &&
      location.section === "sequences" &&
      location.view === "detail" &&
      location.contextId
    ) {
      // TODO: Re-open sequence detail panel with contextId
    }
  }

  // ✅ SYNC ANIMATION MODAL STATE
  $effect(() => {
    showAnimator = isAnimationModalOpen;
  });

  // ✅ SYNC CLOSE HANDLER
  $effect(() => {
    if (!showAnimator && isAnimationModalOpen) {
      closeAnimationModal();
    }
  });

  // ============================================================================
  // SCROLL BEHAVIOR (UI Visibility Control)
  // ============================================================================

  // Create scroll behavior service instance
  const scrollBehaviorService = new BrowseScrollBehavior(browseScrollState);

  // Reactive UI visibility state
  const isUIVisible = $derived(browseScrollState.isUIVisible);

  // Provide scroll visibility context for child components
  setContext("browserScrollVisibility", {
    getVisible: () => browseScrollState.isUIVisible,
    hide: () => scrollBehaviorService.forceHideUI(),
    show: () => scrollBehaviorService.forceShowUI(),
  });

  // Provide navigation context for back/forward buttons and cross-tab navigation
  setContext("browseNavigation", {
    onNavigate: handleHistoryNavigation,
    navigateToSequenceDetail: browseNavigationState.viewSequenceDetail,
    navigateToCollectionDetail: browseNavigationState.viewCollectionDetail,
    navigateToCreatorSequences: browseNavigationState.viewCreatorSequences,
  });

  // ============================================================================
  // LIFECYCLE (Coordination)
  // ============================================================================

  onMount(() => {
    // Every gallery card a signed-out visitor renders is a candidate for the
    // crowd-sourced thumbnail cache, and Storage only accepts authenticated
    // writes. Mint the anonymous identity now so it is already settled by the
    // time the first render finishes; the upload site re-checks on its own,
    // so this is a head start, not the gate. Best-effort: the helper swallows
    // provider failures and no-ops once any user exists.
    void ensureGuestIdentity("gallery_mount");

    // The gallery's Collections filter needs the live collection lists; both
    // stores are session singletons that no-op on a repeat call.
    collectionsState.ensureStarted();
    void communityCollectionsState.ensureLoaded();

    // Start background caching of gallery metadata + thumbnails so the browse
    // module works offline on subsequent visits without any user action.
    offlineCacheState.startBackgroundCache();

    // On reconnect: clear PublicSequencesLoader's in-memory cache so the next
    // gallery load re-fetches from Firestore and repopulates the Dexie offline cache
    // with fresh data. This cast is intentional - adding clearCache() to PublicSequencesLoader
    // is a larger interface change deferred to a later task.
    const unsubscribeReconnect = networkStatusState.onOnline(() => {
      const loader = getBrowseLoader() as unknown as {
        cachedSequences?: unknown;
      };
      if (loader) {
        loader.cachedSequences = null;
      }
    });

    // Collection deep links (current and already-printed legacy forms) —
    // this is the URL a phone lands on after scanning the desktop scan sheet's
    // handoff QR. The scan flag asks the detail view to open the scanner
    // immediately, so the phone goes from QR scan to camera in one hop.
    const scanTarget = getCollectionScanTargetFromURL();

    // URL wins on direct load; versioned persisted state fills in otherwise.
    browseNavigationState.initialize();

    if (scanTarget) {
      // The URL is the source of truth on load — override localStorage.
      browseNavigationState.viewCollectionDetail(scanTarget.collectionId);
      if (scanTarget.scan) {
        setPendingScanIntent(scanTarget.collectionId);
        // Consume the flag from the URL too: a refresh should show the
        // collection, not relaunch the scanner.
        removeCurrentUrlParams(["scan"]);
      }
    }

    // Resolve event handler service from ITI container
    try {
      eventHandlerService = getBrowseEventHandler();

      // Initialize event handler service with required parameters
      eventHandlerService.initialize({
        engine,
        openAnimationModal,
        setSelectedSequence: (seq: SequenceData | null) =>
          (_selectedSequence = seq),
        setError: (err: string | null) => (error = err),
      });
    } catch (err) {
      console.error("BrowseModule: Failed to resolve BrowseEventHandler", err);
      error = "Failed to initialize browse module services";
    }

    // Initialize DeviceDetector service
    let cleanup: (() => void) | undefined;
    try {
      deviceDetector = getDeviceDetector();
      if (deviceDetector) {
        responsiveSettings = deviceDetector.getResponsiveSettings();

        // Store cleanup function from onCapabilitiesChanged
        cleanup = deviceDetector.onCapabilitiesChanged(() => {
          responsiveSettings = deviceDetector!.getResponsiveSettings();
        });
      }
    } catch (err) {
      console.warn("BrowseModule: Failed to resolve DeviceDetector", err);
    }

    // Load initial data (engine restores persisted source from localStorage).
    engine
      .initialize()
      .then(() => {
        // Check if we have a pending sequence to view (e.g., from inbox message)
        const pendingSequenceId = consumePendingSequenceView();
        if (pendingSequenceId) {
          const sequence = engine.sequences.find(
            (s) => s.id === pendingSequenceId
          );
          if (sequence) {
            openSequenceViewer(sequence, {
              source: "browse_gallery",
              returnPath: "/browse/explore/sequences",
              returnLabel: "Browse",
            });
          } else {
            console.warn(
              "[BrowseModule] Pending sequence not found:",
              pendingSequenceId
            );
          }
        }
      })
      .catch((err) => {
        console.error("Data loading failed:", err);
        error =
          err instanceof Error
            ? err.message
            : "Failed to load gallery sequences";
      });

    // Return cleanup function
    return () => {
      cleanup?.();
      unsubscribeReconnect();
    };
  });

  onDestroy(() => {
    sharedCollectionsState.stop();
    browseNavigationState.destroy();
  });

  // Cancel all pending thumbnail renders when leaving the browse module
  // This prevents the render queue from continuing to process after navigation
  onDestroy(() => {
    engine.destroy();
    try {
      const orchestrator = getThumbnailRenderOrchestrator();
      if (orchestrator) {
        orchestrator.cancelAll();
      }
    } catch {
      // Service may not be available during HMR or early unmount
    }
  });
</script>

{#snippet resultsPane()}
  <!-- The scope bar above owns search for every grid, so this pane narrows
       live under it instead of carrying a second search field. -->
  <BrowsePanel
    {engine}
    layout="compact"
    eager={false}
    showFilterBar={false}
    hideFilterChips
    hideToolbarSearch
    onSelect={(sequence, variations) =>
      eventHandlerService?.handleSequenceAction(
        "view-detail",
        sequence,
        variations
      )}
  />
{/snippet}

<!-- Error banner -->
{#if error}
  <ErrorBanner
    message={error}
    onDismiss={() => eventHandlerService?.handleErrorDismiss()}
    onRetry={() => eventHandlerService?.handleRetry()}
  />
{/if}

<!-- Animation Sheet Coordinator -->
<AnimationSheetCoordinator
  sequence={sequenceToAnimate}
  bind:isOpen={showAnimator}
/>

<SmartCollectionSaveDialog {engine} bind:show={smartSaveOpen} />

<!-- Sequence Details Modal removed - BrowseEventHandler.handleViewDetail() navigates to /sequence/[id] route -->

<!-- Main layout - shows immediately with skeletons while data loads -->
<div class="browse-content">
  <!-- One navigation bar for every Browse screen. It sits above the
       Crossfade so the trail, back box and screen actions never fade or move
       with the content under them. -->
  <BrowseHeaderBar compact={isMobile} />
  {#if browseScope || onCollectionsList}
    <div
      class="scope-bar-slot"
      transition:growFade={{ duration: DURATION.normal }}
    >
      <BrowseScopeBar scope={browseScope} />
    </div>
  {/if}
  <!-- Community and personal work replace one another without moving the
       surrounding navigation. -->
  <div class="browse-tab-content">
    <Crossfade
      key={homeOpen ? "home" : activePrimary}
      duration={DURATION.normal}
      fill
    >
      <div class="tab-panel">
        {#if homeOpen}
          <BrowseHome
            destinations={getAccessibleSectionsForModule("browse")}
            onSelect={openFromHome}
          />
        {:else if activePrimary === "explore"}
          <div class="explore-shell">
            {#if isMobile}
              <!-- Phones and tablets have no sidebar, so the Community
                   sibling switcher sits in its own row under the bar. -->
              <div class="explore-switcher-row">
                <div class="explore-switcher">
                  <SegmentedControl
                    options={EXPLORE_OPTIONS}
                    value={exploreSection}
                    onchange={(section) => {
                      if (section === "collections") {
                        browseNavigationState.viewExploreCollections();
                      } else if (section === "visuals") {
                        // No visualType: Explore > Visuals shows every type on
                        // one wall. A type in the URL is a deep-link filter.
                        browseNavigationState.navigateTo({
                          primary: "explore",
                          section: "visuals",
                          view: "list",
                        });
                      } else {
                        browseNavigationState.viewExploreSequences();
                      }
                    }}
                    color="accent"
                    semantics="tabs"
                    ariaLabel={t("browse_ui_explore_content_type")}
                  />
                </div>
              </div>
            {/if}

            <div class="explore-body">
              {#if exploreSection === "sequences"}
                <!-- Phones and tablets go straight to the grid; their Filters
                     sheet is the chooser. Desktop keeps the workspace with its
                     live results beside it. -->
                {#if galleryView === "start-here" && !isMobile}
                  <FilterWorkspace
                    {engine}
                    collections={collectionOptions}
                    {contentFirstShowAllPreview}
                    {resultsPane}
                    onSaveSmart={() => (smartSaveOpen = true)}
                    onEject={applyToGrid}
                  />
                {:else}
                  <GalleryTab
                    {isMobile}
                    {drawerWidth}
                    {engine}
                    {error}
                    warming={gridWarming}
                    onSequenceAction={(action, sequence, variations) => {
                      return (
                        eventHandlerService?.handleSequenceAction(
                          action,
                          sequence,
                          variations
                        ) ?? Promise.resolve()
                      );
                    }}
                    onBackToStart={isMobile
                      ? undefined
                      : () => (galleryView = "start-here")}
                    onOpenWorkspace={() => (galleryView = "start-here")}
                    onSaveSmart={() => (smartSaveOpen = true)}
                  />
                {/if}
              {:else if exploreSection === "collections"}
                <CommunityCollectionsPanel />
              {:else}
                <ExploreVisualsPanel />
              {/if}
            </div>
          </div>
        {:else}
          <MyCollectionsPanel />
        {/if}
      </div>
    </Crossfade>
  </div>
</div>

<style>
  .browse-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .scope-bar-slot {
    flex: 0 0 auto;
  }

  .browse-tab-content {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .tab-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .explore-shell {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
  }

  .explore-switcher-row {
    display: flex;
    flex: 0 0 auto;
    padding: 8px clamp(12px, 2cqi, 28px);
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
  }

  /* Reserve room for translated labels while keeping the control bounded. */
  .explore-switcher {
    flex: 1 1 auto;
    width: auto;
    max-width: 560px;
    min-width: 0;
  }

  .explore-switcher :global(.segment-label) {
    min-width: 0;
    overflow-wrap: anywhere;
    hyphens: auto;
  }

  .explore-body {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* Phones reach the Community sections from the bottom navigation, so the
     switcher row only serves tablets. */
  @media (max-width: 560px) {
    .explore-switcher-row {
      display: none;
    }
  }
</style>
