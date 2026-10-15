<!--
  The template behind Dual-Shifts and Gamma Motions, on the shared lesson
  shell: one mode per step with its player on the stage, then a recap of all
  the modes. The shell's progress is the only step counter.
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";
  import HandMotionPlayer from "./HandMotionPlayer.svelte";
  import type { TimingDirectionMode } from "./pictograph-foundation-content";

  let {
    conceptId,
    title,
    modes,
    onComplete,
    onBack,
    viewMode = "step",
  }: {
    conceptId: string;
    title: string;
    modes: readonly TimingDirectionMode[];
    onComplete?: () => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  } = $props();

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence(conceptId);
  const saved = persistence.load();
  const summaryIndex = modes.length;
  const curriculumLabel = $derived(tDynamic("learn_ui_level_one"));
  let stepIndex = $state(
    Math.min(summaryIndex, Math.max(0, (saved.step || 1) - 1))
  );
  const activeMode = $derived(modes[stepIndex] ?? null);
  const isSummary = $derived(stepIndex === summaryIndex);

  function goToStep(next: number): void {
    const clamped = Math.min(summaryIndex, Math.max(0, next));
    if (clamped === stepIndex) return;
    stepIndex = clamped;
    persistence.saveStep(stepIndex + 1);
    haptic?.trigger("selection");
  }

  function complete(): void {
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.();
  }

  function handlePrimaryAction(): void {
    if (isSummary) complete();
    else goToStep(stepIndex + 1);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step") return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      goToStep(stepIndex + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  export function handleBack(): void {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
      return;
    }
    onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="timing-experience"
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_named_lesson_keyboard", { title })}
>
  <LessonStageFrame artifactLayout="wide">
    {#snippet heading()}
      <LessonStageHeading
        key={stepIndex}
        title={activeMode ? activeMode.name : t("learn_ui_complete")}
        eyebrow={title}
      >
        {#if activeMode}
          <dl class="mode-properties">
            <div>
              <dt>{t("learn_ui_time")}</dt>
              <dd>{activeMode.timing}</dd>
            </div>
            <div>
              <dt>{t("learn_ui_direction")}</dt>
              <dd>{activeMode.direction}</dd>
            </div>
          </dl>
        {/if}
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <Crossfade key={isSummary ? "summary" : "mode"} duration={DURATION.normal} fill>
        {#if activeMode}
          <div
            class="artifact-stage"
            style:--mode-accent={activeMode.element.accentColor}
          >
            <HandMotionPlayer
              sequence={activeMode.sequence}
              ariaLabel={`${activeMode.name}: ${activeMode.timing} time and ${activeMode.direction.toLowerCase()} hand-path direction`}
            />
          </div>
        {:else}
          <div class="mode-recap">
            {#each modes as mode, index (mode.id)}
              <button
                type="button"
                class="recap-button"
                style:--mode-accent={mode.element.accentColor}
                onclick={() => goToStep(index)}
              >
                <img src={mode.element.iconPath} alt="" />
                <span>{mode.name}</span>
                <small>{mode.timing} · {mode.direction}</small>
              </button>
            {/each}
          </div>
        {/if}
      </Crossfade>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={isSummary ? t("learn_ui_finish_lesson") : t("learn_ui_next")}
        currentStep={stepIndex + 1}
        totalSteps={summaryIndex + 1}
        onAction={handlePrimaryAction}
        onPrevious={handleBack}
        previousDisabled={stepIndex === 0}
        actionIcon={isSummary ? "check" : "arrow"}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .timing-experience {
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--theme-text);
    outline: none;
  }

  .mode-properties {
    display: inline-flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem 1.5rem;
    margin: 0;
  }

  .mode-properties > div {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  dt {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    color: var(--theme-text);
    font-weight: 800;
  }

  .artifact-stage {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .mode-recap {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
  }

  .recap-button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.2rem 0.75rem;
    min-height: 5.5rem;
    padding: 0.85rem 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: color-mix(in srgb, var(--mode-accent) 9%, var(--theme-card-bg));
    color: var(--theme-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .recap-button:hover,
  .recap-button:focus-visible {
    border-color: var(--theme-stroke-strong);
    background: color-mix(
      in srgb,
      var(--mode-accent) 16%,
      var(--theme-card-bg)
    );
  }

  .recap-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .recap-button img {
    grid-row: 1 / 3;
    width: 1.7rem;
    height: 1.7rem;
  }

  .recap-button span {
    font-weight: 800;
  }

  .recap-button small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }

  @media (max-width: 440px) {
    .mode-recap {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
