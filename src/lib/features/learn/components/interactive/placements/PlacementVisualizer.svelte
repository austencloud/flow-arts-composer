<!--
PlacementVisualizer - Renders a real pictograph showing a static placement.
Uses PictographContainer (the actual pictograph renderer) instead of custom SVG.
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    HandSide,
    MotionType,
    Orientation,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

  type HandPosition = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
  type PlacementType = "alpha" | "beta" | "gamma";

  let {
    leftHand = "N",
    rightHand = "S",
    gridMode = GridMode.DIAMOND,
    showLetter = true,
  }: {
    leftHand?: HandPosition;
    rightHand?: HandPosition;
    gridMode?: GridMode;
    showLetter?: boolean;
  } = $props();

  // Map HandPosition strings to GridLocation enum values
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

  // Placement type detection
  const OPPOSITE_PAIRS: Record<string, string> = {
    N: "S",
    S: "N",
    E: "W",
    W: "E",
    NE: "SW",
    SW: "NE",
    NW: "SE",
    SE: "NW",
  };

  const placementType: PlacementType = $derived.by(() => {
    if (leftHand === rightHand) return "beta";
    if (OPPOSITE_PAIRS[leftHand] === rightHand) return "alpha";
    return "gamma";
  });

  // Map placement type to the Type 6 static letter
  const PLACEMENT_LETTER: Record<PlacementType, Letter> = {
    alpha: Letter.ALPHA,
    beta: Letter.BETA,
    gamma: Letter.GAMMA,
  };

  // Build PictographData from hand placements
  const pictographData: PictographData = $derived.by(() => ({
    id: "placement-visualizer",
    letter: showLetter ? PLACEMENT_LETTER[placementType] : null,
    startPlacement: null,
    endPlacement: null,
    gridMode,
    motions: {
      left: createMotionData({
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: HAND_TO_LOCATION[leftHand],
        endLocation: HAND_TO_LOCATION[leftHand],
        turns: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        isVisible: true,
        propType: PropType.HAND,
        arrowLocation: HAND_TO_LOCATION[leftHand],
        hand: HandSide.LEFT,
        gridMode,
      }),
      right: createMotionData({
        motionType: MotionType.STATIC,
        rotationDirection: RotationDirection.NO_ROTATION,
        startLocation: HAND_TO_LOCATION[rightHand],
        endLocation: HAND_TO_LOCATION[rightHand],
        turns: 0,
        startOrientation: Orientation.IN,
        endOrientation: Orientation.IN,
        isVisible: true,
        propType: PropType.HAND,
        arrowLocation: HAND_TO_LOCATION[rightHand],
        hand: HandSide.RIGHT,
        gridMode,
      }),
    },
  }));
</script>

<div class="placement-visualizer">
  <PictographContainer
    {pictographData}
    {gridMode}
    showTKA={showLetter}
    showReversals={false}
    showTnD={false}
    showElemental={false}
    showPlacements={false}
    disableTransitions={true}
    cellIndex={0}
    leftPropTypeOverride={PropType.HAND}
    rightPropTypeOverride={PropType.HAND}
  />
</div>

<style>
  .placement-visualizer {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    max-width: 320px;
    aspect-ratio: 1;
  }
</style>
