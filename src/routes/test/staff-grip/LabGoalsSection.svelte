<!--
  The 19 core TnD sequences, the lab's goal list, grouped the way VTG groups
  them: three or four per family, each family one line wide enough to hold it.

  Only a clean goal carries a mark. Every goal used to carry a check or a bolt,
  and thirteen bolts read as a row of "⚡ MP ⚡ NQ ⚡ OR" glyph noise rather
  than thirteen sequences. Now the check stands out because it is the
  exception, the selected chip is the app's own accent fill instead of a
  warning-orange blob, and the jump count lives on the Sequence section's line,
  in each chip's accessible name, and under the scrub.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";

  import LabSection from "./LabSection.svelte";
  import {
    labContinuityStatus,
    labGoalContinuitySummary,
  } from "./lab-continuity";
  import { LAB_GOAL_FAMILIES } from "./lab-goals";
  import type { StaffLabState } from "./lab-state.svelte";

  let { lab }: { lab: StaffLabState } = $props();

  /** How far the goal list is from a teleport-free pass. Static per artifact. */
  const goalSummary = labGoalContinuitySummary();
</script>

<LabSection
  id="lab-goals"
  title="Core goals"
  icon="fa-bullseye"
  summary={`${goalSummary.clean} of ${goalSummary.total} clean`}
>
  <div class="goal-families">
    {#each LAB_GOAL_FAMILIES as family (family.id)}
      <div class="goal-family">
        <span class="goal-family-label" id={`lab-goal-${family.id}`}>
          {family.label}
        </span>
        <div
          class="chip-row"
          role="group"
          aria-labelledby={`lab-goal-${family.id}`}
        >
          {#each family.goals as goal (goal.id)}
            {@const status = labContinuityStatus(goal.id)}
            {@const isActive = lab.sequenceId === goal.id}
            {#snippet cleanMark()}
              <span
                class="clean-mark"
                class:on-accent={isActive}
                style={`--mark-color: ${status.color};`}
              >
                <i class={status.icon} aria-hidden="true"></i>
              </span>
            {/snippet}
            <FilterChipBase
              mode="toggle"
              emphasis="solid"
              size="sm"
              labelScale="readable"
              label={goal.label}
              iconSnippet={status.state === "findings" ? undefined : cleanMark}
              active={isActive}
              ariaLabel={`${goal.label}, ${family.label}, ${status.summary}`}
              onclick={() => lab.setSequence(goal.id)}
            />
          {/each}
        </div>
      </div>
    {/each}
  </div>
  <p class="legend">
    <i class="fa-solid fa-check" aria-hidden="true"></i>
    No prop jumps in the committed sweep
  </p>
</LabSection>

<style>
  .goal-families {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }

  /*
   * The family name sits beside its goals when the section is wide enough
   * for a label column and the longest family (four chips), and above them
   * otherwise. The section measures itself, so a 19rem side rail and a
   * two-column tablet rail each get the shape that fits.
   */
  .goal-family {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.25rem;
    min-width: 0;
  }

  .goal-families {
    container-type: inline-size;
  }

  @container (min-width: 22rem) {
    .goal-family {
      grid-template-columns: 6.5rem minmax(0, 1fr);
      align-items: center;
      gap: 0.5rem;
    }
  }

  .goal-family-label {
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    white-space: nowrap;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .chip-row :global(> *) {
    flex: 0 0 auto;
    max-width: 100%;
  }

  /*
   * The clean (or not-swept) mark. Its shape carries the state; the status
   * colour reinforces it. On the
   * selected chip the accent fill owns the surface, so the mark turns
   * on-accent rather than sitting a second hue on top of it.
   */
  .clean-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    color: var(--mark-color);
  }

  .clean-mark.on-accent {
    color: var(--theme-text-on-accent, #fff);
  }

  .clean-mark i {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .legend i {
    color: var(--semantic-success, #22c55e);
  }
</style>
