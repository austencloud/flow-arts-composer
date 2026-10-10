<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { SpatialLabState } from "../state/spatial-lab-state.svelte";
  import Scene3D from "#lib/shared/3d/components/Scene3D.svelte";
  import { Avatar3D, Prop3D, STAGE, WALL_OFFSET } from "@austencloud/scene-3d";
  import { T } from "@threlte/core";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { snapToNearestGridLocation } from "../services/grid-snap";
  import { Vector3, type Group } from "three";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";

  interface Props {
    state: SpatialLabState;
  }

  let { state: labState }: Props = $props();
  let rafId: number;
  let leftPropAnchorRef = $state<Group | undefined>(undefined);
  let rightPropAnchorRef = $state<Group | undefined>(undefined);

  const backgroundType = $derived(
    settingsService.settings.backgroundType ?? BackgroundType.COSMIC,
  );

  const gridOffset = -WALL_OFFSET;

  function handleMeshClick(meshName: string, _point: { x: number; y: number; z: number }) {
    if (labState.mode === "sequence") return;
    const lcName = meshName.toLowerCase();
    if (lcName.includes("blue") || lcName.includes("staff_blue") || lcName.includes("prop_blue")) {
      labState.draggingSide = "left";
    } else if (lcName.includes("red") || lcName.includes("staff_red") || lcName.includes("prop_red")) {
      labState.draggingSide = "right";
    }
  }

  function handleDrag(position: { x: number; z: number }) {
    if (!labState.draggingSide) return;
    const dragPoint = new Vector3(position.x, 0, position.z);
    const nearest = snapToNearestGridLocation(dragPoint, labState.activePlane);
    labState.setLocation(labState.draggingSide, nearest);
  }

  function handlePointerUp() {
    labState.draggingSide = null;
  }

  function tick() {
    labState.tick();
    rafId = requestAnimationFrame(tick);
  }

  onMount(() => { rafId = requestAnimationFrame(tick); });
  onDestroy(() => { cancelAnimationFrame(rafId); });
</script>

<div class="scene-container">
  <Scene3D
    cameraPreset={labState.cameraPreset}
    showGrid={labState.showGrid}
    showLabels={labState.showLabels}
    showStage={labState.showStage}
    visiblePlanes={labState.visiblePlanes}
    characterPositions={[{ x: 0, y: STAGE.STAGE_DECK_HEIGHT, z: 0 }]}
    {backgroundType}
    disableOrbitControls={labState.draggingSide !== null}
    isDragging={labState.draggingSide !== null}
    onMeshClick={handleMeshClick}
    onDrag={handleDrag}
    onPointerUp={handlePointerUp}
  >
    {#snippet children()}
      <!-- PerformerRig-equivalent hierarchy:
           Root at stage height (no Z offset — avatar stands behind the grid).
           HandAnchor groups push props forward by gridOffset (0.3m).
           Avatar3D at z=0 so arms reach forward to the grid. -->
      <T.Group position={[0, STAGE.STAGE_DECK_HEIGHT, 0]}>
        <!-- Blue HandAnchor + PropAnchor -->
        <T.Group position.z={gridOffset}>
          <T.Group
            bind:ref={leftPropAnchorRef}
            position={[
              labState.leftPropState.worldPosition.x,
              labState.leftPropState.worldPosition.y,
              labState.leftPropState.worldPosition.z,
            ]}
          >
            <Prop3D
              propType={toScenePropType(PropType.STAFF)}
              propState={labState.leftPropState}
              color="blue"
            />
          </T.Group>
        </T.Group>
        <!-- Red HandAnchor + PropAnchor -->
        <T.Group position.z={gridOffset}>
          <T.Group
            bind:ref={rightPropAnchorRef}
            position={[
              labState.rightPropState.worldPosition.x,
              labState.rightPropState.worldPosition.y,
              labState.rightPropState.worldPosition.z,
            ]}
          >
            <Prop3D
              propType={toScenePropType(PropType.STAFF)}
              propState={labState.rightPropState}
              color="red"
            />
          </T.Group>
        </T.Group>
        <Avatar3D
          leftPropState={labState.leftPropState}
          rightPropState={labState.rightPropState}
          {leftPropAnchorRef}
          {rightPropAnchorRef}
          position={{ x: 0, y: 0, z: 0 }}
          facingAngle={labState.facingAngle}
        />
      </T.Group>
    {/snippet}
  </Scene3D>
</div>

<style>
  .scene-container {
    flex: 1;
    min-width: 0;
    min-height: 300px;
  }
</style>
