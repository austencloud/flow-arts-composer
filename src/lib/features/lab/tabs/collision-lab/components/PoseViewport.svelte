<script lang="ts">
  /**
   * PoseViewport
   *
   * Renders the current collision-lab pose inside the shared Scene3D -
   * the same scene used by the sequence viewer, so we get the forest
   * environment, grid planes, orbit controls, and lighting for free.
   *
   * The scene graph mirrors PerformerRig's structure:
   *
   *   Scene3D (owns camera, environment, grid visual)
   *     rig T.Group [footOffset, facing]
   *       Avatar3D (rig-local position=0)
   *       grid-forward T.Group [z=gridOffset]
   *         blue PropAnchor T.Group [grid-local pos]
   *           Prop3D (blue)
   *         red PropAnchor T.Group [grid-local pos]
   *           Prop3D (red)
   *
   * This nesting is the whole trick for correct IK. Avatar3D reads the
   * PropAnchor refs' world positions as IK targets, and Three.js computes
   * those via the transform chain - so the props always sit on the visible
   * grid regardless of where the avatar is standing or which way it faces.
   *
   * Scene3D also gets `characterPositions=[footOffset]` so its internal Grid3D
   * visual is rendered at the same rig-root offset we use for props.
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
  import type { CollisionEvent } from "@austencloud/scene-3d";
  import { Plane } from "@austencloud/scene-3d";
  import type {
    DiamondPosition,
    CollisionSnapshot,
    CollisionSnapshotZone,
    SnapshotSeverity,
  } from "../domain/types";
  import { getCollisionLabContext } from "../context/collision-lab-context";
  import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
  import { setSceneFeatureContext } from "#lib/shared/3d/scene-features/context/scene-feature-context.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

  const labCtx = getCollisionLabContext();
  const sceneFeatureState = createSceneFeatureState({ audience: true });
  setSceneFeatureContext(sceneFeatureState);

  /**
   * Wall-plane grid sits 30cm forward of the performer's body. This is the
   * standard TKA convention: when you spin in wall plane, the plane is in
   * front of your eyes, not slicing through you. Matches Scene3D + PerformerRig.
   */
  const GRID_FORWARD_OFFSET = STAGE.AVATAR_GRID_OFFSET; // 0.3 m

  const POSITION_TO_GRID: Record<DiamondPosition, GridLocation> = {
    N: GridLocation.NORTH,
    E: GridLocation.EAST,
    S: GridLocation.SOUTH,
    W: GridLocation.WEST,
  };

  /**
   * Build a PropState3D for a hand target. The worldPosition is in
   * GRID-LOCAL space (the parent T.Group adds the grid-forward offset).
   *
   * The staff rotation is derived from the OrientationMapper:
   *   in  (radial)     → staffAngle = centerPathAngle + π
   *   out (antiradial) → staffAngle = centerPathAngle
   *
   * centerPathAngle comes from LOCATION_ANGLES for the cardinal position
   * (e.g. NORTH = -π/2). This is the same pipeline the sequence viewer
   * uses, so staff visuals match everywhere.
   */
  function buildPropState(
    plane: Plane,
    position: DiamondPosition,
    orientation: "in" | "out"
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

  const leftPropState = $derived.by<PropState3D | null>(() => {
    const pose = labCtx.state.currentPose;
    if (!pose) return null;
    return buildPropState(
      pose.leftHand.plane,
      pose.leftHand.position,
      pose.leftHand.orientation
    );
  });

  const rightPropState = $derived.by<PropState3D | null>(() => {
    const pose = labCtx.state.currentPose;
    if (!pose) return null;
    return buildPropState(
      pose.rightHand.plane,
      pose.rightHand.position,
      pose.rightHand.orientation
    );
  });

  /**
   * Show the grid for both hands' planes. For same-plane poses this is
   * a single plane; for cross-plane poses (the main reason this lab
   * exists) it's two planes - a wall + wheel intersection, for example.
   */
  const visiblePlanes = $derived.by<Set<Plane>>(() => {
    const pose = labCtx.state.currentPose;
    if (!pose) return new Set();
    return new Set([pose.leftHand.plane, pose.rightHand.plane]);
  });

  // The reviewer drives these live via sliders in StanceControls. Because
  // foot IK is disabled, translating the rig root moves the whole body
  // rigidly (feet, hips, torso, arms). The props and grid stay fixed in
  // world space, so the performer walks around them.
  //
  // Y is lifted by STAGE.STAGE_DECK_HEIGHT so the avatar's feet land on
  // the raised wooden stage deck instead of the bare ground below.
  const footOffset = $derived({
    x: labCtx.state.footOffsetX,
    y: STAGE.STAGE_DECK_HEIGHT,
    z: labCtx.state.footOffsetZ,
  });
  const facingAngle = $derived(labCtx.state.rootYawRad);
  const spinePitchOffset = $derived(labCtx.state.spinePitchRad);

  // Scene3D's characterPositions drives where its Grid3D visual is rendered.
  // We want the grid to stay in world XZ (performer walks around it)
  // but to be lifted onto the stage deck alongside the performer,
  // otherwise the avatar's hands reach for prop targets floating below
  // the deck. Y tracks STAGE.STAGE_DECK_HEIGHT just like the rig root.
  const gridAnchorPositions = [
    { x: 0, y: STAGE.STAGE_DECK_HEIGHT, z: 0, facingAngle: 0 },
  ];

  // PropAnchor refs - Avatar3D reads world positions from these for IK.
  let leftPropAnchorRef = $state<Group | undefined>(undefined);
  let rightPropAnchorRef = $state<Group | undefined>(undefined);

  const SEVERITY_RANK: Record<"graze" | "clip" | "penetrate", number> = {
    graze: 1,
    clip: 2,
    penetrate: 3,
  };

  function handleCollisionEvents(events: CollisionEvent[]) {
    if (!events || events.length === 0) {
      labCtx.state.updateCollision({ severity: "clear", zones: [] });
      return;
    }
    let worst = events[0]!;
    for (const e of events) {
      if (SEVERITY_RANK[e.severity] > SEVERITY_RANK[worst.severity]) worst = e;
    }
    const zones: CollisionSnapshotZone[] = events.map((e) => ({
      type: e.zone,
      depthCm: e.penetrationDepth * 100,
      description: e.description,
    }));
    const snapshot: CollisionSnapshot = {
      severity: worst.severity as SnapshotSeverity,
      zones,
    };
    labCtx.state.updateCollision(snapshot);
  }
</script>

<div class="pose-viewport">
  <!--
    Camera sits upstage of the performer (negative Z + elevated) so the
    view looks forward past the avatar toward the downstage audience.
    The default `perspective` preset sits downstage-right, which means
    the seated audience arc is literally behind the camera and invisible.
    A director's-view angle from behind fixes that and also makes the
    "performer facing the audience" relationship read at a glance.
  -->
  <Scene3D
    cameraPreset="perspective"
    customCameraPosition={[2.2, 2.8, -4.0]}
    customCameraTarget={[0, 0.2, 1.1]}
    showGrid={true}
    showLabels={false}
    {visiblePlanes}
    characterPositions={gridAnchorPositions}
    backgroundType={BackgroundType.FOREST}
  >
    {#snippet children()}
      <!-- Rig root: positions the performer at the stance's footOffset. -->
      <T.Group
        position={[footOffset.x, footOffset.y, footOffset.z]}
        rotation.y={facingAngle}
      >
        {#if leftPropState && rightPropState}
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
            onCollisionEvents={handleCollisionEvents}
          />
        {/if}

        <!--
          Grid-forward offset group: everything beneath this is in
          "grid-local" space, matching Scene3D's internal grid positioning.
          Props placed at plane-mapper local coordinates end up on the
          visible grid because this group is at +gridOffset from the rig.

          BUT: since Scene3D renders its grid at its own origin (not at
          rig root + gridOffset), we'd double up the offset if we nested
          our props under the rig. So instead, we keep this group at the
          SAME world position as Scene3D's grid - by NOT applying the rig
          transform. That means props at grid-local coordinates line up.
        -->
      </T.Group>

      <!--
        Props live in WORLD space (not inside the rig) so they stay fixed
        relative to Scene3D's grid as the performer walks around.
        Scene3D's grid is rendered at y=STAGE_DECK_HEIGHT z=gridOffset
        from its avatar anchor, so our prop anchors match that Y to
        keep the target rings sitting on the raised deck.
      -->
      <T.Group position={[0, STAGE.STAGE_DECK_HEIGHT, GRID_FORWARD_OFFSET]}>
        {#if leftPropState}
          <T.Group
            bind:ref={leftPropAnchorRef}
            position.x={leftPropState.worldPosition.x}
            position.y={leftPropState.worldPosition.y}
            position.z={leftPropState.worldPosition.z}
          >
            <Prop3D propType={toScenePropType(PropType.STAFF)} propState={leftPropState} color="blue" />
          </T.Group>
        {/if}
        {#if rightPropState}
          <T.Group
            bind:ref={rightPropAnchorRef}
            position.x={rightPropState.worldPosition.x}
            position.y={rightPropState.worldPosition.y}
            position.z={rightPropState.worldPosition.z}
          >
            <Prop3D propType={toScenePropType(PropType.STAFF)} propState={rightPropState} color="red" />
          </T.Group>
        {/if}
      </T.Group>
    {/snippet}
  </Scene3D>
</div>

<style>
  .pose-viewport {
    width: 100%;
    height: 100%;
    /* No min-height: the parent grid cell dictates size so the viewer
       shares vertical space with the candidate grid in split-screen
       layout. The Scene3D container also needs its default min-height
       override so this constraint actually takes effect. */
    background: var(--theme-panel-bg);
    border-radius: 8px;
    overflow: hidden;
  }
  .pose-viewport :global(.scene-container) {
    min-height: 0;
    height: 100%;
  }
</style>
