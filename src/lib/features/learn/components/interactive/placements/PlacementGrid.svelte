<!--
  Learn adapter for the shared ordered placement interaction.

  The lesson keeps its hand vocabulary and semantic guide lines while Construct
  can render the user's selected props through the same interaction core.
-->
<script lang="ts">
  import PropPlacementGrid from "$lib/shared/pictograph/grid/components/PropPlacementGrid.svelte";
  import {
    GridLocation,
    type GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { HandPosition } from "../../../domain/constants/placement-quiz-data";

  interface PlacementGridProps {
    gridMode: GridMode;
    onPlacementComplete: (left: HandPosition, right: HandPosition) => void;
    disabled?: boolean;
    showGuideLines?: boolean;
    guideLineType?: "alpha" | "beta" | "gamma";
    guideLinePoints?: { left: HandPosition; right: HandPosition };
  }

  let {
    gridMode,
    onPlacementComplete,
    disabled = false,
    showGuideLines = false,
    guideLineType,
    guideLinePoints,
  }: PlacementGridProps = $props();

  const HAND_TO_LOCATION: Record<HandPosition, GridLocation> = {
    N: GridLocation.NORTH,
    E: GridLocation.EAST,
    S: GridLocation.SOUTH,
    W: GridLocation.WEST,
    NE: GridLocation.NORTHEAST,
    SE: GridLocation.SOUTHEAST,
    SW: GridLocation.SOUTHWEST,
    NW: GridLocation.NORTHWEST,
  };

  const LOCATION_TO_HAND: Partial<Record<GridLocation, HandPosition>> = {
    [GridLocation.NORTH]: "N",
    [GridLocation.EAST]: "E",
    [GridLocation.SOUTH]: "S",
    [GridLocation.WEST]: "W",
    [GridLocation.NORTHEAST]: "NE",
    [GridLocation.SOUTHEAST]: "SE",
    [GridLocation.SOUTHWEST]: "SW",
    [GridLocation.NORTHWEST]: "NW",
  };

  const guideLineLocations = $derived(
    guideLinePoints
      ? {
          left: HAND_TO_LOCATION[guideLinePoints.left],
          right: HAND_TO_LOCATION[guideLinePoints.right],
        }
      : null
  );

  function handleComplete(
    leftLocation: GridLocation,
    rightLocation: GridLocation
  ) {
    const left = LOCATION_TO_HAND[leftLocation];
    const right = LOCATION_TO_HAND[rightLocation];
    if (left && right) {
      onPlacementComplete(left, right);
    }
  }
</script>

<PropPlacementGrid
  {gridMode}
  leftPropType={PropType.HAND}
  rightPropType={PropType.HAND}
  leftNoun="left hand"
  rightNoun="right hand"
  editAfterCompletion={false}
  {disabled}
  {showGuideLines}
  {guideLineType}
  {guideLineLocations}
  allowUndoAfterComplete={false}
  onPlacementComplete={handleComplete}
/>
