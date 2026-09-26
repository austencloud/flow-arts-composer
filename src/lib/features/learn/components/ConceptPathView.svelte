<script lang="ts">
  import { onMount } from "svelte";
  import { growFade } from "$lib/shared/transitions/motion";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getConceptProgressTracker } from "$lib/features/learn/get-concept-progress-tracker";
  import { getConceptsByCategory } from "../domain/concepts";
  import { getConceptPlace } from "../domain/concept-place-registry";
  import {
    readConceptPlaceId,
    writeConceptPlaceId,
  } from "../domain/concept-place-routes";
  import { getAvailableConcepts } from "../domain/concept-experience-registry";
  import type {
    LearnConcept,
    ConceptCategory,
    LearningProgress,
  } from "../domain/types";
  import { CAPABILITY_NUDGES } from "$lib/shared/subscription/domain/capability-nudges";
  import PremiumNudge from "$lib/shared/subscription/components/PremiumNudge.svelte";
  import HeroConceptCard from "./HeroConceptCard.svelte";
  import ConceptCard from "./ConceptCard.svelte";
  import CategoryHeader from "./CategoryHeader.svelte";
  import ConceptLevelMap from "./ConceptLevelMap.svelte";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  let {
    onConceptClick,
  }: {
    onConceptClick?: (concept: LearnConcept, conceptPlaceId?: string) => void;
  } = $props();

  // Resolve service via DI
  const conceptProgressService = getConceptProgressTracker();

  // Progress state
  let progress = $state(conceptProgressService.getProgress());
  let showCourseMap = $state(false);
  let selectedPlaceId = $state("1.1");
  const availableConcepts = getAvailableConcepts();
  const availableConceptIds = new Set(
    availableConcepts.map((concept) => concept.id)
  );
  const completedAvailableCount = $derived(
    availableConcepts.filter((concept) =>
      progress.completedConcepts.has(concept.id)
    ).length
  );

  // Subscribe to progress updates
  onMount(() => {
    const unsubscribe = conceptProgressService.subscribe(
      (newProgress: LearningProgress) => {
        progress = newProgress;
      }
    );

    const syncPlaceFromUrl = () => {
      const placeId = readConceptPlaceId(
        new URLSearchParams(window.location.search)
      );
      const place = placeId ? getConceptPlace(placeId) : undefined;
      if (place?.tkaLevel === 1) {
        selectedPlaceId = place.id;
        showCourseMap = true;
      }
    };
    syncPlaceFromUrl();
    window.addEventListener("popstate", syncPlaceFromUrl);

    return () => {
      unsubscribe();
      window.removeEventListener("popstate", syncPlaceFromUrl);
    };
  });

  // Find the current concept (first non-completed, non-locked)
  // The experience registry only contains lessons with a real component.
  const currentConcept = $derived((): LearnConcept => {
    // First, find any in-progress concept
    const inProgress = availableConcepts.find(
      (c) => conceptProgressService.getConceptStatus(c.id) === "in-progress"
    );
    if (inProgress) return inProgress;

    // Otherwise, find first available concept
    const available = availableConcepts.find(
      (c) => conceptProgressService.getConceptStatus(c.id) === "available"
    );
    if (available) return available;

    // If all completed, return last concept
    if (completedAvailableCount === availableConcepts.length) {
      return availableConcepts[availableConcepts.length - 1]!;
    }

    return availableConcepts[0]!;
  });

  const currentConceptStatus = $derived(
    conceptProgressService.getConceptStatus(currentConcept().id)
  );

  const nextUpConcept = $derived(() => {
    const current = currentConcept();
    const index = availableConcepts.findIndex(
      (concept) => concept.id === current.id
    );
    return index >= 0 && index < availableConcepts.length - 1
      ? availableConcepts[index + 1]
      : undefined;
  });

  // Categories for "View all" section
  const categories: ConceptCategory[] = [
    "foundation",
    "letters",
    "combinations",
    "advanced",
  ];

  function getCategoryProgress(category: ConceptCategory) {
    const concepts = availableConcepts.filter(
      (concept) => concept.category === category
    );
    const completed = concepts.filter((c) =>
      progress.completedConcepts.has(c.id)
    ).length;
    return { completed, total: concepts.length };
  }

  const availableCategories = categories.filter((category) =>
    availableConcepts.some((concept) => concept.category === category)
  );

  // Premium gating - Foundation is free, everything else shows preview nudge
  const curriculumNudge =
    CAPABILITY_NUDGES["capability:learn:full-curriculum"]!;
  let premiumNudgeVisible = $state(false);
  let pendingPremiumConcept = $state<LearnConcept | null>(null);
  let pendingPremiumPlaceId = $state<string | undefined>();

  // Pre-launch: premium isn't shippable yet, so nothing is premium-gated when
  // the flag is off — non-foundation categories open freely with no Scribe
  // nudge or premium badge. Gating returns at launch via __FEATURE_PREMIUM__.
  const premiumEnabled =
    typeof __FEATURE_PREMIUM__ !== "undefined" && __FEATURE_PREMIUM__;

  function isPremiumGatedCategory(category: ConceptCategory): boolean {
    return premiumEnabled && category !== "foundation";
  }

  function handleConceptStart(concept: LearnConcept, conceptPlaceId?: string) {
    if (isPremiumGatedCategory(concept.category) && !premiumNudgeVisible) {
      // Show preview nudge, then proceed
      premiumNudgeVisible = true;
      pendingPremiumConcept = concept;
      pendingPremiumPlaceId = conceptPlaceId;
      return;
    }
    onConceptClick?.(concept, conceptPlaceId);
  }

  function handleNudgeDismiss() {
    premiumNudgeVisible = false;
    // In preview mode, proceed to the concept after dismissal
    if (pendingPremiumConcept) {
      const concept = pendingPremiumConcept;
      const conceptPlaceId = pendingPremiumPlaceId;
      pendingPremiumConcept = null;
      pendingPremiumPlaceId = undefined;
      onConceptClick?.(concept, conceptPlaceId);
    }
  }

  function handlePlaceSelect(conceptPlaceId: string) {
    selectedPlaceId = conceptPlaceId;
    mutateCurrentUrl((url) => writeConceptPlaceId(url, conceptPlaceId), {
      mode: "push",
    });
  }

  // Check if journey is complete
  const isJourneyComplete = $derived(
    availableConcepts.length > 0 &&
      completedAvailableCount === availableConcepts.length
  );
