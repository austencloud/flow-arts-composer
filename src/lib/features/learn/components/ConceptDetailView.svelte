<!--
ConceptDetailView - Direct view of concept content
Supports two navigation modes:
- "step": Traditional step-by-step navigation (one page at a time)
- "scroll": All pages displayed vertically for scrolling (review mode, unlocked after completion)
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { getConceptProgressTracker } from "$lib/features/learn/get-concept-progress-tracker";
  import { onMount } from "svelte";
  import type {
    LearnConcept,
    ConceptProgress,
    ExperienceViewMode,
  } from "../domain/types";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    getConceptExperience,
    isConceptExperienceAvailable,
  } from "../domain/concept-experience-registry";
  import { getConceptById } from "../domain/concepts";
  import { getConceptPlaceIdForLesson } from "../domain/concept-place-registry";
  import {
    trackLessonCompleted,
    trackLessonStarted,
  } from "../services/learn-events";

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

  // Check if concept is completed (enables scroll mode)
  let isCompleted = $derived(progress.status === "completed");
  const experience = $derived(getConceptExperience(concept.id));

  // Sync progress when concept changes
  $effect(() => {
    progress = conceptProgressService.getConceptProgress(concept.id);
  });

  // Reference to the current experience component for back navigation
  let experienceComponent: unknown = $state(null);

  function hasBackHandler(value: unknown): value is { handleBack: () => void } {
    return (
      typeof value === "object" &&
      value !== null &&
      "handleBack" in value &&
      typeof value.handleBack === "function"
    );
  }

  function toggleViewMode() {
    hapticService?.trigger("selection");
    viewMode = viewMode === "step" ? "scroll" : "step";
  }

  // Start the concept when detail view opens
  onMount(() => {
    trackLessonStarted(concept.id, progress.status);
    if (progress.status === "available") {
      conceptProgressService.startConcept(concept.id);
    }

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
    hapticService?.trigger("selection");
    // Try to navigate back within the experience first
    if (hasBackHandler(experienceComponent)) {
      experienceComponent.handleBack();
    } else {
      // No experience or no back handler, just close
      onClose?.();
    }
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
      onContinue(nextConcept, getConceptPlaceIdForLesson(nextConcept.id));
      return;
    }

    // After completing, go back to concept list
    handleClose();
  }
</script>

<div class="concept-detail">
  <!-- Header bar with back button and mode toggle -->
  <div class="header-bar">
    <button
      class="back-button"
      onclick={handleBackButton}
      aria-label={t("learn_go_back")}
    >
      <span class="back-icon">‹</span>
      <span class="back-text">{t("learn_back")}</span>
    </button>

    <div class="header-actions">
      {#if experience}
        <a
          class="reference-link"
          href={experience.reference?.href ??
            `/guide/level-1/${experience.guideSlug}`}
          aria-label={experience.reference
            ? t("learn_ui_read_reference", { name: experience.reference.label })
            : t("learn_ui_read_in_guide", { name: experience.guideLabel })}
        >
          <i class="fa-solid fa-book-open" aria-hidden="true"></i>
          <span>{t("learn_ui_read_topic")}</span>
        </a>
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
          {#if viewMode === "step"}
            <i class="fa-solid fa-scroll" aria-hidden="true"></i>
            <span class="mode-label">{t("learn_review")}</span>
          {:else}
            <i class="fa-solid fa-stairs" aria-hidden="true"></i>
            <span class="mode-label">{t("learn_steps")}</span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Content - key block forces full remount when concept changes -->
  <div class="concept-detail-content">
    {#key `${concept.id}-${viewMode}`}
      {#if experience}
        {#await experience.load()}
          <div class="lesson-loading" role="status">
            {t("learn_ui_loading_lesson")}
          </div>
        {:then loaded}
          {@const Experience = loaded.default}
          <Experience
            bind:this={experienceComponent}
            {viewMode}
            onComplete={handlePracticeComplete}
            onBack={handleClose}
          />
        {/await}
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
    gap: 0.25rem;
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

  .back-icon {
    font-size: 1.5rem;
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

  .concept-detail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
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

    .reference-link span,
    .mode-label {
      display: none;
    }
  }
</style>
