<!--
Learn Tab - Master learning interface

Learning destinations:
- Concepts: Progressive concept mastery path
- Play: Fun games to test your pictograph skills
- Guide: Level 1 guide (includes interactive codex catalog)
- TIKA: AI-powered TKA tutor

Navigation via bottom tabs (mobile-first UX pattern)
-->
<script lang="ts">
  import { getDelightOrchestrator } from "#lib/shared/delight/get-delight-orchestrator.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { onMount, untrack } from "svelte";
  import { fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import ConceptPathView from "./components/ConceptPathView.svelte";
  import ConceptDetailView from "./components/ConceptDetailView.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import type { LearnConcept } from "./domain/types";
  import { getConceptById } from "./domain/concepts";
  import { isConceptExperienceAvailable } from "./domain/concept-experience-registry";
  import {
    buildConceptPath,
    conceptIdFromPathname,
    isConceptPath,
  } from "./domain/concept-routes";
  import {
    readConceptPlaceId,
    shouldResumeSavedConcept,
    writeConceptPlaceId,
  } from "./domain/concept-place-routes";
  import {
    getActiveConceptId,
    setActiveConceptId,
    clearActiveConceptId,
  } from "./state/experience-persistence.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localizedConcept } from "./domain/localized-concept";
  import { setDelightOrchestrator } from "#lib/shared/delight/context/delight-context.js";
  import ConfettiBurst from "#lib/shared/delight/components/ConfettiBurst.svelte";
  import AchievementToast from "#lib/shared/delight/components/AchievementToast.svelte";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import { withViewTransition } from "./play/state/view-transition";

  type LearnMode = "concepts" | "play" | "tika" | "guide";

  // Tab order for determining slide direction
  const TAB_ORDER: LearnMode[] = ["concepts", "play", "tika", "guide"];

  // Props
  let {
    onHeaderChange,
    publicCourse = false,
  }: {
    onHeaderChange?: (header: string) => void;
    publicCourse?: boolean;
  } = $props();

  const delightOrchestrator = getDelightOrchestrator();

  // Provide delight orchestrator to child components via context
  setDelightOrchestrator(delightOrchestrator);

  // Active mode synced with navigation state
  let activeMode = $state<LearnMode>("concepts");

  // Slide direction for tab transitions (1 = right, -1 = left)
  let slideDirection = $state<1 | -1>(1);
  let previousMode = $state<LearnMode | null>(null);

  // Transition configuration
  const SLIDE_DISTANCE = 30; // pixels
  const SLIDE_DURATION = 200; // ms

  // Concept detail view state
  let selectedConcept = $state<LearnConcept | null>(null);
  let conceptOpenCount = $state(0); // Increments each open to force remount
  let returnPlaceId = $state<string | null>(null);

  // Sync with navigation state (bottom nav controls this)
  $effect(() => {
    const navMode = navigationState.currentLearnMode;

    // Map navigation modes to active mode
    let newMode: LearnMode = "concepts";
    if (navMode === "concepts") {
      newMode = "concepts";
    } else if (
      navMode === "quiz" ||
      navMode === "drills" ||
      navMode === "play"
    ) {
      newMode = "play";
    } else if (navMode === "codex") {
      // Retired tab — persisted/legacy saved state falls back to guide.
      newMode = "guide";
    } else if (navMode === "tika") {
      newMode = "tika";
    } else if (navMode === "guide") {
      newMode = "guide";
    }

    // Calculate slide direction based on tab order
    if (previousMode !== null && newMode !== previousMode) {
      const oldIndex = TAB_ORDER.indexOf(previousMode);
      const newIndex = TAB_ORDER.indexOf(newMode);
      slideDirection = newIndex > oldIndex ? 1 : -1;
    }

    previousMode = activeMode;
    activeMode = newMode;
  });

  // Reset states when switching modes
  $effect(() => {
    const mode = activeMode;
    const prev = previousMode;
    // Only reset when mode actually changes
    if (mode !== prev && prev !== null) {
      untrack(() => {
        selectedConcept = null;
        returnPlaceId = null;
        if (prev === "concepts") clearActiveConceptId();
      });
    }
  });

  // Effect: Update header when mode or selected concept changes
  $effect(() => {
    if (!onHeaderChange) return;

    let header = "";

    if (activeMode === "concepts") {
      if (selectedConcept) {
        header = localizedConcept(selectedConcept, "name") || t("learn_concept_details");
      } else {
        header = t("learn_ui_interactive_lessons");
      }
    } else if (activeMode === "play") {
      header = t("learn_play");
    } else if (activeMode === "tika") {
      header = "TIKA";
    } else if (activeMode === "guide") {
      header = t("learn_ui_level_one_guide");
    }

    onHeaderChange(header);
  });

  function writeConceptUrl(
    conceptId: string | undefined,
    mode: "push" | "replace",
    conceptPlaceId: string | null = returnPlaceId
  ) {
    mutateCurrentUrl(
      (url) => {
        url.pathname = buildConceptPath(conceptId);
        url.search = "";
        writeConceptPlaceId(url, conceptPlaceId);
        url.hash = "";
      },
      { mode }
    );
  }

  function openConcept(
    concept: LearnConcept,
    routeMode: "push" | "replace" | "none",
    conceptPlaceId: string | null = null
  ) {
    if (!isConceptExperienceAvailable(concept.id)) return;

    if (selectedConcept?.id !== concept.id) conceptOpenCount++;
    selectedConcept = concept;
    returnPlaceId = conceptPlaceId;
    setActiveConceptId(concept.id);

    if (routeMode !== "none")
      writeConceptUrl(concept.id, routeMode, conceptPlaceId);
    // A lesson opened from the public course hub is a new page to the reader,
    // so it starts at the top the way a full navigation would. Shallow routing
    // keeps the scroll position otherwise, and the hub's lesson list sits well
    // below the fold.
    if (publicCourse && routeMode === "push") window.scrollTo(0, 0);
  }

  function syncConceptFromUrl(restoreSavedConcept: boolean) {
    if (typeof window === "undefined") return;
    const pathname = window.location.pathname;
    if (!isConceptPath(pathname)) return;

    const routeConceptId = conceptIdFromPathname(pathname);
    const routePlaceId = readConceptPlaceId(
      new URLSearchParams(window.location.search)
    );
    const routeConcept = routeConceptId
      ? getConceptById(routeConceptId)
      : undefined;

    if (routeConcept && isConceptExperienceAvailable(routeConcept.id)) {
      openConcept(routeConcept, "none", routePlaceId);
      return;
    }

    if (
      shouldResumeSavedConcept(
        routeConceptId,
        routePlaceId,
        restoreSavedConcept
      )
    ) {
      const savedConceptId = getActiveConceptId();
      const savedConcept = savedConceptId
        ? getConceptById(savedConceptId)
        : undefined;
      if (savedConcept && isConceptExperienceAvailable(savedConcept.id)) {
        openConcept(savedConcept, "replace", routePlaceId);
        return;
      }
    }

    selectedConcept = null;
    returnPlaceId = routePlaceId;
    clearActiveConceptId();
    if (routeConceptId) writeConceptUrl(undefined, "replace");
  }

  // Public lesson links own the destination. The catalog stays a catalog;
  // the full app can still restore its interrupted lesson on entry.
  onMount(() => {
    // A public course URL always owns the Concepts mode, even if the full app
    // last persisted Play, TIKA, or Guide. Other Learn entry points keep their
    // saved tab behavior.
    const conceptRoute = isConceptPath(window.location.pathname);
    const navMode = navigationState.currentLearnMode;
    if (conceptRoute || !navMode) {
      navigationState.setLearnMode("concepts");
    }

    syncConceptFromUrl(!publicCourse);
    const handlePopstate = () => syncConceptFromUrl(false);
    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  });

  // Handle concept selection
  function handleConceptClick(concept: LearnConcept, conceptPlaceId?: string) {
    openConcept(concept, "push", conceptPlaceId ?? null);
  }

  function handleConceptContinue(
    concept: LearnConcept,
    conceptPlaceId: string | null
  ) {
    withViewTransition(() => openConcept(concept, "replace", conceptPlaceId));
  }

  // Handle back from detail view
  function handleBackToPath() {
    selectedConcept = null;
    clearActiveConceptId();
    writeConceptUrl(undefined, "replace", returnPlaceId);
  }

  // Check if mode is active
  function isModeActive(mode: LearnMode): boolean {
    return activeMode === mode;
  }

  // Play, TIKA and the Guide each bring Firebase with them. The public concept
  // course renders this tab too, so those screens load when a reader opens
  // them, which keeps Firebase off the course pages' first download. Inside
  // the app Firebase is already loaded, so they warm during idle instead and
  // the first switch stays instant.
  const loadPlayHub = () => import("./play/components/PlayHub.svelte");
  const loadTika = () => import("#lib/features/tika/TikaModule.svelte");
  const loadGuide = () => import("./guide/GuideTab.svelte");
</script>

<div
  class="learn-tab"
  class:public-course={publicCourse}
  class:course-index={publicCourse && selectedConcept === null}
>
  <!-- Delight components (confetti and toasts) -->
  <ConfettiBurst orchestrator={delightOrchestrator} />
  <AchievementToast orchestrator={delightOrchestrator} />

  {#if !publicCourse}
    <!-- Warm the other screens without mounting them (see the loaders above). -->
    <LazyMount loader={loadPlayHub} prefetch debugName="PlayHub" />
    <LazyMount loader={loadTika} prefetch debugName="TikaModule" />
    <LazyMount loader={loadGuide} prefetch debugName="GuideTab" />
  {/if}

  <!-- Content area - tab switching with slide transitions -->
  <div class="content-container">
    {#key activeMode}
      <div
        class="mode-panel"
        in:fly={{
          x: slideDirection * SLIDE_DISTANCE,
          duration: SLIDE_DURATION,
          easing: cubicOut,
        }}
        out:fly={{
          x: -slideDirection * SLIDE_DISTANCE,
          duration: SLIDE_DURATION,
          easing: cubicOut,
        }}
      >
        {#if isModeActive("concepts")}
          {#if selectedConcept}
            <!-- Key by openCount to force remount on each open -->
            {#key conceptOpenCount}
              <ConceptDetailView
                concept={selectedConcept}
                onClose={handleBackToPath}
                onContinue={handleConceptContinue}
              />
            {/key}
          {:else}
            <ConceptPathView onConceptClick={handleConceptClick} />
          {/if}
        {:else if isModeActive("play")}
          <LazyMount loader={loadPlayHub} active debugName="PlayHub" />
        {:else if isModeActive("tika")}
          <LazyMount loader={loadTika} active debugName="TikaModule" />
        {:else if isModeActive("guide")}
          <LazyMount loader={loadGuide} active debugName="GuideTab" />
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .learn-tab {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: transparent;
    color: var(--foreground, #ffffff);
    container-type: size;
    container-name: learn-tab;
  }

  .learn-tab.public-course:not(.course-index) {
    height: calc(100dvh - 64px);
  }

  .learn-tab.course-index {
    height: auto;
    min-height: calc(100dvh - 64px);
    overflow: visible;
    container-type: inline-size;
  }

  .learn-tab.course-index .content-container {
    height: auto;
    overflow: visible;
  }

  .learn-tab.course-index .mode-panel {
    position: relative;
    inset: auto;
    height: auto;
    overflow: visible;
  }

  /* Content container */
  .content-container {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Mode panels */
  .mode-panel {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
