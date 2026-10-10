<script lang="ts">
  import { T } from "@threlte/core";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    Avatar3D,
    Plane,
    Prop3D,
    STAGE,
    userProportionsState,
  } from "@austencloud/scene-3d";
  import type { Group } from "three";
  import Scene3D from "#lib/shared/3d/components/Scene3D.svelte";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import type {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { FanViewpoint } from "../domain/fan-relation-types";
  import {
    VIEWPOINT_CAMERA,
    buildFanPropState,
    getFanSceneLayout,
  } from "../services/fan-relation-geometry";

  interface Props {
    leftLocation: GridLocation;
    rightLocation: GridLocation;
    leftOrientation: Orientation;
    rightOrientation: Orientation;
    gridMode: GridMode;
    propType: PropType;
    presentationPlane: Plane;
    viewpoint: FanViewpoint;
  }

  let {
    leftLocation,
    rightLocation,
    leftOrientation,
    rightOrientation,
    gridMode,
    propType,
    presentationPlane,
    viewpoint,
  }: Props = $props();

  const sceneLayout = $derived(
    getFanSceneLayout({
      leftLocation,
      rightLocation,
      propType,
      basePropLength: userProportionsState.staffLength,
    })
  );

  const leftPropState = $derived(
    buildFanPropState({
      location: leftLocation,
      orientation: leftOrientation,
      gridMode,
      presentationPlane,
      handRadius: sceneLayout.handRadius,
    })
  );
  const rightPropState = $derived(
    buildFanPropState({
      location: rightLocation,
      orientation: rightOrientation,
      gridMode,
      presentationPlane,
      handRadius: sceneLayout.handRadius,
    })
  );
  const camera = $derived(VIEWPOINT_CAMERA[viewpoint]);
  const sceneGridMode = $derived<"diamond" | "box">(
    gridMode === "box" ? "box" : "diamond"
  );
  const visiblePlanes = new Set([Plane.WALL]);

  let leftPropAnchorRef = $state<Group | undefined>(undefined);
  let rightPropAnchorRef = $state<Group | undefined>(undefined);
</script>

<div class="scene-shell" aria-label="Spatial fan inspection">
  <Scene3D
    showGrid={gridMode !== "skewed"}
    showLabels={false}
    showStage
    showAudience={false}
    stageWidth={4.8}
    stageDepth={3.6}
    gridMode={sceneGridMode}
    gridSize={sceneLayout.gridSize}
    gridHandPointRadius={sceneLayout.handRadius}
    gridOuterPointRadius={sceneLayout.outerRadius}
    gridForwardOffset={sceneLayout.forwardOffset}
    {visiblePlanes}
    backgroundType={BackgroundType.VOID}
    customCameraPosition={camera.position}
    customCameraTarget={camera.target}
    characterPositions={[{ x: 0, y: STAGE.STAGE_DECK_HEIGHT, z: 0 }]}
  >
    {#snippet children()}
      <T.Group position={[0, STAGE.STAGE_DECK_HEIGHT, 0]}>
        <T.Group position.z={sceneLayout.forwardOffset}>
          <T.Group
            bind:ref={leftPropAnchorRef}
            position={[
              leftPropState.worldPosition.x,
              leftPropState.worldPosition.y,
              leftPropState.worldPosition.z,
            ]}
          >
            <Prop3D
              propType={toScenePropType(propType)}
              propState={leftPropState}
              color="blue"
            />
          </T.Group>

          <T.Group
            bind:ref={rightPropAnchorRef}
            position={[
              rightPropState.worldPosition.x,
              rightPropState.worldPosition.y,
              rightPropState.worldPosition.z,
            ]}
          >
            <Prop3D
              propType={toScenePropType(propType)}
              propState={rightPropState}
              color="red"
            />
          </T.Group>
        </T.Group>

        <Avatar3D
          {leftPropState}
          {rightPropState}
          {leftPropAnchorRef}
          {rightPropAnchorRef}
          position={{ x: 0, y: 0, z: 0 }}
          facingAngle={0}
        />
      </T.Group>
    {/snippet}
  </Scene3D>
</div>

<style>
  .scene-shell {
    width: 100%;
    height: 100%;
    min-height: 22rem;
    overflow: hidden;
    border-radius: var(--radius-lg, 16px);
    background: var(--theme-surface-dark, #080811);
  }

  .scene-shell :global(.scene-container) {
    min-height: 100%;
    border-radius: inherit;
  }

  @container (max-height: 620px) {
    .scene-shell {
      min-height: 18rem;
    }
  }
</style>
