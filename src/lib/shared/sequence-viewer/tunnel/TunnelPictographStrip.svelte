<script lang="ts">
  import StepStrip from "#lib/shared/timeline/StepStrip.svelte";
  import type { NotationCell } from "#lib/shared/timeline/notation-cell.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
  import type { TunnelViewController } from "./tunnel-view-controller.svelte";
  import { sampleTunnelNotation } from "./tunnel-notation-sampling";

  interface Appearance {
    fanAppearance: FanAppearance;
    propLook: PropLook;
    leftBuugengFlipped: boolean;
    rightBuugengFlipped: boolean;
  }

  let {
    controller,
    currentStep,
    bpm,
    leftPropType = null,
    rightPropType = null,
    appearance = undefined,
    showGrid = true,
    showArrows = true,
    showProps = true,
    cellSize = 88,
    onCellClick = null,
  }: {
    controller: TunnelViewController;
    /** Shared 1-indexed playhead, including laps needed by slower performers. */
    currentStep: number;
    bpm: number;
    leftPropType?: string | null;
    rightPropType?: string | null;
    appearance?: Appearance;
    showGrid?: boolean;
    showArrows?: boolean;
    showProps?: boolean;
    cellSize?: number;
    onCellClick?: ((stepNumber: number) => void) | null;
  } = $props();

  const layers = $derived(controller.notationLayers);
  const colors = $derived(controller.speedPerformers);
  const sequence = $derived(controller.notationSequence);
  // The carousel covers the entire shared clock: a slow arm may need several
  // base-sequence laps before the whole formation returns to its opening pose.
  const cells = $derived.by((): NotationCell[] => {
    const steps = sequence?.steps ?? [];
    if (!layers.length || !steps.length) return [];
    return Array.from({ length: controller.loopSteps }, (_, index) => ({
      key: `tunnel-${index + 1}`,
      data: steps[index % steps.length]!,
      label: `${index + 1}`,
      isStart: false,
      stepNumber: index + 1,
    }));
  });
</script>

{#snippet tunnelCell(cell: NotationCell)}
  {@const samples = sampleTunnelNotation(layers, cell.stepNumber, (layer) =>
    controller.notationTimingForLayer(layer)
  )}
  <div
    class="composite"
    role="img"
    aria-label={`Tunnel at beat ${cell.stepNumber}`}
  >
    {#each samples as sample, index (sample.layer.stageInstanceId)}
      <div class="instance" aria-hidden="true">
        <PictographContainer
          pictographData={sample.step}
          darkMode={true}
          disableTransitions={true}
          disableContentTransitions={true}
          transparentBackground={true}
          showGrid={showGrid && index === 0}
          showHandPoints={index === 0}
          showTKA={false}
          showReversals={false}
          showNonRadialPoints={false}
          showTnD={false}
          showElemental={false}
          showPropTnD={false}
          showPlacements={false}
          showHandColorKey={false}
          stepNumberOverride={false}
          showArrow={showArrows}
          {showProps}
          leftPropTypeOverride={(leftPropType ?? undefined) as
            | PropType
            | undefined}
          rightPropTypeOverride={(rightPropType ?? undefined) as
            | PropType
            | undefined}
          fanAppearanceOverride={appearance?.fanAppearance}
          propLookOverride={appearance?.propLook}
          leftBuugengFlippedOverride={appearance?.leftBuugengFlipped}
          rightBuugengFlippedOverride={appearance?.rightBuugengFlipped}
          leftColorOverride={colors[index]?.leftHex}
          rightColorOverride={colors[index]?.rightHex}
        />
      </div>
    {/each}
  </div>
{/snippet}

<StepStrip
  {cells}
  {currentStep}
  {bpm}
  {cellSize}
  compactCellSize={cellSize}
  density="compact"
  presentation="strip"
  anchor="center"
  includeStartPlacement={false}
  loop={true}
  renderCell={tunnelCell}
  {onCellClick}
/>

<style>
  .composite {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }

  .instance {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .instance :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
