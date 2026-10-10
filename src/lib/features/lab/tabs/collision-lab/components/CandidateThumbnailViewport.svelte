<script lang="ts">
  /**
   * CandidateThumbnailViewport
   *
   * A small, standalone 3D viewport that renders the avatar + two props
   * at a specific stance. Unlike `PoseViewport`, this component takes the
   * stance and hand definitions as props instead of reading them from
   * the collision-lab context - so six instances can coexist on the page,
   * each showing a different candidate stance for the same pose.
   *
   * Used as the content of a `CandidateCard`. The parent card is
   * responsible for sizing, border, title, and click handling; this
   * component is just the 3D rectangle.
   *
   * Orbit controls are disabled so a tap on the card can be handled by
   * the card's click handler rather than stolen by the camera. Collision
   * detection is also disabled - the card shows the pre-computed sim
   * result via a status pill, not a live collision readout.
   */

  import { T } from "@threlte/core";
  import { Group } from "three";
  import Scene3D from "#lib/shared/3d/components/Scene3D.svelte";
  import { Avatar3D } from "@austencloud/scene-3d";
  import { Prop3D } from "@austencloud/scene-3d";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    gridLocationToPosition3D,
    calculatePropRotation,
  } from "#lib/shared/3d/services/plane-coordinate-mapper.js";
  import { mapOrientationToAngle } from "#lib/shared/3d/services/orientation-mapper.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { STAGE } from "@austencloud/scene-3d";
  import type { PropState3D } from "@austencloud/scene-3d";
  import { Plane } from "@austencloud/scene-3d";
  import type { DiamondPosition, HandOrientation, StancePose } from "../domain/types";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

  interface Props {
    stance: StancePose;
    leftPlane: Plane;
    leftPosition: DiamondPosition;
    leftOrientation: HandOrientation;
    rightPlane: Plane;
    rightPosition: DiamondPosition;
    rightOrientation: HandOrientation;
  }

  let {
    stance,
    leftPlane,
    leftPosition,
    leftOrientation,
    rightPlane,
    rightPosition,
    rightOrientation,
  }: Props = $props();


  const GRID_FORWARD_OFFSET = STAGE.AVATAR_GRID_OFFSET; // 0.3 m

  const POSITION_TO_GRID: Record<DiamondPosition, GridLocation> = {
    N: GridLocation.NORTH,
    E: GridLocation.EAST,
    S: GridLocation.SOUTH,
    W: GridLocation.WEST,
  };

  /**
   * Build a PropState3D for a hand target. Identical logic to the main
   * PoseViewport so thumbnails and the big viewer place props the same
   * way when showing the same pose.
   */
  function buildPropState(
    plane: Plane,
    position: DiamondPosition,
    orientation: HandOrientation
  ): PropState3D {
    const loc = POSITION_TO_GRID[position];
    const centerPathAngle = LOCATION_ANGLES[loc];
    const staffAngle = mapOrientationToAngle(
      orientation === "in" ? Orientation.IN : Orientation.OUT,
      centerPathAngle
    );
    const worldPosition = gridLocationToPosition3D(plane, loc);
    const worldRotation = calculatePropRotation(plane, staffAngle);
    return {
      centerPathAngle,
      staffRotationAngle: staffAngle,
      plane,
      worldPosition,
      worldRotation,
    };
  }

  const leftPropState = $derived(
    buildPropState(leftPlane, leftPosition, leftOrientation)
  );
  const rightPropState = $derived(
    buildPropState(rightPlane, rightPosition, rightOrientation)
  );

  const visiblePlanes = $derived(new Set<Plane>([leftPlane, rightPlane]));

  // Lift the rig root onto the stage deck so the avatar's feet stand
  // on top of the raised wooden platform instead of the bare ground.
  const footOffset = $derived({
    x: stance.footOffsetX,
    y: STAGE.STAGE_DECK_HEIGHT,
    z: stance.footOffsetZ,
  });
  const facingAngle = $derived(stance.rootYawRad);
  const spinePitchOffset = $derived(stance.spinePitchRad);

  // Scene3D expects an anchor for its internal Grid3D visual. Single
  // anchor on the stage deck (raised by STAGE_DECK_HEIGHT) so the grid
  // sits on top of the wooden platform alongside the performer.
  const gridAnchorPositions = [
    { x: 0, y: STAGE.STAGE_DECK_HEIGHT, z: 0, facingAngle: 0 },
  ];

  /**
   * Close-up camera framing for the thumbnail. The default `perspective`
   * preset sits at ~4m from origin, which is appropriate for the big
   * viewer but leaves the avatar tiny in a small card. We override with
   * a ~1.9m orbit radius and raise the target to the avatar's upper
   * torso so the body fills the frame.
   */
  const THUMB_CAMERA_POSITION: [number, number, number] = [1.7, 1.5, 1.7];
  const THUMB_CAMERA_TARGET: [number, number, number] = [0, 1.0, 0];

  // PropAnchor refs - Avatar3D reads world positions from these for IK.
  let leftPropAnchorRef = $state<Group | undefined>(undefined);
  let rightPropAnchorRef = $state<Group | undefined>(undefined);
