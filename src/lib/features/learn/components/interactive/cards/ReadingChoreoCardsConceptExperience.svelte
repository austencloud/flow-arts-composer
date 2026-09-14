<script lang="ts">
  import { tick } from "svelte";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { getHandPathReferenceCards } from "$lib/features/choreo-card/domain/hand-path-reference-cards";
  import { HAND_PATH_REFERENCE_SCAN_URLS } from "$lib/features/choreo-card/domain/hand-path-reference-card-manifest";
  import CardAnatomyExplainer from "$lib/features/store/components/CardAnatomyExplainer.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type { ExperienceViewMode } from "../../../domain/types";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";
  import LessonStageControls from "../LessonStageControls.svelte";
  import LessonStageFrame from "../LessonStageFrame.svelte";
  import LessonStageHeading from "../LessonStageHeading.svelte";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  const cards = getHandPathReferenceCards();
  let cardId = $state(cards[0]!.id);
  const card = $derived(cards.find((candidate) => candidate.id === cardId)!);
  const cardOptions = cards.map((candidate) => ({
    value: candidate.id,
    label: candidate.name,
    ariaLabel: `${candidate.name}, ${candidate.timing} time, ${candidate.direction.toLowerCase()} direction`,
  }));
  const steps = [
    {
      region: "start",
      title: "Start with the start position",
      text: "This first cell shows where both hands begin. The sequence returns here after its last step.",
    },
    {
      region: "steps",
      title: "Read the steps in order",
      text: "Each numbered picture is one hand-path step. Follow them from 1 to 4.",
    },
    {
      region: "qr",
      title: "Scan to watch it move",
      text: "The QR code opens this hand path in the player.",
    },
  ] as const;

  const haptic = getHapticFeedback();
  const persistence = getExperiencePersistence("reading-choreo-cards");
  const saved = persistence.load();
  let stepIndex = $state(
    Math.min(steps.length - 1, Math.max(0, (saved.step || 1) - 1))
  );
  let highlight = $state<string | null>(steps[stepIndex]!.region);
  const current = $derived(steps[stepIndex]!);
  let headingElement = $state<HTMLElement | null>(null);

  $effect(() => {
    const highlightedIndex = steps.findIndex(
      (step) => step.region === highlight
    );
    if (highlightedIndex >= 0 && highlightedIndex !== stepIndex) {
      stepIndex = highlightedIndex;
      persistence.saveStep(highlightedIndex + 1);
    }
  });

  function revealHeading(): void {
    void tick().then(() => {
      // A focused control can scroll both the lesson and the public page.
      // Reveal the heading through both ancestors on scrollable layouts.
      requestAnimationFrame(() => {
        const heading = headingElement;
        if (
          !heading ||
          !window.matchMedia("(max-width: 700px), (max-height: 600px)").matches
        )
          return;
        heading.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      });
    });
  }

  function goToStep(next: number, reveal = false): void {
    const clamped = Math.min(steps.length - 1, Math.max(0, next));
    if (clamped === stepIndex) return;
    stepIndex = clamped;
    highlight = steps[clamped]!.region;
    persistence.saveStep(clamped + 1);
    haptic?.trigger("selection");
    if (reveal) revealHeading();
  }

  function selectCard(nextCardId: (typeof cards)[number]["id"]): void {
    cardId = nextCardId;
    haptic?.trigger("selection");
  }

  function selectRegion(region: string | null): void {
    const nextStep = steps.findIndex((step) => step.region === region);
    if (nextStep >= 0) goToStep(nextStep);
  }

  function complete(): void {
    persistence.reset();
    haptic?.trigger("success");
    onComplete?.("rotation-direction");
  }

  function handleAction(): void {
    if (stepIndex === steps.length - 1) complete();
    else goToStep(stepIndex + 1, true);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step" || event.defaultPrevented) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, input, select, textarea, [role='slider']")
    )
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handleAction();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      handleBack();
    }
  }

  export function handleBack(): void {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1, true);
      return;
    }
    onBack?.();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="card-reading-experience"
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label="Reading a Choreo Card lesson, use arrow keys to navigate"
>
  <LessonStageFrame artifactLayout="wide">
    {#snippet heading()}
      <div bind:this={headingElement}>
        <LessonStageHeading
          key={current.region}
          title={current.title}
          eyebrow="Reading a Choreo Card"
        >
          <p>{current.text}</p>
        </LessonStageHeading>
      </div>
    {/snippet}

    {#snippet artifact()}
      <div class="card-study" aria-label={`${card.name} hand-path card`}>
        <div class="card-picker">
          <SegmentedControl
            options={cardOptions}
            value={cardId}
            onchange={selectCard}
            ariaLabel="Choose a hand-path reference card"
            color="accent"
            columns={2}
            semantics="radiogroup"
          />
        </div>
        <CardAnatomyExplainer
          beginnerCard={{
            sequence: card.sequence,
            qrUrl: HAND_PATH_REFERENCE_SCAN_URLS[card.id],
            title: card.cardTitle,
          }}
          initialHighlight="start"
          bind:highlight
          onhighlightchange={selectRegion}
          showShuffle={false}
        />
      </div>
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={stepIndex === steps.length - 1 ? "Finish lesson" : "Next"}
        currentStep={stepIndex + 1}
        totalSteps={steps.length}
        onAction={handleAction}
        onPrevious={handleBack}
        previousDisabled={stepIndex === 0}
        actionIcon={stepIndex === steps.length - 1 ? "check" : "arrow"}
        curriculumLabel="Level 1 · Reading a Choreo Card"
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .card-reading-experience {
    min-height: 100%;
    color: var(--theme-text);
    outline: none;
  }

  .card-reading-experience :global(.lesson-stage-frame) {
    --lesson-artifact-wide-max: 54rem;
  }

  .card-study {
    width: min(100%, 54rem);
    height: 100%;
    margin-inline: auto;
    display: grid;
    grid-template-columns:
      minmax(0, min(30rem, calc((100cqh - 3.5rem) * 5 / 7)))
      minmax(12rem, 14rem);
    grid-template-rows: minmax(0, 1fr);
    justify-content: center;
    gap: clamp(0.75rem, 2cqw, 1.25rem);
    align-items: center;
    container-type: size;
  }

  .card-study > :global(.explainer) {
    width: 100%;
    justify-self: center;
  }

  .card-picker {
    grid-column: 2;
    align-self: center;
  }

  .card-study > :global(.explainer) {
    grid-column: 1;
    grid-row: 1;
  }

  .card-study :global(.mobile-anatomy) {
    gap: 0.5rem;
  }

  .card-study :global(.detail-slot) {
    display: none;
  }

  .card-study :global(.chip-row) {
    flex-wrap: nowrap;
    gap: 0.4rem;
  }

  .card-study :global(.part-chip) {
    min-width: 44px;
    padding-inline: 0.6rem;
  }

  @media (min-width: 701px) and (min-height: 1300px) {
    .card-reading-experience {
      height: 100%;
      display: flex;
      align-items: center;
    }

    .card-reading-experience :global(.lesson-stage-frame) {
      height: min(100%, 72rem);
      flex: 0 0 auto;
    }
  }

  @media (max-width: 700px), (max-height: 600px) {
    .card-reading-experience :global(.lesson-stage-frame) {
      height: auto;
      min-height: 100%;
      grid-template-rows: auto auto auto;
    }

    .card-reading-experience :global(.stage-artifact),
    .card-reading-experience :global(.artifact-inner.wide) {
      height: auto;
    }

    .card-reading-experience :global(.stage-artifact),
    .card-study {
      /* A size container has no intrinsic block size. In the natural-height
         fallback that collapses the card study below its heading and controls. */
      container-type: inline-size;
    }

    .card-study {
      height: auto;
      min-height: 0;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto;
      gap: 0.5rem;
    }

    .card-study > :global(.explainer) {
      width: min(100%, 16rem);
      min-height: 0;
      grid-column: 1;
      grid-row: 2;
    }

    .card-picker {
      grid-column: 1;
      grid-row: 1;
      width: min(100%, 28rem);
      justify-self: center;
    }
  }
</style>
