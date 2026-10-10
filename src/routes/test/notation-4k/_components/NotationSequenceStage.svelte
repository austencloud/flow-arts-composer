<script lang="ts">
  import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let { sequence }: { sequence: SequenceData } = $props();
</script>

<div class="stage-shell">
  <div class="sequence-stage">
    <div class="player-cell">
      <SequenceHeroDemo {sequence} note="pictographs beside the animation" />
    </div>

    <div class="score-cell">
      <div class="score-heading">
        <p class="score-label">The score</p>
        <p class="score-word tka-font">{sequence.word}</p>
      </div>

      <div class="beat-strip" aria-label="Eight sequence pictographs">
        {#each sequence.steps as step, index (step.id)}
          <figure class="beat">
            <div class="beat-art">
              <PictographContainer
                pictographData={step}
                darkMode={true}
                showGrid={true}
                showTKA={true}
                stepNumberOverride={false}
              />
            </div>
            <figcaption>Beat {index + 1}</figcaption>
          </figure>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .stage-shell {
    container: sequence-stage / inline-size;
  }

  .sequence-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(1.25rem, 3cqi, 3.5rem);
    align-items: center;
  }

  .player-cell,
  .score-cell {
    min-width: 0;
  }

  .player-cell {
    padding: clamp(0.4rem, 1.2cqi, 1.2rem);
  }

  .score-cell {
    padding: clamp(1rem, 2.5cqi, 2.4rem);
    background: var(--theme-panel-bg, rgba(9, 11, 24, 0.82));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
  }

  .score-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: clamp(0.9rem, 1.8cqi, 1.5rem);
  }

  .score-label,
  .score-word {
    margin: 0;
  }

  .score-label {
    color: var(--theme-text-dim, #aaa5bc);
    font-family: "Inter", system-ui, sans-serif;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 680;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .score-word {
    overflow: hidden;
    color: var(--theme-text, #f4f1ff);
    font-size: clamp(1rem, 0.92rem + 0.4cqi, 1.4rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .beat-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(0.55rem, 1.2cqi, 1rem);
  }

  .beat {
    min-width: 0;
    margin: 0;
  }

  .beat-art {
    aspect-ratio: 1;
    overflow: hidden;
    padding: clamp(0.15rem, 0.5cqi, 0.4rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.65rem);
  }

  figcaption {
    margin-top: 0.4rem;
    color: var(--theme-text-dim, #aaa5bc);
    font-family: "Inter", system-ui, sans-serif;
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  @container sequence-stage (min-width: 42rem) {
    .beat-strip {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container sequence-stage (min-width: 64rem) {
    .sequence-stage {
      grid-template-columns: minmax(20rem, 0.8fr) minmax(0, 1.4fr);
    }
  }

  @container sequence-stage (min-width: 92rem) {
    .beat-strip {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }
</style>
