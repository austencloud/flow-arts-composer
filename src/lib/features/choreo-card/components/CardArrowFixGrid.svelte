<!--
  CardArrowFixGrid.svelte

  Thin adapter that renders the sequence with the established workspace StepGrid
  (the real grid that lays out the start position + numbered steps and respects
  prop-type overrides) and forwards a clicked cell — with the card's effective
  prop types injected — to the arrow editor. No hand-rolled grid: StepGrid owns
  the layout, StepCell owns the cell, this only maps a click to the StepData and
  pins the prop types so the edited override key matches the card-front bake key.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import { withEffectivePropTypes } from "../services/with-effective-prop-types";

  interface Props {
    sequence: SequenceData;
    leftPropType: PropType;
    rightPropType: PropType;
    includeStartPlacement?: boolean;
    onSelect: (step: StepData) => void;
  }

  let {
    sequence,
    leftPropType,
    rightPropType,
    includeStartPlacement = true,
    onSelect,
  }: Props = $props();

  function emit(step: StepData): void {
    onSelect(withEffectivePropTypes(step, leftPropType, rightPropType));
  }

  // StepGrid uses 1-based step numbers (0 = start placement).
  function handleStepClick(stepNumber: number): void {
    const step = sequence.steps?.[stepNumber - 1];
    if (step) emit(step);
  }

  function handleStartClick(): void {
    const start = sequence.startPlacement;
    if (!start) return;
    // Drop the start-placement-only discriminator and route through the
    // factory: it fills defaults + any missing hand with an invisible
    // placeholder (both-required canonical Step shape).
    const { isStartPlacement: _isStart, ...pictograph } = start;
    const step: StepData = createStepData({
      ...pictograph,
      stepNumber: 0,
      duration: 1,
      isBlank: false,
    });
    emit(step);
  }
</script>

<div class="fix-grid-host">
  <StepGrid
    steps={sequence.steps ?? []}
    startPlacement={includeStartPlacement ? sequence.startPlacement ?? null : null}
    onStepClick={handleStepClick}
    onStartClick={handleStartClick}
    leftPropTypeOverride={leftPropType}
    rightPropTypeOverride={rightPropType}
  />
</div>

<style>
  .fix-grid-host {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
