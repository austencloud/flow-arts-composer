<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { getSoloAuthoringContext } from "./solo-authoring-state.svelte.js";
  import { createSoloStart, handName } from "./construct-solo-proposal";
  const authoring = getSoloAuthoringContext();
  let orientationWidth = $state(0);
  const choices = $derived(
    getPlacementGridPoints(authoring.draft.gridMode).map((point) => ({
      ...point,
      pictograph: createSoloStart(
        authoring.activeHand,
        authoring.draft.gridMode,
        point.location,
        authoring.orientation
      ).startPlacement!,
    }))
  );
</script>

<div class="start-settings">
  {#if !authoring.reference}
    <SegmentedControl
      ariaLabel="Hand to build"
      semantics="radiogroup"
      value={authoring.activeHand}
      onchange={authoring.setHand}
      options={[
        { value: "left", label: "Blue", tone: "blue" },
        { value: "right", label: "Red", tone: "red" },
      ]}
    />
    <SegmentedControl
      ariaLabel="Starting grid"
      semantics="radiogroup"
      color="accent"
      value={authoring.draft.gridMode}
      onchange={authoring.setGrid}
      options={[
        { value: GridMode.DIAMOND, label: "Diamond" },
        { value: GridMode.BOX, label: "Box" },
      ]}
    />
  {/if}
  <div class="orientation" bind:clientWidth={orientationWidth}>
    <span>Starting orientation</span>
    <SegmentedControl
      ariaLabel="Starting orientation"
      columns={orientationWidth < 270 ? 2 : undefined}
      semantics="radiogroup"
      color={authoring.activeHand === "left" ? "blue" : "red"}
      value={authoring.orientation}
      onchange={authoring.setOrientation}
      options={[
        { value: Orientation.IN, label: "In" },
        { value: Orientation.OUT, label: "Out" },
        { value: Orientation.CLOCK, label: "Clock" },
        { value: Orientation.COUNTER, label: "Counter" },
      ]}
    />
  </div>
</div>
<div class="start-grid" aria-label="Starting location choices">
  {#each choices as choice (choice.location)}
    <button
      class="start-choice"
      onclick={() => authoring.start(choice.location)}
      aria-label={`Start ${handName(authoring.activeHand).toLowerCase()} at ${choice.label}`}
    >
      <span class="picture"
        ><PictographContainer
          pictographData={choice.pictograph}
          gridMode={authoring.draft.gridMode}
          disableTransitions
          stepNumberOverride={false}
        /></span
      >
      <span>{choice.label}</span>
    </button>
  {/each}
</div>

<style>
  .start-settings {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .orientation {
    grid-column: 1/-1;
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .start-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    min-height: 0;
    gap: 10px;
  }
  .start-choice {
    width: 100%;
    aspect-ratio: 1 / 1.12;
    max-height: 100%;
    align-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 8px;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    overflow: hidden;
  }
  .start-choice:hover {
    background: var(--theme-hover-bg, #26262d);
    border-color: var(--theme-text-dim);
  }
  .start-choice:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -3px;
  }
  .picture {
    display: block;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 290px;
    position: relative;
  }
  @media (max-height: 550px) and (min-width: 701px) {
    .start-settings {
      grid-template-columns: 1fr;
      align-content: start;
      gap: 6px;
    }
    .start-grid {
      gap: 6px;
    }
    .start-choice {
      padding: 4px;
      gap: 2px;
    }
  }
</style>
