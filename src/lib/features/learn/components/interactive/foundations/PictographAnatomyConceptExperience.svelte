<script lang="ts">
  import { onMount } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getCodexLetterMappingRepo } from "$lib/features/learn/codex/get-codex-letter-mapping-repo";
  import ArtifactRegionSpotlight from "$lib/shared/components/ArtifactRegionSpotlight.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
  import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import { derivePropElementalType } from "$lib/shared/shape-matrix/domain/prop-relationship";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: () => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  type Region = {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  const STEPS = [
    {
      text: "A pictograph shows one step of motion.",
      label: "Whole pictograph",
      region: null,
    },
    {
      text: "Top left: the step number.",
      label: "Step number",
      region: { x: 0, y: 0, width: 25, height: 24 },
    },
    {
      text: "Top center: where the hands start and end.",
      label: "Start and end",
      region: { x: 27, y: 0, width: 46, height: 24 },
    },
    {
      text: "Bottom left: the TKA letter and its turns.",
      label: "Letter and turns",
      region: { x: 0, y: 68, width: 38, height: 32 },
    },
    {
      text: "Bottom right: the hands’ time and direction.",
      label: "Hand time and direction",
      region: { x: 67, y: 68, width: 33, height: 32 },
    },
    {
      text: "Top right: the props’ time and direction.",
      label: "Prop time and direction",
      region: { x: 68, y: 0, width: 32, height: 28 },
    },
    {
      text: "In the middle: the props and the paths your hands follow.",
      label: "Props and hand paths",
      region: { x: 16, y: 18, width: 68, height: 66 },
    },
  ] as const satisfies readonly {
    text: string;
    label: string;
    region: Region | null;
  }[];

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("letter-codex-intro");
  const saved = persistence.load();
  let stepIndex = $state(
    Math.min(STEPS.length - 1, Math.max(0, (saved.step || 1) - 1))
  );
  let direction = $state<-1 | 1>(1);
  let pictograph = $state<PictographData | null>(null);
  let loading = $state(true);
  let error = $state(false);
  const current = $derived(STEPS[stepIndex]!);
  const anatomyStep = $derived(
    pictograph ? createStepData({ ...pictograph, stepNumber: 1 }) : null
  );
  const propElementalType = $derived.by(() => {
    if (!anatomyStep) return null;
    return derivePropElementalType(
      createSequenceData({
        id: "learn-pictograph-anatomy",
        name: "Pictograph anatomy",
        word: "A",
        steps: [anatomyStep],
        gridMode: GridMode.DIAMOND,
      })
    );
  });

  onMount(async () => {
    loading = true;
    error = false;
    try {
      getCodexLetterMappingRepo();
      pictograph = await letterQueryHandler.getPictographByLetter(
        Letter.A,
        GridMode.DIAMOND
      );
      error = pictograph === null;
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  });

  function goToStep(next: number): void {
    const clamped = Math.min(STEPS.length - 1, Math.max(0, next));
    if (clamped === stepIndex) return;
    direction = clamped > stepIndex ? 1 : -1;
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
      if (stepIndex === STEPS.length - 1) complete();
      else goToStep(stepIndex + 1);
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
  aria-label="Pictograph anatomy lesson, use arrow keys to navigate"
>
  <main class="lesson-shell">
    <section
      class="anatomy-studio"
      aria-label={`Pictograph anatomy: ${current.label}`}
    >
      <div class="anatomy-step">
        <div class="instruction-rail">
          <div class="instruction-meta">
            <span>Pictograph anatomy</span>
            <span>Step {stepIndex + 1} of {STEPS.length}</span>
          </div>
          <div class="instruction-story" aria-live="polite">
            <Crossfade key={stepIndex} mode="swap" motion="step" {direction}>
              <div class="instruction-copy">
                <h1>{current.label}</h1>
                <p>{current.text}</p>
              </div>
            </Crossfade>
          </div>
          <span class="rail-pointer" aria-hidden="true">
            <i class="fa-solid fa-arrow-right"></i>
          </span>
        </div>

        <div class="artifact-stage">
          <div class="pictograph-frame">
            {#if loading}
              <div class="load-state" role="status">
                <ProgressRing percent={-1} size={40} strokeWidth={3} />
                <span>Loading pictograph…</span>
              </div>
            {:else if error || !anatomyStep}
              <div class="load-state" role="alert">
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"
                ></i>
                <span>Pictograph unavailable</span>
              </div>
            {:else}
              <PictographContainer
                pictographData={anatomyStep}
                gridMode={GridMode.DIAMOND}
                leftPropTypeOverride={PropType.STAFF}
                rightPropTypeOverride={PropType.STAFF}
                showGrid
                showTKA
                showPlacements
                showElemental
                showTnD={false}
                showReversals={false}
                showNonRadialPoints={false}
                showHandPoints
                stepNumberOverride
                {propElementalType}
                showPropTnD={propElementalType !== null}
              />
              {#if current.region}
                <ArtifactRegionSpotlight
                  x={current.region.x}
                  y={current.region.y}
                  width={current.region.width}
                  height={current.region.height}
                />
              {/if}
            {/if}
          </div>
        </div>
      </div>

      <footer class="lesson-transport">
        <LessonStageControls
          label={stepIndex === STEPS.length - 1 ? "Finish lesson" : "Next"}
          currentStep={stepIndex + 1}
          totalSteps={STEPS.length}
          onAction={stepIndex === STEPS.length - 1
            ? complete
            : () => goToStep(stepIndex + 1)}
          onPrevious={handleBack}
          previousDisabled={stepIndex === 0}
          actionIcon={stepIndex === STEPS.length - 1 ? "check" : "arrow"}
        />
      </footer>
    </section>
  </main>
</div>

<style>
  .experience {
    container: pictograph-anatomy / inline-size;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    color: var(--theme-text);
    outline: none;
    scrollbar-gutter: stable;
  }

  .lesson-shell {
    display: grid;
    place-items: start center;
    width: min(100%, 126rem);
    min-height: 100%;
    margin-inline: auto;
    padding: clamp(4.5rem, 5cqw, 5.5rem) clamp(0.75rem, 2.2cqw, 2.5rem)
      clamp(0.75rem, 1.5cqw, 1.5rem);
  }

  .anatomy-studio {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    width: 100%;
    min-height: min(52rem, calc(100dvh - 8rem));
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: color-mix(in srgb, var(--theme-panel-bg) 86%, transparent);
    backdrop-filter: blur(1.5rem) saturate(1.08);
    box-shadow: 0 1.5rem 4rem color-mix(in srgb, black 22%, transparent);
  }

  .anatomy-step {
    display: grid;
    grid-template-columns: minmax(20rem, 28rem) minmax(0, 1fr);
    min-height: 0;
  }

  .instruction-rail {
    position: relative;
    display: grid;
    align-content: center;
    gap: clamp(1.25rem, 1.7cqw, 1.75rem);
    min-width: 0;
    padding: clamp(1.5rem, 2.25cqw, 2.5rem);
    border-right: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 78%, transparent);
  }

  .instruction-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    font-weight: 650;
  }

  .instruction-meta > :first-child {
    color: var(--theme-text);
  }

  .instruction-story {
    display: grid;
    min-height: 12rem;
    align-content: center;
  }

  .instruction-copy {
    display: grid;
    gap: 1rem;
  }

  h1 {
    margin: 0 !important;
    max-width: 11ch;
    font-size: clamp(2rem, 2.65cqw, 3.25rem);
    line-height: 1;
    text-wrap: balance;
  }

  .instruction-copy p {
    max-width: 31ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: clamp(1rem, 1.2cqw, 1.2rem);
    line-height: 1.6;
  }

  .rail-pointer {
    position: absolute;
    top: 50%;
    right: -1.15rem;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 2.3rem;
    height: 2.3rem;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 50%;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    transform: translateY(-50%);
  }

  .artifact-stage {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    padding: clamp(1rem, 2cqw, 2.25rem);
    background: color-mix(in srgb, var(--theme-panel-bg) 88%, transparent);
  }

  .pictograph-frame {
    position: relative;
    width: min(100%, 50rem, 72dvh);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg);
    box-shadow: 0 1.25rem 3.5rem color-mix(in srgb, black 34%, transparent);
  }

  .load-state {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.8rem;
    width: 100%;
    height: 100%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 0.875rem);
  }
  .load-state i {
    color: var(--semantic-error);
    font-size: 1.5rem;
  }

  .lesson-transport {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-card-bg) 82%, transparent);
  }

  @container pictograph-anatomy (max-width: 760px) {
    .lesson-shell {
      padding-top: 3.9rem;
    }

    .anatomy-studio {
      min-height: auto;
    }

    .anatomy-step {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
    }

    .instruction-rail {
      gap: 0.75rem;
      min-height: 10rem;
      padding: 1rem;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke);
    }

    .instruction-story {
      min-height: 6rem;
    }

    .instruction-copy {
      gap: 0.55rem;
    }

    .instruction-copy p {
      max-width: 46ch;
      line-height: 1.45;
    }

    .rail-pointer {
      top: auto;
      right: 50%;
      bottom: -1.15rem;
      transform: translateX(50%);
    }

    .rail-pointer i {
      transform: rotate(90deg);
    }

    .artifact-stage {
      min-height: min(56dvh, 28rem);
      padding: 0.75rem;
    }

    .pictograph-frame {
      width: min(100%, 24rem, 50dvh);
    }
  }

  @container pictograph-anatomy (min-width: 1680px) {
    .lesson-shell {
      width: min(100%, 150rem);
    }

    .anatomy-step {
      grid-template-columns: minmax(24rem, 31rem) minmax(0, 1fr);
    }

    .pictograph-frame {
      width: min(100%, 58rem, 72dvh);
    }
  }

  @container pictograph-anatomy (min-width: 2600px) {
    .lesson-shell {
      width: min(100%, 220rem);
    }

    .anatomy-step {
      grid-template-columns: minmax(27rem, 36rem) minmax(0, 1fr);
    }

    .pictograph-frame {
      width: min(100%, 78rem, 72dvh);
    }

    .instruction-meta {
      font-size: 1rem;
    }

    h1 {
      font-size: 4rem;
    }

    .instruction-copy p {
      font-size: 1.4rem;
    }

    .instruction-rail {
      padding-inline: 3rem;
    }

    .rail-pointer {
      right: -1.5rem;
      width: 3rem;
      height: 3rem;
    }
  }

  @media (max-height: 620px) and (min-width: 761px) {
    .lesson-shell {
      padding-top: 3.9rem;
      padding-bottom: 0.5rem;
    }

    .anatomy-studio {
      min-height: calc(100dvh - 4.4rem);
    }

    .anatomy-step {
      grid-template-columns: minmax(15rem, 22rem) minmax(0, 1fr);
    }

    .instruction-rail {
      gap: 0.7rem;
      padding: 0.9rem 1.1rem;
    }

    .instruction-story {
      min-height: 7rem;
    }

    h1 {
      font-size: clamp(1.65rem, 2.5cqw, 2.35rem);
    }

    .pictograph-frame {
      width: min(100%, 31rem, 55dvh);
    }

    .lesson-transport {
      padding-block: 0.45rem;
    }
  }
</style>