</script>

<div class="thumbnail-viewport">
  <Scene3D
    cameraPreset="perspective"
    customCameraPosition={THUMB_CAMERA_POSITION}
    customCameraTarget={THUMB_CAMERA_TARGET}
    showGrid={true}
    showLabels={false}
    {visiblePlanes}
    characterPositions={gridAnchorPositions}
    backgroundType={BackgroundType.FOREST}
    disableOrbitControls={true}
  >
    {#snippet children()}
      <!-- Rig root: positions the performer at the stance's footOffset. -->
      <T.Group
        position={[footOffset.x, footOffset.y, footOffset.z]}
        rotation.y={facingAngle}
      >
        <Avatar3D
          {leftPropState}
          {rightPropState}
          position={{ x: 0, y: 0, z: 0 }}
          facingAngle={0}
          {spinePitchOffset}
          visible={true}
          isActive={false}
          enableLocomotion={false}
          {leftPropAnchorRef}
          {rightPropAnchorRef}
        />
      </T.Group>

      <!--
        Props live in world space (not inside the rig) so they stay
        fixed relative to the grid as the performer walks around.
        Y matches STAGE_DECK_HEIGHT so prop targets sit on the deck.
      -->
      <T.Group position={[0, STAGE.STAGE_DECK_HEIGHT, GRID_FORWARD_OFFSET]}>
        <T.Group
          bind:ref={leftPropAnchorRef}
          position.x={leftPropState.worldPosition.x}
          position.y={leftPropState.worldPosition.y}
          position.z={leftPropState.worldPosition.z}
        >
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={leftPropState}
            color="blue"
          />
        </T.Group>
        <T.Group
          bind:ref={rightPropAnchorRef}
          position.x={rightPropState.worldPosition.x}
          position.y={rightPropState.worldPosition.y}
          position.z={rightPropState.worldPosition.z}
        >
          <Prop3D
            propType={toScenePropType(PropType.STAFF)}
            propState={rightPropState}
            color="red"
          />
        </T.Group>
      </T.Group>
    {/snippet}
  </Scene3D>
</div>

<style>
  .thumbnail-viewport {
    width: 100%;
    height: 100%;
    /* Click-through the canvas so the parent card captures clicks. */
    pointer-events: none;
  }
  /*
    Scene3D's default .scene-container enforces min-height: 400px, which
    is fine for the big viewer but blows out small thumbnails. Override
    it here so the Scene3D fills its thumbnail slot exactly.
  */
  .thumbnail-viewport :global(.scene-container) {
    min-height: 0;
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .thumbnail-viewport :global(canvas) {
    width: 100% !important;
    height: 100% !important;
    display: block;
  }
</style>
