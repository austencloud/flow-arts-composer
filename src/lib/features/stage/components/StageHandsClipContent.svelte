<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";

  interface Props {
    title: string;
    sequence?: SequenceData;
    activeStepIndex?: number | null;
    loop?: boolean;
  }

  let {
    title,
    sequence,
    activeStepIndex = null,
    loop = false,
  }: Props = $props();

  const visibleSteps = $derived(sequence?.steps.slice(0, 8) ?? []);
  const overflowCount = $derived(
    Math.max(0, (sequence?.steps.length ?? 0) - visibleSteps.length)
  );
</script>

<div class="hands-content" aria-hidden="true">
  <span class="sequence-identity">
    <strong>{title}</strong>
    <span>
      {activeStepIndex && sequence
        ? `Step ${activeStepIndex} of ${sequence.steps.length}`
        : `${sequence?.steps.length ?? 0} hand steps`}
    </span>
  </span>

  {#if sequence && sequence.steps.length > 0}
    <span class="step-strip">
      {#each visibleSteps as step, index (step.id)}
        <span class="step-card" class:current={activeStepIndex === index + 1}>
          <span class="step-picture">
            <PictographContainer
              pictographData={step}
              disableTransitions
              disableContentTransitions
              showTKA={false}
              showTnD={false}
              showElemental={false}
              showPlacements={false}
              showReversals={false}
              showNonRadialPoints={false}
              showHandPoints={false}
              stepNumberOverride={false}
              transparentBackground
              darkMode
            />
          </span>
          <span class="step-number">{index + 1}</span>
        </span>
      {/each}
      {#if overflowCount > 0}
        <span class="step-card overflow-card">
          <span class="more-count">+{overflowCount}</span>
        </span>
      {/if}
    </span>
  {/if}

  <span class="loop-note" class:visible={loop} aria-hidden={!loop}>
    <i class="fas fa-repeat"></i> repeats
  </span>
</div>

<style>
  .hands-content {
    position: absolute;
    inset: 0 1rem 0 0;
    z-index: 1;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.65rem;
    padding: 0.2rem 0.7rem;
    overflow: hidden;
    pointer-events: none;
  }

  .sequence-identity {
    display: flex;
    width: clamp(5rem, 9cqi, 8rem);
    min-width: 4.5rem;
    flex: 0 1 auto;
    flex-direction: column;
    line-height: 1.1;
  }

  .sequence-identity strong,
  .sequence-identity > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sequence-identity strong {
    color: white;
    font-size: var(--font-size-min, 0.875rem);
    text-shadow: 0 1px 2px black;
  }

  .sequence-identity > span {
    margin-top: 0.15rem;
    color: rgba(255, 255, 255, 0.72);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
  }

  .step-strip {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 0.3rem;
  }

  .step-card {
    position: relative;
    display: grid;
    width: 2.65rem;
    height: 2.65rem;
    place-items: center;
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 0.5rem;
    background: rgba(6, 8, 14, 0.62);
    box-shadow: 0 0.15rem 0.35rem rgba(0, 0, 0, 0.28);
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .step-card.current {
    z-index: 2;
    border-color: var(--semantic-warning, #f59e0b);
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 18%,
      #080a10
    );
    box-shadow:
      0 0 0 2px
        color-mix(in srgb, var(--semantic-warning, #f59e0b) 48%, transparent),
      0 0 0.9rem
        color-mix(in srgb, var(--semantic-warning, #f59e0b) 65%, transparent);
    transform: translateY(-0.08rem) scale(1.035);
  }

  .step-picture {
    position: absolute;
    inset: 0.08rem;
  }

  .step-number {
    position: absolute;
    right: 0.2rem;
    bottom: 0.12rem;
    z-index: 2;
    display: grid;
    min-width: 0.9rem;
    height: 0.9rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.72);
    color: rgba(255, 255, 255, 0.9);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    line-height: 1;
  }

  .overflow-card {
    border-style: dashed;
  }

  .more-count {
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }

  .loop-note {
    display: inline-flex;
    min-width: max-content;
    align-items: center;
    gap: 0.3rem;
    color: rgba(255, 255, 255, 0.72);
    font-size: var(--font-size-compact, 0.75rem);
    opacity: 0;
    transition:
      opacity var(--duration-fast, 150ms) ease,
      visibility 0s linear var(--duration-fast, 150ms);
    visibility: hidden;
  }

  .loop-note.visible {
    opacity: 1;
    transition-delay: 0s;
    visibility: visible;
  }

  @container (max-width: 46rem) {
    .sequence-identity > span,
    .loop-note {
      display: none;
    }

    .step-card {
      width: 2.45rem;
      height: 2.45rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .step-card,
    .loop-note {
      transition: none;
    }
  }
</style>