</script>

<div class="concept-path">
  <section class="launch-zone" aria-labelledby="course-title">
    <header class="course-intro" style:view-transition-name="launchpad-guide">
      <div>
        <h1 id="course-title">{t("learn_ui_interactive_lessons")}</h1>
        <p>{t("learn_ui_course_intro")}</p>
      </div>
      <a class="read-guide-link" href="/guide">
        <i class="fa-solid fa-book-open" aria-hidden="true"></i>
        <span>{t("learn_ui_read_guide")}</span>
      </a>
    </header>

    <div class="main-content">
      {#if isJourneyComplete}
        <div class="completion-celebration">
          <div class="celebration-icon">
            <i class="fa-solid fa-trophy" aria-hidden="true"></i>
          </div>
          <h2>{t("learn_ui_level_complete")}</h2>
          <p>{t("learn_ui_all_lessons_complete")}</p>
        </div>
      {:else}
        <HeroConceptCard
          concept={currentConcept()}
          status={currentConceptStatus}
          onStart={handleConceptStart}
        />

        {#if nextUpConcept()}
          <p class="next-lesson">
            {t("learn_ui_after_this")} <span>{nextUpConcept()?.name}</span>
          </p>
        {/if}
      {/if}
    </div>
  </section>

  <section class="lesson-library" aria-labelledby="lesson-library-title">
    <header class="library-heading">
      <h2 id="lesson-library-title">{t("learn_ui_available_lessons")}</h2>
      <span
        >{t("learn_ui_lesson_count", { count: availableConcepts.length })}</span
      >
    </header>
    <div class="all-concepts">
      {#each availableCategories as category}
        {@const categoryProgress = getCategoryProgress(category)}
        {@const concepts = getConceptsByCategory(category).filter((concept) =>
          availableConceptIds.has(concept.id)
        )}

        <section class="category-section">
          <CategoryHeader
            {category}
            completedCount={categoryProgress.completed}
            totalCount={categoryProgress.total}
            premiumGated={isPremiumGatedCategory(category)}
          />
          <div class="concept-list">
            {#each concepts as concept (concept.id)}
              {@const status = conceptProgressService.getConceptStatus(
                concept.id
              )}
              <ConceptCard
                {concept}
                {status}
                premiumGated={isPremiumGatedCategory(concept.category)}
                onClick={handleConceptStart}
              />
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </section>

  <div class="map-heading">
    <PanelButton
      onclick={() => (showCourseMap = !showCourseMap)}
      ariaExpanded={showCourseMap}
    >
      {showCourseMap ? "Hide course map" : "Explore the course map"}
      <i
        class="fa-solid {showCourseMap ? 'fa-chevron-up' : 'fa-chevron-down'}"
        aria-hidden="true"
      ></i>
    </PanelButton>
  </div>
  {#if showCourseMap}
    <div class="level-map-slot" transition:growFade>
      <ConceptLevelMap
        selectedId={selectedPlaceId}
        onSelect={handlePlaceSelect}
        onLessonStart={handleConceptStart}
      />
    </div>
  {/if}

  {#if premiumNudgeVisible}
    <div class="premium-nudge-overlay">
      <PremiumNudge
        nudge={curriculumNudge}
        preview={true}
        onDismiss={handleNudgeDismiss}
      />
    </div>
  {/if}
</div>

<style>
  .concept-path {
    display: flex;
    flex-direction: column;
    gap: clamp(1rem, 1.5cqw, 1.5rem);
    padding: clamp(0.75rem, 2cqw, 1.5rem);
    padding-bottom: 5rem;
    min-height: 100%;
    max-width: min(100%, 110rem);
    margin: 0 auto;
    width: 100%;

    /* Elegant thin scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .launch-zone {
    display: grid;
    gap: clamp(1rem, 2cqw, 1.75rem);
    padding: clamp(1rem, 2cqw, 1.5rem);
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  .course-intro {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 0.25rem;
  }

  .course-intro > div {
    min-width: 0;
  }

  .course-intro h1 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.35rem, 3cqw, 2rem);
    line-height: 1.1;
  }

  .course-intro p {
    max-width: 42rem;
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim);
    font-size: 0.9375rem;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .read-guide-link {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.75rem 1rem;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 10px;
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
  }

  .read-guide-link:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--prop-blue, #60a5fa);
  }

  /* Webkit scrollbar styling */
  .concept-path::-webkit-scrollbar {
    width: 6px;
  }

  .concept-path::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .concept-path::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background var(--duration-normal) ease;
  }

  .concept-path::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .main-content {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 52rem;
    margin: 0 auto;
    width: 100%;
  }

  .next-lesson {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .next-lesson span {
    color: var(--theme-text);
  }

  .lesson-library {
    display: grid;
    gap: 1.75rem;
    padding-top: 0.75rem;
  }

  .library-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1rem;
  }
  .library-heading h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: 1.5rem;
    letter-spacing: -0.02em;
  }
  .library-heading > span {
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }
  .map-heading {
    padding-top: 0.5rem;
  }

  /* Completion celebration */
  .completion-celebration {
    --achievement-gold: #ffd700;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 3rem 2rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--achievement-gold) 10%, transparent) 0%,
      color-mix(in srgb, var(--achievement-gold) 2%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--achievement-gold) 20%, transparent);
    border-radius: 16px;
  }

  .celebration-icon {
    width: 80px;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--achievement-gold) 15%, transparent);
    border-radius: 50%;
    margin-bottom: 1.5rem;
  }

  .celebration-icon i {
    font-size: 2.5rem;
    color: var(--achievement-gold);
    text-shadow: 0 0 24px
      color-mix(in srgb, var(--achievement-gold) 50%, transparent);
  }

  .completion-celebration h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--achievement-gold);
    margin: 0 0 0.5rem;
  }

  .completion-celebration p {
    font-size: 1rem;
    color: var(--theme-text-dim);
    margin: 0 0 1.5rem;
  }

  /* All concepts path */
  .all-concepts {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Bento-style category container using theme system */
  .category-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .concept-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.875rem;
    padding: 0;
  }

  .premium-nudge-overlay {
    position: fixed;
    bottom: 5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 100;
  }

  @container learn-tab (max-width: 620px) {
    .concept-list {
      grid-template-columns: minmax(0, 1fr);
    }

    .course-intro {
      align-items: stretch;
      flex-direction: column;
      gap: 1rem;
      padding: 0;
    }

    .read-guide-link {
      align-self: flex-start;
    }
  }

  @container learn-tab (min-width: 70rem) {
    .launch-zone {
      grid-template-columns: minmax(20rem, 0.78fr) minmax(34rem, 1.22fr);
      align-items: center;
    }

    .course-intro {
      align-items: flex-start;
      flex-direction: column;
    }

    .read-guide-link {
      align-self: flex-start;
    }

    .main-content {
      max-width: none;
      margin: 0;
    }
  }

  @container learn-tab (min-width: 1100px) {
    .concept-list {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container learn-tab (min-width: 1600px) {
    .concept-list {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container learn-tab (min-width: 1800px) {
    .concept-path {
      gap: clamp(1.25rem, 1.5cqw, 2rem);
      max-width: min(110rem, 92cqw);
      padding: clamp(2rem, 2.5cqw, 3rem);
    }

    .level-map-slot {
      width: 100%;
    }
  }
</style>
