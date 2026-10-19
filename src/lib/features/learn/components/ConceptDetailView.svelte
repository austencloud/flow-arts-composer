<!--
ConceptDetailView - Direct view of concept content
Supports two navigation modes:
- "step": Traditional step-by-step navigation (one page at a time)
- "scroll": All pages displayed vertically for scrolling (review mode, unlocked after completion)
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { getConceptProgressTracker } from "#lib/features/learn/get-concept-progress-tracker.js";
  import { onMount, untrack } from "svelte";
  import type {
    LearnConcept,
    ConceptProgress,
    ExperienceViewMode,
  } from "../domain/types";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    getConceptExperience,
    getLoadedConceptExperience,
    getNextConceptExperience,
    getPreviousConceptExperience,
    isConceptExperienceAvailable,
    loadConceptExperience,
    type ConceptExperienceComponent,
  } from "../domain/concept-experience-registry";
  import { getConceptById } from "../domain/concepts";
  import { getConceptPlaceIdForLesson } from "../domain/concept-place-registry";
  import {
    trackLessonCompleted,
    trackLessonStarted,
  } from "../services/learn-events";
  import ConceptTopicReading from "./ConceptTopicReading.svelte";
  import { claimedViewTransitionName } from "#lib/shared/transitions/claimed-view-transition-name.js";
  import {
    continueLessonWithMorph,
    isLessonMorphRunning,
    switchLessonViewWithMorph,
  } from "../services/lesson-open-morph.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import GridMergeAnimation from "./interactive/grid-merge/GridMergeAnimation.svelte";
  import {
    createLiveLessonBoard,
    provideLiveLessonBoard,
  } from "./interactive/live-board/live-lesson-board.svelte";

  let { concept, onClose, onContinue } = $props<{
    concept: LearnConcept;
    onClose?: () => void;
    onContinue?: (concept: LearnConcept, conceptPlaceId: string | null) => void;
  }>();

  const hapticService = getHapticFeedback();
  const conceptProgressService = getConceptProgressTracker();

  let progress = $state<ConceptProgress>({
    conceptId: "",
    status: "locked",
    percentComplete: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    totalAttempts: 0,
    accuracy: 0,
    currentStreak: 0,
    bestStreak: 0,
    timeSpentSeconds: 0,
  });

  // Navigation mode: step-by-step or scroll-through
  let viewMode = $state<ExperienceViewMode>("step");
  /** The lesson this one was reached from, by Continue or Previous. */
  let arrivedFrom = $state<string | null>(null);
  let readingOpen = $state(false);
  const hasInlineReading = $derived(
    concept.id === "grid" || concept.id === "hand-placements"
  );

  // Check if concept is completed (enables scroll mode)
  let isCompleted = $derived(progress.status === "completed");
  const experience = $derived(getConceptExperience(concept.id));

  // One grid for every lesson opened in this view. Continue swaps the lesson
  // around it, so the grid the learner was looking at becomes the next one's.
  const liveBoard = createLiveLessonBoard();
  provideLiveLessonBoard(liveBoard);

  // A lesson that already loaded renders in the same frame, so Continue has
  // no loading gap. The next lesson loads while this one is being learned.
  let loadedExperience = $state<{
    conceptId: string;
    component: ConceptExperienceComponent;
  } | null>(null);
  const Experience = $derived.by(() => {
    const loaded = loadedExperience;
    if (loaded && loaded.conceptId === concept.id) return loaded.component;
    return getLoadedConceptExperience(concept.id);
  });
  $effect(() => {
    const conceptId = concept.id;
    let current = true;
    void loadConceptExperience(conceptId)
      .then((component) => {
        if (!current) return;
        if (component) loadedExperience = { conceptId, component };
        // Warm both neighbours, so Continue and Previous morph right away.
        const neighbours = [
          getNextConceptExperience(conceptId),
          getPreviousConceptExperience(conceptId),
        ].filter((entry) => entry !== undefined);
        return Promise.all(
          neighbours.map((entry) => loadConceptExperience(entry.conceptId))
        );
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  });

  // Continue keeps this view mounted, so each newly opened lesson starts from
  // its own first view and is recorded as started here.
  let startedConceptId: string | null = null;
  $effect(() => {
    const conceptId = concept.id;
    untrack(() => {
      progress = conceptProgressService.getConceptProgress(conceptId);
      if (startedConceptId === conceptId) return;
      startedConceptId = conceptId;
      viewMode = "step";
      readingOpen = false;
      trackLessonStarted(conceptId, progress.status);
      if (
        progress.status === "available" ||
        progress.status === "in-progress"
      ) {
        conceptProgressService.startConcept(conceptId);
      }
    });
  });

  function toggleViewMode() {
    hapticService?.trigger("selection");
    const next = viewMode === "step" ? "scroll" : "step";
    // The lesson's heading and board carry into the review and back.
    switchLessonViewWithMorph(() => (viewMode = next));
  }

  onMount(() => {
    // Subscribe to progress updates
    const unsubscribe = conceptProgressService.subscribe(() => {
      progress = conceptProgressService.getConceptProgress(concept.id);
    });

    return unsubscribe;
  });

  function handleClose() {
    hapticService?.trigger("selection");
    onClose?.();
  }

  function handleBackButton() {
    handleClose();
  }

  function handlePracticeComplete(nextConceptId?: string) {
    // Mark the concept as completed when the experience is finished
    // This explicitly completes rather than just recording one practice attempt
    conceptProgressService.completeConcept(concept.id);
    trackLessonCompleted(concept.id);

    const nextConcept = nextConceptId
      ? getConceptById(nextConceptId)
      : undefined;
    if (
      nextConcept &&
      isConceptExperienceAvailable(nextConcept.id) &&
      onContinue
    ) {
      moveTo(nextConcept);
      return;
    }

    // After completing, go back to concept list
    handleClose();
  }

  /** Continue and Previous both keep this view and its board. */
  function moveTo(next: LearnConcept) {
    liveBoard.capture();
    // The next lesson starts at its top, the way a new page would. On a phone
    // Continue sits below the board, so keeping the scroll would land the
    // board off screen. The flight starts from the captured spot on screen.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: "instant" });
    const from = concept.id;
    // The heading and controls turn into the next lesson's (lesson-open-morph).
    continueLessonWithMorph(next.id, () => {
      // Set before the lesson changes, so the next one mounts knowing it.
      arrivedFrom = from;
      onContinue?.(next, getConceptPlaceIdForLesson(next.id));
    });
  }

  function handlePrevious(conceptId: string) {
    const previous = getConceptById(conceptId);
    if (previous && isConceptExperienceAvailable(previous.id) && onContinue) {
      hapticService?.trigger("selection");
      moveTo(previous);
      return;
    }
    handleClose();
  }
</script>

<!-- The course-map card grows into this surface, and back (lesson-open-morph). -->
<div
  class="concept-detail"
  use:claimedViewTransitionName={{
    name: "learn-lesson-surface",
    enabled: isLessonMorphRunning(),
  }}
>
  <!-- Header bar with back button and mode toggle -->
  <div class="header-bar">
    <button
      class="back-button"
      onclick={handleBackButton}
      aria-label={t("learn_go_back")}
    >
      <i class="fa-solid fa-chevron-left back-icon" aria-hidden="true"></i>
      <span class="back-text">{t("learn_back")}</span>
    </button>

    <div class="header-actions">
      {#if experience}
        {#if hasInlineReading}
          <button
            class="reference-link"
            onclick={() => (readingOpen = true)}
            aria-label={t("learn_ui_read_topic")}
          >
            <i class="fa-solid fa-book-open" aria-hidden="true"></i>
            <span>{t("learn_ui_read_topic")}</span>
          </button>
        {:else}
          <a
            class="reference-link"
            href={experience.reference?.href ??
              `/guide/level-1/${experience.guideSlug}`}
            aria-label={experience.reference
              ? t("learn_ui_read_reference", {
                  name: tDynamic(
                    `learn_reference_${concept.id.replaceAll("-", "_")}`
                  ),
                })
              : t("learn_ui_read_in_guide", {
                  name: tDynamic(
                    `learn_reference_${concept.id.replaceAll("-", "_")}`
                  ),
                })}
          >
            <i class="fa-solid fa-book-open" aria-hidden="true"></i>
            <span>{t("learn_ui_read_topic")}</span>
          </a>
        {/if}
      {/if}

      <!-- Review mode is earned after completing an interactive lesson. -->
      {#if isCompleted && experience}
        <button
          class="mode-toggle"
          onclick={toggleViewMode}
          aria-label={viewMode === "step"
            ? t("learn_switch_to_scroll")
            : t("learn_switch_to_step")}
          title={viewMode === "step"
            ? t("learn_switch_to_scroll")
            : t("learn_switch_to_step")}
        >
          {#snippet face(mode: ExperienceViewMode)}
            {#if mode === "step"}
              <i class="fa-solid fa-scroll" aria-hidden="true"></i>
              <span class="mode-label">{t("learn_review")}</span>
            {:else}
              <i class="fa-solid fa-stairs" aria-hidden="true"></i>
              <span class="mode-label">{t("learn_steps")}</span>
            {/if}
          {/snippet}
          <!-- Both faces size the button, so swapping them moves nothing. -->
          <span class="mode-face">
            <span class="mode-sizer" aria-hidden="true"
              >{@render face("step")}</span
            >
            <span class="mode-sizer" aria-hidden="true"
              >{@render face("scroll")}</span
            >
            <Crossfade key={viewMode}>
              <span class="mode-current">{@render face(viewMode)}</span>
            </Crossfade>
          </span>
        </button>
      {/if}
    </div>
  </div>

  <!-- The live board waits here between lessons; a lesson's slot borrows it. -->
  <div class="live-board-home" aria-hidden="true">
    <div class="live-board" {@attach (node) => liveBoard.attach(node)}>
      <GridMergeAnimation
        phase={liveBoard.scene.phase}
        highlightPhase={liveBoard.scene.highlightPhase}
        look={liveBoard.scene.look}
      />
    </div>
  </div>

  <!-- Content - key block forces full remount when concept changes -->
  <div class="concept-detail-content">
    {#key `${concept.id}-${viewMode}`}
      {#if experience}
        {#if Experience}
          <Experience
            {viewMode}
            {readingOpen}
            {arrivedFrom}
            onComplete={handlePracticeComplete}
            onPrevious={onContinue ? handlePrevious : undefined}
            onBack={handleClose}
          />
        {:else}
          <div class="lesson-loading" role="status">
            {t("learn_ui_loading_lesson")}
          </div>
        {/if}
      {:else}
        <!-- Coming Soon placeholder -->
        <div class="coming-soon">
          <span class="coming-soon-icon">🚧</span>
          <h2 class="coming-soon-title">{t("learn_coming_soon_title")}</h2>
          <p class="coming-soon-text">
            {t("learn_coming_soon_desc")}
          </p>
        </div>
      {/if}
    {/key}
  </div>
  {#if hasInlineReading}
    <ConceptTopicReading conceptId={concept.id} bind:open={readingOpen} />
  {/if}
</div>

<style>
  .concept-detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    /* BackgroundHost owns the application atmosphere. Concept lessons should
       float above it on theme surfaces instead of replacing it with black. */
    background: transparent;
    color: var(--theme-text, var(--foreground, #ffffff));
  }

  .header-bar {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 100;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    pointer-events: none;
  }

  .header-bar > * {
    pointer-events: auto;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .back-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal) var(--ease-out),
      transform var(--duration-normal) var(--ease-out);
  }

  .back-button:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-stroke-strong));
    transform: translateX(-2px);
  }

  /* An icon, not the "‹" glyph: the glyph sat high of the text's middle. */
  .back-icon {
    font-size: 0.75rem;
    line-height: 1;
  }

  .back-text {
    line-height: 1;
  }

  .reference-link,
  .mode-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    transition:
      background var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal) var(--ease-out),
      color var(--duration-normal) var(--ease-out);
  }

  .reference-link:hover,
  .mode-toggle:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-accent);
  }

  .reference-link i,
  .mode-toggle i {
    font-size: 1rem;
    color: var(--theme-accent);
  }

  .mode-label {
    font-size: 0.8125rem;
  }

  .mode-face {
    display: grid;
    justify-items: center;
  }

  .mode-face > :global(*) {
    grid-area: 1 / 1;
  }

  .mode-sizer {
    visibility: hidden;
  }

  .mode-sizer,
  .mode-current {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .concept-detail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .live-board-home {
    display: none;
  }

  /* The board fills whichever lesson slot holds it. These rules travel with
     the element, including while it flies above the page between lessons. */
  .live-board {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .live-board :global(.grid-merge-container) {
    width: 100%;
    height: 100%;
  }

  .live-board :global(.merge-svg) {
    width: 100%;
    height: 100%;
    max-width: none !important;
  }

  .lesson-loading {
    display: grid;
    place-items: center;
    min-height: 100%;
    color: var(--theme-text-dim);
    font-size: 1rem;
  }

  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    text-align: center;
    height: 100%;
  }

  .coming-soon-icon {
    font-size: 4rem;
  }

  .coming-soon-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text);
    margin: 0;
  }

  .coming-soon-text {
    font-size: 1rem;
    color: var(--theme-text-dim);
    margin: 0;
  }

  @media (max-width: 768px) {
    .header-bar {
      padding: 0.5rem;
    }

    .back-button {
      padding: 0.375rem 0.75rem;
    }

    .mode-toggle {
      padding: 0.375rem 0.75rem;
    }

    .reference-link {
      min-width: var(--min-touch-target, 44px);
      min-height: var(--min-touch-target, 44px);
      justify-content: center;
      padding: 0.375rem 0.75rem;
    }

    .mode-label {
      display: none;
    }
  }
</style>
