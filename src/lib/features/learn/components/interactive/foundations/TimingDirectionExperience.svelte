<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import ExperienceProgressIndicator from "../ExperienceProgressIndicator.svelte";
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
  let stepIndex = $state(
    Math.min(summaryIndex, Math.max(0, (saved.step || 1) - 1))
  );
  const activeMode = $derived(modes[stepIndex] ?? null);

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
  class="experience"
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_named_lesson_keyboard", { title })}
>
  <main class="lesson-shell">
    {#if activeMode}
      <section
        class="mode-step"
        style:--mode-accent={activeMode.element.accentColor}
        aria-labelledby="mode-title"
      >
        <div class="instruction-rail">
          <p class="eyebrow">{t("learn_ui_hand_time_direction")}</p>
          <div class="mode-heading">
            <img src={activeMode.element.iconPath} alt="" />
            <h1 id="mode-title">{activeMode.name}</h1>
          </div>

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

          <div class="step-count">
            {stepIndex + 1} of {modes.length}
          </div>
        </div>

        <div class="artifact-stage">
          <HandMotionPlayer
            sequence={activeMode.sequence}
            ariaLabel={`${activeMode.name}: ${activeMode.timing} time and ${activeMode.direction.toLowerCase()} hand-path direction`}
          />
        </div>
      </section>
    {:else}
      <section class="summary" aria-labelledby="mode-summary-title">
        <p class="eyebrow">{t("learn_ui_complete")}</p>
        <h1 id="mode-summary-title">{title}</h1>
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
      </section>
    {/if}

    <footer class="lesson-actions">
      <PanelButton
        variant="secondary"
        onclick={handleBack}
        disabled={stepIndex === 0}
      >
        <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
        <span>{t("learn_ui_previous")}</span>
      </PanelButton>
      <ExperienceProgressIndicator
        currentStep={stepIndex + 1}
        totalSteps={summaryIndex + 1}
      />
      {#if stepIndex === summaryIndex}
        <PanelButton variant="primary" onclick={complete}>
          <span>{t("learn_ui_finish_lesson")}</span>
          <i class="fa-solid fa-check" aria-hidden="true"></i>
        </PanelButton>
      {:else}
        <PanelButton variant="primary" onclick={() => goToStep(stepIndex + 1)}>
          <span>{t("learn_ui_next")}</span>
          <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
        </PanelButton>
      {/if}
    </footer>
  </main>
</div>

<style>
  .experience {
    container: timing-direction / inline-size;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    color: var(--theme-text);
    outline: none;
    scrollbar-gutter: stable;
  }

  .lesson-shell {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 1rem;
    width: min(100%, 108rem);
    min-height: 100%;
    margin-inline: auto;
    padding: clamp(4.5rem, 5cqw, 5.5rem) clamp(0.75rem, 2.5cqw, 2.5rem)
      clamp(0.75rem, 1.5cqw, 1.5rem);
  }

  .mode-step {
    display: grid;
    grid-template-columns: minmax(15rem, 22rem) minmax(0, 1fr);
    align-items: center;
    gap: clamp(1rem, 2.2cqw, 2.5rem);
    width: 100%;
    min-height: 0;
  }

  .instruction-rail {
    display: grid;
    align-content: center;
    gap: 1.25rem;
    min-width: 0;
    padding: clamp(1rem, 1.6cqw, 1.6rem);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: color-mix(
      in srgb,
      var(--mode-accent) 10%,
      var(--theme-panel-bg)
    );
  }

  .eyebrow {
    margin: 0;
    color: var(--theme-accent);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .mode-heading {
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .mode-heading img {
    width: 2rem;
    height: 2rem;
    object-fit: contain;
  }

  h1 {
    margin: 0 !important;
    font-size: clamp(1.7rem, 2.6cqw, 2.8rem);
    line-height: 1.05;
    text-wrap: balance;
  }

  .mode-properties {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
    margin: 0;
  }

  .mode-properties > div {
    display: grid;
    gap: 0.25rem;
    min-height: 4.75rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg);
  }

  dt {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-transform: uppercase;
  }

  dd {
    margin: 0;
    font-size: var(--font-size-base, 1rem);
    font-weight: 800;
  }

  .step-count {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  .artifact-stage {
    min-width: 0;
    height: clamp(24rem, 68dvh, 48rem);
    min-height: 0;
  }

  .summary {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 1rem;
    width: min(100%, 64rem);
    margin-inline: auto;
    text-align: center;
  }

  .mode-recap {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
    width: 100%;
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

  .lesson-actions {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 0.75rem;
  }

  .lesson-actions > :global(:first-child) {
    justify-self: start;
  }

  .lesson-actions > :global(:last-child) {
    justify-self: end;
  }

  @container timing-direction (max-width: 760px) {
    .lesson-shell {
      gap: 0.65rem;
      padding-top: 3.9rem;
    }

    .mode-step {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
      gap: 0.65rem;
    }

    .instruction-rail {
      grid-template-columns: minmax(0, 1fr) auto;
      align-content: start;
      gap: 0.4rem 0.75rem;
      padding: 0.65rem 0.75rem;
    }

    .instruction-rail .eyebrow,
    .mode-properties {
      grid-column: 1 / -1;
    }

    .mode-properties {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .step-count {
      align-self: center;
    }

    .artifact-stage {
      height: min(36dvh, 17rem);
      min-height: 0;
    }

    .lesson-actions {
      grid-template-columns: 1fr 1fr;
    }

    .lesson-actions :global(.progress-indicator) {
      grid-column: 1 / -1;
      grid-row: 2;
      justify-self: center;
    }

    .lesson-actions :global(.panel-btn) {
      width: 100%;
    }
  }

  @container timing-direction (max-width: 440px) {
    .mode-recap {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @container timing-direction (min-width: 1680px) {
    .lesson-shell {
      width: min(100%, 142rem);
    }

    .mode-step {
      grid-template-columns: minmax(18rem, 28rem) minmax(0, 1fr);
    }
  }

  @container timing-direction (min-width: 2600px) {
    .lesson-shell {
      width: min(100%, 190rem);
    }

    .mode-step {
      grid-template-columns: minmax(24rem, 34rem) minmax(0, 1fr);
    }

    .artifact-stage {
      height: clamp(36rem, 58dvh, 64rem);
    }
  }

  @media (max-height: 620px) and (min-width: 761px) {
    .lesson-shell {
      padding-top: 4rem;
    }

    .mode-step {
      grid-template-columns: minmax(13rem, 19rem) minmax(0, 1fr);
    }

    .instruction-rail {
      gap: 0.65rem;
      padding: 0.75rem;
    }

    .artifact-stage {
      height: min(55dvh, 14rem);
      min-height: 0;
    }
  }
</style>
