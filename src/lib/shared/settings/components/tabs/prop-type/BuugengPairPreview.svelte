<!--
  BuugengPairPreview.svelte

  One buugeng pair, drawn by the real pictograph renderer so the picture is
  exactly what the grid will show: both hands static on the south hand point
  with In orientation, the shared spot where chirality decides whether the two
  props stack into one figure eight or get the beta separation and sit side by
  side. The frame is cropped to the props so the difference reads at tile size.

  Decorative: the control that hosts it owns the accessible name.
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    HandSide,
    MotionType,
    Orientation,
    RotationDirection,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";

  let {
    propType,
    propLook,
    leftFlipped,
    rightFlipped,
    leftColor,
    rightColor,
    dimHand = null,
  }: {
    /** A buugeng-family prop. */
    propType: PropType;
    propLook?: PropLook;
    leftFlipped: boolean;
    rightFlipped: boolean;
    leftColor?: string;
    rightColor?: string;
    /** Draws this hand faintly, for a picker that sets only the other hand. */
    dimHand?: "left" | "right" | null;
  } = $props();

  // The 950-unit diamond grid's south hand point (static/images/grid/diamond_grid.svg).
  const GRID = 950;
  const HAND_X = 475;
  const HAND_Y = 618.1;
  // Artwork length along the prop's long axis, in grid units: the viewBox
  // width of static/images/props/{buugeng,bigbuugeng}.svg.
  const LENGTH: Partial<Record<PropType, number>> = {
    [PropType.BIGBUUGENG]: 600,
  };
  const DEFAULT_LENGTH = 262.6;

  const crop = $derived.by(() => {
    const length = LENGTH[propType] ?? DEFAULT_LENGTH;
    const height = Math.min(GRID, Math.max(length * 1.35, 320));
    const width = Math.min(GRID, height * 1.15);
    const x = Math.min(Math.max(HAND_X - width / 2, 0), GRID - width);
    const y = Math.min(Math.max(HAND_Y - height / 2, 0), GRID - height);
    return { x, y, width, height };
  });

  function pose(hand: HandSide) {
    return createMotionData({
      motionType: MotionType.STATIC,
      rotationDirection: RotationDirection.NO_ROTATION,
      startLocation: GridLocation.SOUTH,
      endLocation: GridLocation.SOUTH,
      turns: 0,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      isVisible: true,
      propType,
      arrowLocation: GridLocation.SOUTH,
      hand,
      gridMode: GridMode.DIAMOND,
    });
  }

  const pictographData: PictographData = $derived({
    id: `buugeng-pair-${propType}`,
    letter: Letter.BETA,
    startPlacement: null,
    endPlacement: null,
    gridMode: GridMode.DIAMOND,
    motions: { left: pose(HandSide.LEFT), right: pose(HandSide.RIGHT) },
  });
</script>

<div
  class="pair-crop"
  class:dim-left={dimHand === "left"}
  class:dim-right={dimHand === "right"}
  aria-hidden="true"
  style:aspect-ratio="{crop.width} / {crop.height}"
>
  <div
    class="pair-grid"
    style:width="{(GRID / crop.width) * 100}%"
    style:left="{(-crop.x / crop.width) * 100}%"
    style:top="{(-crop.y / crop.height) * 100}%"
  >
    <PictographContainer
      {pictographData}
      gridMode={GridMode.DIAMOND}
      poseOnly
      showArrow={false}
      showTKA={false}
      showTnD={false}
      showElemental={false}
      showPropTnD={false}
      showPlacements={false}
      showHandColorKey={false}
      showReversals={false}
      darkMode
      disableTransitions
      leftPropTypeOverride={propType}
      rightPropTypeOverride={propType}
      propLookOverride={propLook}
      leftBuugengFlippedOverride={leftFlipped}
      rightBuugengFlippedOverride={rightFlipped}
      leftColorOverride={leftColor}
      rightColorOverride={rightColor}
    />
  </div>
</div>

<style>
  .pair-crop {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: 10px;
    pointer-events: none;
  }

  .pair-grid {
    position: absolute;
    aspect-ratio: 1;
  }

  .pair-grid :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }

  .dim-left :global(.left-prop-svg),
  .dim-right :global(.right-prop-svg) {
    opacity: 0.35;
  }
</style>
