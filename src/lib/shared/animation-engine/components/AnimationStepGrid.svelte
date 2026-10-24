<!--
  AnimationStepGrid.svelte

  Step grid for animation panels (Create and Compose modules).
  Shows sequence steps with playback sync highlighting (golden glow on current beat).
  A host with a wide, short slot (the Flow Fest phrase stage's dock) passes
  `columns` and sets `--step-grid-max-width`, and `cell="pictograph"` to draw
  each step as the Composer's pictograph (in `propType`'s art when given)
  rather than its letter; everyone else keeps the default layout.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import TKAGlyph from "#lib/shared/pictograph/tka-glyph/components/TKAGlyph.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

  let {
    sequenceData = null,
    currentStep = 0,
    isPlaying = false,
    columns,
    cell = "glyph",
    propType,
  }: {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    /** Columns for the step count; omit for the default ladder. */
    columns?: (stepCount: number) => number;
    /** What each cell draws: the step's letter, or its whole pictograph. */
    cell?: "glyph" | "pictograph";
    /** Both hands' prop art for pictograph cells; omit for the step's own. */
    propType?: PropType;
  } = $props();

  // Get steps from sequence (excluding metadata beat at index 0 if present)
  const steps = $derived(() => {
    if (!sequenceData?.steps) return [];
    // steps[0] is usually start position data embedded, actual steps start at 1
    return sequenceData.steps.slice(1);
  });

  // Calculate grid columns based on beat count
  const gridColumns = $derived(() => {
    const count = steps().length;
    if (columns) return Math.max(1, columns(count));
    if (count <= 4) return count || 1;
    if (count <= 8) return 4;
    if (count <= 12) return 4;
    return 5;
  });

  // Calculate which beat index is current (accounting for animation timing)
  const currentStepIndex = $derived(() => {
    // currentStep is 0-indexed from animation, but our display is 1-indexed
    return Math.floor(currentStep);
  });
</script>

<div class="animation-step-grid">
  {#if steps().length === 0}
    <div class="empty-state">
      <i class="fas fa-layer-group" aria-hidden="true"></i>
      <span>{t("playback_audit_no_sequence")}</span>
    </div>
  {:else}
    <div class="step-grid" style:--grid-cols={gridColumns()}>
      {#each steps() as beat, index}
        {@const stepNumber = index + 1}
        {@const isCurrentBeat = isPlaying && currentStepIndex() === index}
        {@const wasPlayed = isPlaying && currentStepIndex() > index}
        <div
          class="step-cell"
          class:current={isCurrentBeat}
          class:played={wasPlayed}
        >
          <div class="step-content" class:whole={cell === "pictograph"}>
            {#if cell === "pictograph"}
              <PictographContainer
                pictographData={beat}
                disableTransitions
                leftPropTypeOverride={propType}
                rightPropTypeOverride={propType}
              />
            {:else}
              <TKAGlyph pictographData={beat} letter={beat?.letter} />
            {/if}
          </div>
          <!-- A pictograph carries its own step number. -->
          {#if cell !== "pictograph"}
            <span class="step-number">{stepNumber}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .animation-step-grid {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    overflow: auto;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }

  .empty-state i {
    font-size: 1.5rem;
    opacity: 0.6;
  }

  .step-grid {
    display: grid;
    grid-template-columns: repeat(var(--grid-cols), 1fr);
    gap: 4px;
    width: 100%;
    max-width: var(--step-grid-max-width, 360px);
  }

  .step-cell {
    position: relative;
    aspect-ratio: 1;
    background: var(--theme-card-bg);
    border: 1.5px solid var(--theme-stroke);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard);
    overflow: hidden;
  }

  .step-cell.current {
    border-color: color-mix(in srgb, var(--semantic-warning) 80%, transparent);
    box-shadow:
      0 0 12px color-mix(in srgb, var(--semantic-warning) 40%, transparent),
      0 0 24px color-mix(in srgb, var(--semantic-warning) 20%, transparent),
      inset 0 0 8px color-mix(in srgb, var(--semantic-warning) 10%, transparent);
    background: color-mix(in srgb, var(--semantic-warning) 8%, transparent);
  }

  .step-cell.played {
    opacity: 0.5;
  }

  .step-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
  }

  .step-content.whole {
    padding: 0;
  }

  .step-number {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-variant-numeric: tabular-nums;
  }

  .step-cell.current .step-number {
    color: white;
  }

  /* Responsive sizing */
  @media (max-width: 400px) {
    .step-grid {
      max-width: var(--step-grid-max-width, 300px);
      gap: 3px;
    }
  }
</style>
