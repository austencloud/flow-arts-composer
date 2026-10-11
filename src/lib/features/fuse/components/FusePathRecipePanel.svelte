<script lang="ts">
  import GenerationStylePanel from "#lib/shared/create/components/GenerationStylePanel.svelte";
  import { DEFAULT_GENERATION_STYLE } from "#lib/shared/create/domain/generation-style.js";
  import { startOrientationsForLevel } from "#lib/features/create/generate/domain/level-orientation-policy.js";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    Orientation,
    type Orientation as OrientationValue,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { getFuseContext } from "../context/fuse-context";
  import type { SoloLoopTraversalDirection } from "../services/solo-loop-generator";
  import FuseRecipeChoiceField from "./FuseRecipeChoiceField.svelte";

  type RecipeSection = "style" | "starting";
  type LocationChoice = "random" | GridLocation;
  type OrientationChoice = "random" | OrientationValue;
  type TraversalChoice = "random" | SoloLoopTraversalDirection;

  let {
    section,
    presentation = "drawer",
  }: {
    section: RecipeSection;
    presentation?: "drawer" | "modal" | "popover";
  } = $props();
  const { state: fuseState } = getFuseContext();

  const diamondLocationOptions = [
    { value: "random", label: "Random", shortLabel: "Any" },
    { value: GridLocation.NORTH, label: "North", shortLabel: "N" },
    { value: GridLocation.EAST, label: "East", shortLabel: "E" },
    { value: GridLocation.SOUTH, label: "South", shortLabel: "S" },
    { value: GridLocation.WEST, label: "West", shortLabel: "W" },
  ] as const;
  const boxLocationOptions = [
    { value: "random", label: "Random", shortLabel: "Any" },
    { value: GridLocation.NORTHEAST, label: "Northeast", shortLabel: "NE" },
    { value: GridLocation.SOUTHEAST, label: "Southeast", shortLabel: "SE" },
    { value: GridLocation.SOUTHWEST, label: "Southwest", shortLabel: "SW" },
    { value: GridLocation.NORTHWEST, label: "Northwest", shortLabel: "NW" },
  ] as const;
  const orientationCatalog = [
    { value: Orientation.IN, label: "In" },
    { value: Orientation.OUT, label: "Out" },
    { value: Orientation.CLOCK, label: "Clock" },
    {
      value: Orientation.COUNTER,
      label: "Counter",
    },
  ] as const;
  const traversalOptions = [
    { value: "random", label: "Random", shortLabel: "Any" },
    { value: "clockwise", label: "Clockwise", shortLabel: "CW" },
    {
      value: "counterclockwise",
      label: "Counterclockwise",
      shortLabel: "CCW",
    },
  ] as const;

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const locationChoice = $derived<LocationChoice>(
    fuseState.startLocation ?? "random"
  );
  const orientationChoice = $derived<OrientationChoice>(
    fuseState.startOrientation ?? "random"
  );
  const traversalChoice = $derived<TraversalChoice>(
    fuseState.traversalDirection ?? "random"
  );
  const locationOptions = $derived(
    fuseState.gridMode === GridMode.BOX
      ? boxLocationOptions
      : diamondLocationOptions
  );
  const orientationOptions = $derived([
    {
      value: "random" as const,
      label: "Random",
      shortLabel: "Any",
    },
    ...orientationCatalog.filter((option) =>
      startOrientationsForLevel(fuseState.generationLevel).includes(
        option.value
      )
    ),
  ]);
  function selectLocation(value: LocationChoice): void {
    fuseState.setStartLocation(value === "random" ? null : value);
  }

  function selectOrientation(value: OrientationChoice): void {
    fuseState.setStartOrientation(value === "random" ? null : value);
  }

  function selectTraversal(value: TraversalChoice): void {
    fuseState.setTraversalDirection(value === "random" ? null : value);
  }
</script>

{#if section === "style"}
  <div
    class="drill-fill detail-stack"
    class:modal-detail={presentation === "modal"}
    class:popover-detail={presentation === "popover"}
  >
    <GenerationStylePanel
      constraintPreset={fuseState.constraintPreset}
      handPathMode={fuseState.handPathMode}
      motionTypeFilter={fuseState.motionTypeFilter}
      baseline={DEFAULT_GENERATION_STYLE}
      haptic={null}
      onPropsChange={fuseState.setConstraintPreset}
      onHandsChange={fuseState.setHandPathMode}
      onDashesChange={(value) =>
        fuseState.setMotionTypeFilter(value === "mixed" ? null : value)}
    />
  </div>
{:else}
  <div
    class="drill-fill recipe-stage"
    class:modal-detail={presentation === "modal"}
    class:popover-detail={presentation === "popover"}
  >
    <div class="recipe-grid starting-grid">
      <FuseRecipeChoiceField
        title="Start point"
        options={locationOptions.map((option) => ({
          ...option,
          disabled,
        }))}
        value={locationChoice}
        onchange={selectLocation}
        ariaLabel="Generated LOOP start point"
      />
      <FuseRecipeChoiceField
        title="Prop orientation"
        options={orientationOptions.map((option) => ({
          ...option,
          disabled,
        }))}
        value={orientationChoice}
        onchange={selectOrientation}
        ariaLabel="Generated LOOP start orientation"
      />
      <FuseRecipeChoiceField
        title="Travel"
        options={traversalOptions.map((option) => ({
          ...option,
          disabled,
        }))}
        value={traversalChoice}
        onchange={selectTraversal}
        ariaLabel="Generated LOOP traversal direction"
      />
    </div>
  </div>
{/if}

<style>
  .recipe-stage {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: clamp(0.5rem, 2.5cqh, 2rem) 0;
  }

  .recipe-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(0.55rem, 1.5cqh, 0.9rem);
    width: 100%;
    max-width: 32rem;
  }

  .starting-grid {
    grid-template-rows: repeat(3, minmax(5.5rem, auto));
  }

  .detail-stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }

  .detail-stack :global(.style-panel) {
    flex: 0 0 auto;
    justify-content: flex-start;
  }

  .detail-stack.modal-detail {
    justify-content: center;
    width: min(100%, 72rem);
    margin-inline: auto;
    padding: clamp(1rem, 4cqh, 3rem);
  }

  .recipe-stage.modal-detail {
    align-items: center;
    padding: clamp(0.75rem, 2cqh, 1.5rem) 0;
  }

  .modal-detail .recipe-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: minmax(7rem, auto);
    max-width: 72rem;
  }

  .detail-stack.popover-detail {
    width: 100%;
    padding: 0.25rem;
  }

  .recipe-stage.popover-detail {
    align-items: stretch;
    padding: 0;
  }

  .popover-detail .recipe-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: minmax(7rem, auto);
    max-width: none;
  }

  @media (max-width: 560px) {
    .recipe-stage {
      align-items: flex-start;
      padding: 0.25rem 0 0.75rem;
    }

    .recipe-grid {
      gap: 0.6rem;
    }

    .starting-grid {
      grid-template-rows: repeat(3, minmax(5.25rem, auto));
    }
  }
</style>
