<!--
  Pictograph Anatomy on the shared lesson shell: one real pictograph of A
  stays on the stage while a spotlight tours its regions step by step.
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { getCodexLetterMappingRepo } from "#lib/features/learn/codex/get-codex-letter-mapping-repo.js";
  import ArtifactRegionSpotlight from "#lib/shared/components/ArtifactRegionSpotlight.svelte";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
  import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";
  import { derivePropElementalType } from "#lib/shared/shape-matrix/domain/prop-relationship.js";
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
      text: "learn_anatomy_whole_text",
      label: "learn_anatomy_whole_label",
      region: null,
    },
    {
      text: "learn_anatomy_number_text",
      label: "learn_anatomy_number_label",
      region: { x: 0, y: 0, width: 25, height: 24 },
    },
    {
      text: "learn_anatomy_placements_text",
      label: "learn_anatomy_placements_label",
      region: { x: 27, y: 0, width: 46, height: 24 },
    },
    {
      text: "learn_anatomy_letter_text",
      label: "learn_anatomy_letter_label",
      region: { x: 0, y: 68, width: 38, height: 32 },
    },
    {
      text: "learn_anatomy_hands_text",
      label: "learn_anatomy_hands_label",
      region: { x: 67, y: 68, width: 33, height: 32 },
    },
    {
      text: "learn_anatomy_props_text",
      label: "learn_anatomy_props_label",
      region: { x: 68, y: 0, width: 32, height: 28 },
    },
    {
      text: "learn_anatomy_paths_text",
      label: "learn_anatomy_paths_label",
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
  const curriculumLabel = $derived(tDynamic("learn_ui_level_one"));
  let stepIndex = $state(
    Math.min(STEPS.length - 1, Math.max(0, (saved.step || 1) - 1))
  );
  let pictograph = $state<PictographData | null>(null);
  let loading = $state(true);
  let error = $state(false);
  const current = $derived(STEPS[stepIndex]!);
  const isLast = $derived(stepIndex === STEPS.length - 1);
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
    if (isLast) complete();
    else goToStep(stepIndex + 1);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (viewMode !== "step") return;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      handlePrimaryAction();
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
  class="anatomy-experience"
  onkeydown={handleKeydown}
  tabindex="0"
  role="application"
  aria-label={t("learn_ui_pictograph_anatomy_keyboard")}
>
  <LessonStageFrame>
    {#snippet heading()}
      <LessonStageHeading
        key={stepIndex}
        title={tDynamic(current.label)}
        eyebrow={tDynamic("learn_concept_letter_codex_intro_name")}
      >
        <p>{tDynamic(current.text)}</p>
      </LessonStageHeading>
    {/snippet}

    {#snippet artifact()}
      <div
        class="pictograph-frame"
        aria-label={t("learn_ui_pictograph_anatomy_step", {
          label: tDynamic(current.label),
        })}
      >
        {#if loading}
          <div class="load-state" role="status">
            <ProgressRing percent={-1} size={40} strokeWidth={3} />
            <span>{t("learn_ui_loading_pictograph")}</span>
          </div>
        {:else if error || !anatomyStep}
          <div class="load-state" role="alert">
            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
            <span>{t("learn_ui_pictograph_unavailable")}</span>
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
    {/snippet}

    {#snippet controls()}
      <LessonStageControls
        progressAppearance="steps"
        label={isLast ? t("learn_ui_finish_lesson") : t("learn_ui_next")}
        currentStep={stepIndex + 1}
        totalSteps={STEPS.length}
        onAction={handlePrimaryAction}
        onPrevious={handleBack}
        previousDisabled={stepIndex === 0}
        actionIcon={isLast ? "check" : "arrow"}
        {curriculumLabel}
      />
    {/snippet}
  </LessonStageFrame>
</div>

<style>
  .anatomy-experience {
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--theme-text);
    outline: none;
  }

  .pictograph-frame {
    position: relative;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--radius-md, 0.5rem);
    background: var(--theme-card-bg);
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
</style>
