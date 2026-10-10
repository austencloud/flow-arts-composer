<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import CountStepper from "./CountStepper.svelte";
  import { getStageChoreographyContext } from "../context/stage-choreography-context";
  import { resolveActiveFormationIndex } from "../domain/active-formation";
  import type { StageEditMode } from "../state/stage-edit-mode.svelte";
  import type {
    EasingType,
    Formation,
    FormationSpot,
    WalkStyle,
  } from "../domain/stage-types";

  interface Props {
    editMode: StageEditMode;
    onRemoveSet: (formationId: string) => void;
  }

  let { editMode, onRemoveSet }: Props = $props();

  const stageState = getStageChoreographyContext();
  const choreography = $derived(stageState.choreography);

  const setIndex = $derived(
    resolveActiveFormationIndex(
      choreography.formations,
      editMode.selectedFormationId,
      stageState.currentBeat
    )
  );

  const set = $derived.by((): Formation | undefined =>
    setIndex >= 0 ? choreography.formations[setIndex] : undefined
  );

  const setName = $derived(set?.label ?? `Set ${setIndex + 1}`);

  const previousBeat = $derived(
    setIndex > 0 ? (choreography.formations[setIndex - 1]?.atBeat ?? 0) : 0
  );

  // The walk cannot be longer than the gap to the set before it — the state
  // clamps this anyway, but the stepper should not offer counts it will refuse.
  const maxTransition = $derived(
    set ? Math.max(0, set.atBeat - previousBeat) : 0
  );

  const performer = $derived(
    choreography.performers.find(
      (candidate) => candidate.id === editMode.selectedPerformerId
    )
  );

  const spot = $derived.by((): FormationSpot | undefined =>
    set && performer ? set.spots[performer.id] : undefined
  );

  const WALK_STYLES: { value: WalkStyle; label: string }[] = [
    { value: "direct", label: "Direct" },
    { value: "crab", label: "Crab" },
  ];

  const EASINGS: { value: EasingType; label: string; shortLabel: string }[] = [
    { value: "linear", label: "Linear", shortLabel: "Even" },
    { value: "easeIn", label: "Ease in", shortLabel: "In" },
    { value: "easeOut", label: "Ease out", shortLabel: "Out" },
    { value: "easeInOut", label: "Ease in and out", shortLabel: "Both" },
  ];

  // The counts a drill is actually written in. Anything else is the stepper.
  const QUICK_COUNTS = [8, 16];

  function setTransition(beats: number) {
    if (!set) return;
    stageState.setFormationTransitionBeats(set.id, beats);
  }

  function removeSet() {
    if (!set) return;
    onRemoveSet(set.id);
  }
</script>

{#if set}
  <div class="set-properties" role="region" aria-label="{setName} properties">
    <h4 class="set-header">
      <span class="set-name">{setName}</span>
      <span class="set-beat">count {set.atBeat}</span>
    </h4>

    {#if setIndex > 0}
      <div class="property-row">
        <span class="property-label" id="walk-counts-label"
          >Counts to get there</span
        >
        <CountStepper
          value={set.transitionBeats}
          min={0}
          max={maxTransition}
          label="counts to get there"
          onchange={setTransition}
        />
      </div>
      <div
        class="quick-counts"
        role="group"
        aria-labelledby="walk-counts-label"
      >
        {#each QUICK_COUNTS as count}
          <FilterChipBase
            label="{count} counts"
            mode="action"
            size="sm"
            active={set.transitionBeats === count}
            disabled={count > maxTransition}
            onclick={() => setTransition(count)}
          />
        {/each}
      </div>
    {:else}
      <p class="opening-note">
        The opening set is where everyone starts, so nobody walks into it.
      </p>
    {/if}

    {#if performer && spot}
      <div class="spot-block">
        <h5 class="spot-header">
          <span class="performer-badge" style="background: {performer.color}">
            {performer.label}
          </span>
          <span>Spot</span>
        </h5>

        <div class="property-row stacked">
          <span class="property-label" id="walk-style-label">Walk style</span>
          <SegmentedControl
            options={WALK_STYLES}
            value={spot.walkStyle}
            size="sm"
            ariaLabelledby="walk-style-label"
            onchange={(value) =>
              stageState.updateSpotWalkStyle(set.id, performer.id, value)}
          />
        </div>

        <div class="property-row stacked">
          <span class="property-label" id="walk-easing-label">Pacing</span>
          <SegmentedControl
            options={EASINGS}
            value={spot.easing}
            size="sm"
            ariaLabelledby="walk-easing-label"
            onchange={(value) =>
              stageState.updateSpotEasing(set.id, performer.id, value)}
          />
        </div>

        <div class="property-row">
          <span class="property-label">Position</span>
          <span class="position-value">
            {spot.x.toFixed(1)}m, {spot.z.toFixed(1)}m
          </span>
        </div>
      </div>
    {:else}
      <p class="spot-hint">
        Pick a performer on the chart to set how they get here.
      </p>
    {/if}

    {#if setIndex > 0}
      <button
        type="button"
        class="delete-btn"
        onclick={removeSet}
        aria-label="Remove {setName}"
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
        Remove {setName}
      </button>
    {/if}
  </div>
{/if}

<style>
  .set-properties {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .set-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0;
    gap: 0.5rem;
  }

  .set-name {
    color: var(--theme-text, white);
    font-size: 1rem;
    font-weight: 700;
  }

  .set-beat {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }

  .property-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .property-row.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
  }

  .property-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem;
    font-weight: 500;
  }

  .quick-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .opening-note,
  .spot-hint {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .spot-block {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding-top: 0.6rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .spot-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0;
    color: var(--theme-text, white);
    font-size: 0.9rem;
    font-weight: 600;
  }

  .performer-badge {
    display: inline-flex;
    width: 1.75rem;
    height: 1.75rem;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    color: white;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .position-value {
    color: var(--theme-text, white);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .delete-btn {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem 1rem;
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 0.5rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: var(--semantic-error, #ef4444);
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 150ms ease;
  }

  .delete-btn:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 50%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 25%,
      transparent
    );
  }

  @media (prefers-reduced-motion: reduce) {
    .delete-btn {
      transition: none;
    }
  }
</style>
