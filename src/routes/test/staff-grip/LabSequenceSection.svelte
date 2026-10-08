<!--
  What plays: the loaded sequence and the front door to every other one.

  Choosing goes through SequencePickerModal — the same picker Stage and the
  effects lab open, over the same browse engine — so this lab can reproduce a
  grip failure somebody hit on a sequence of their own. The 19 core goals are
  their own section (LabGoalsSection); this one only names what is loaded.
-->
<script lang="ts">
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SequencePickerModal from "$lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  import LabSection from "./LabSection.svelte";
  import { labFixture, labSequenceLabel } from "./lab-catalog";
  import { labContinuityStatus } from "./lab-continuity";
  import { labGoal } from "./lab-goals";
  import type { StaffLabState } from "./lab-state.svelte";

  interface Props {
    lab: StaffLabState;
    sequence: SequenceData | null;
    sequenceLoading: boolean;
  }

  let { lab, sequence, sequenceLoading }: Props = $props();

  let libraryOpen = $state(false);

  /**
   * The loaded sequence, named the way the product names it. A repeating word
   * always shows in its smallest form, which `labSequenceLabel` owns.
   */
  const activeFixture = $derived(labFixture(lab.sequenceId));
  const activeGoal = $derived(labGoal(lab.sequenceId));
  const sequenceWord = $derived(
    activeGoal?.label ??
      activeFixture?.label ??
      (sequence ? labSequenceLabel(sequence) : lab.sequenceId)
  );
  const sequenceStepCount = $derived(
    activeFixture?.stepCount ?? sequence?.steps.length ?? null
  );
  const sequenceSource = $derived(
    activeGoal
      ? `Core goal ${activeGoal.order} of 19`
      : activeFixture
        ? "Verified fixture"
        : "From the library"
  );

  /** What the committed sweep says about whatever is currently loaded. */
  const activeContinuity = $derived(labContinuityStatus(lab.sequenceId));

  function chooseLibrarySequence(picked: SequenceData): void {
    lab.setSequence(picked.id);
    libraryOpen = false;
  }
</script>

<LabSection
  id="lab-sequence"
  title="Sequence"
  icon="fa-book-open"
  summary={sequenceStepCount !== null
    ? `${sequenceWord} · ${sequenceStepCount} steps`
    : sequenceWord}
>
  <div class="chip-row">
    <FilterChipBase
      mode="dropdown"
      icon="fa-book-open"
      label={sequenceWord}
      count={sequenceStepCount}
      expanded={libraryOpen}
      ariaLabel={`Sequence: ${sequenceWord}. Choose another from the library.`}
      onclick={() => (libraryOpen = true)}
    />
  </div>
  <!--
    The status line keeps its height while a sequence loads, so the sections
    under it do not step up and down.
  -->
  <p class="status" aria-live="polite">
    {#if sequenceLoading}
      Loading sequence…
    {:else if sequenceStepCount !== null}
      <span>{sequenceSource}</span>
      <span class="continuity">
        <i
          class={activeContinuity.icon}
          style={`color: ${activeContinuity.color};`}
          aria-hidden="true"
        ></i>
        {activeContinuity.summary}
      </span>
    {:else}
      Nothing loaded
    {/if}
  </p>
</LabSection>

<SequencePickerModal
  bind:open={libraryOpen}
  title="Choose the sequence this lab plays"
  onClose={() => (libraryOpen = false)}
  onSelect={chooseLibrarySequence}
/>

<style>
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  /* A chip sizes to its label instead of stretching across the rail. */
  .chip-row :global(> *) {
    flex: 0 0 auto;
    max-width: 100%;
  }

  .status {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    margin: 0;
    min-height: 1.15rem;
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
  }

  .continuity {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--theme-text, #fff);
  }
</style>
