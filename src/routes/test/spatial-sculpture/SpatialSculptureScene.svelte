<script lang="ts">
  import { T } from "@threlte/core";
  import { BackgroundType } from "@austencloud/backgrounds";
  import { Plane, type Plane as PlaneValue } from "@austencloud/scene-3d";
  import { CatmullRomCurve3, DoubleSide, type Vector3 } from "three";
  import Scene3D from "$lib/shared/3d/components/Scene3D.svelte";
  import Grid3D from "$lib/shared/3d/components/Grid3D.svelte";
  import {
    getAllGridPlacements,
    gridLocationToPosition3D,
  } from "$lib/shared/3d/services/plane-coordinate-mapper";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import SpatialSculptureTracer from "./SpatialSculptureTracer.svelte";
  import {
    LOCATION_LABELS,
    LOCATION_ORDER,
    PLANE_LABELS,
    PRIMARY_PLANES,
    type PropSide,
    type SculptureMotionMode,
    type SculpturePreset,
    type SpatialBeat,
  } from "./spatial-sculpture-model";

  interface Props {
    beats: SpatialBeat[];
    activeBeatIndex: number;
    activeHand: PropSide;
    preset: SculpturePreset;
    showGrid: boolean;
    showNodes: boolean;
    showTrails: boolean;
    playing: boolean;
    motionMode: SculptureMotionMode;
    undulationDepth: number;
    undulationPeriod: number;
    onbeatselect: (index: number) => void;
    onplayheadbeat: (index: number) => void;
    onlocationselect: (location: GridLocation) => void;
  }

  interface CopyTransform {
    rotationY: number;
    scale: [number, number, number];
    opacity: number;
  }

  let {
    beats,
    activeBeatIndex,
    activeHand,
    preset,
    showGrid,
    showNodes,
    showTrails,
    playing,
    motionMode,
    undulationDepth,
    undulationPeriod,
    onbeatselect,
    onplayheadbeat,
    onlocationselect,
  }: Props = $props();

  const PATH_RADIUS = 0.86;
  const SCULPTURE_HEIGHT = 0.82;
  const visiblePlaneSet = new Set<PlaneValue>(PRIMARY_PLANES);
  let sculptureScale = $state(1);

  const activeBeat = $derived(beats[activeBeatIndex] ?? null);
  const activeColor = $derived(activeHand === "left" ? "#38a9ff" : "#ff516a");
  const activeLocation = $derived(
    activeBeat
      ? activeHand === "left"
        ? activeBeat.leftLocation
        : activeBeat.rightLocation
      : null
  );

  const leftPoints = $derived(
    beats.map((beat) =>
      gridLocationToPosition3D(beat.plane, beat.leftLocation, PATH_RADIUS)
    )
  );
  const rightPoints = $derived(
    beats.map((beat) =>
      gridLocationToPosition3D(beat.plane, beat.rightLocation, PATH_RADIUS)
    )
  );

  const leftCurve = $derived(
    leftPoints.length > 1
      ? new CatmullRomCurve3(leftPoints, true, "centripetal", 0.5)
      : null
  );
  const rightCurve = $derived(
    rightPoints.length > 1
      ? new CatmullRomCurve3(rightPoints, true, "centripetal", 0.5)
      : null
  );

  const copyTransforms = $derived.by((): CopyTransform[] => {
    if (preset === "solo") {
      return [{ rotationY: 0, scale: [1, 1, 1], opacity: 1 }];
    }

    if (preset === "mirror") {
      return [
        { rotationY: 0, scale: [1, 1, 1], opacity: 1 },
        { rotationY: 0, scale: [-1, 1, 1], opacity: 0.66 },
      ];
    }

    const count = preset === "acolyte" ? 6 : 8;
    return Array.from({ length: count }, (_, index) => ({
      rotationY: (index / count) * Math.PI * 2,
      scale: [1, 1, 1] as [number, number, number],
      opacity: index === 0 ? 0.95 : 0.42,
    }));
  });

  const targetPoints = $derived.by(
    (): { location: GridLocation; position: Vector3 }[] => {
      if (!activeBeat) return [];
      return Array.from(
        getAllGridPlacements(activeBeat.plane, PATH_RADIUS),
        ([location, position]) => ({ location, position })
      );
    }
  );

  function handleMeshClick(meshName: string): void {
    const beatMatch = /^spatial-beat-(\d+)$/.exec(meshName);
    if (beatMatch) {
      const index = Number(beatMatch[1]);
      if (Number.isInteger(index) && index >= 0 && index < beats.length) {
        onbeatselect(index);
      }
      return;
    }

    const targetPrefix = "spatial-target-";
    if (!meshName.startsWith(targetPrefix)) return;
    const location = meshName.slice(targetPrefix.length) as GridLocation;
    if (LOCATION_ORDER.includes(location)) onlocationselect(location);
  }

  function positionTuple(point: Vector3): [number, number, number] {
    return [point.x, point.y, point.z];
  }
</script>

<div class="scene-shell">
  <Scene3D
    showGrid={false}
    showLabels={false}
    showStage={false}
    backgroundType={BackgroundType.COSMIC}
    customCameraPosition={[2.75, 2.5, 3.45]}
    customCameraTarget={[0, SCULPTURE_HEIGHT, 0]}
    onMeshClick={handleMeshClick}
  >
    {#snippet children()}
      <T.Group position={[0, SCULPTURE_HEIGHT, 0]}>
        {#if showGrid}
          <Grid3D
            visiblePlanes={visiblePlaneSet}
            showLabels={false}
            planeOpacity={0.055}
            size={1.15}
          />
        {/if}

        {#if leftCurve && rightCurve}
          <T.Group scale={[sculptureScale, sculptureScale, sculptureScale]}>
            {#if showTrails}
              {#each copyTransforms as copy, index (`${preset}-${index}`)}
                <T.Group rotation={[0, copy.rotationY, 0]} scale={copy.scale}>
                  <T.Mesh>
                    <T.TubeGeometry args={[leftCurve, 128, 0.018, 10, true]} />
                    <T.MeshStandardMaterial
                      color="#38a9ff"
                      emissive="#0d3a78"
                      emissiveIntensity={1.35}
                      roughness={0.24}
                      metalness={0.12}
                      transparent
                      opacity={copy.opacity}
                      depthWrite={false}
                      side={DoubleSide}
                    />
                  </T.Mesh>
                  <T.Mesh>
                    <T.TubeGeometry args={[rightCurve, 128, 0.018, 10, true]} />
                    <T.MeshStandardMaterial
                      color="#ff516a"
                      emissive="#74162b"
                      emissiveIntensity={1.35}
                      roughness={0.24}
                      metalness={0.12}
                      transparent
                      opacity={copy.opacity}
                      depthWrite={false}
                      side={DoubleSide}
                    />
                  </T.Mesh>
                </T.Group>
              {/each}
            {/if}

            {#if showNodes}
              {#each beats as beat, index (beat.id)}
                {@const leftPoint = leftPoints[index]}
                {@const rightPoint = rightPoints[index]}
                {#if leftPoint && rightPoint}
                  <T.Mesh
                    name={`spatial-beat-${index}`}
                    position={positionTuple(leftPoint)}
                    renderOrder={6}
                  >
                    <T.SphereGeometry
                      args={[index === activeBeatIndex ? 0.072 : 0.045, 18, 18]}
                    />
                    <T.MeshBasicMaterial
                      color="#38a9ff"
                      transparent
                      opacity={index === activeBeatIndex ? 1 : 0.72}
                      depthWrite={false}
                    />
                  </T.Mesh>
                  <T.Mesh
                    name={`spatial-beat-${index}`}
                    position={positionTuple(rightPoint)}
                    renderOrder={6}
                  >
                    <T.SphereGeometry
                      args={[index === activeBeatIndex ? 0.072 : 0.045, 18, 18]}
                    />
                    <T.MeshBasicMaterial
                      color="#ff516a"
                      transparent
                      opacity={index === activeBeatIndex ? 1 : 0.72}
                      depthWrite={false}
                    />
                  </T.Mesh>
                {/if}
              {/each}

              {#each targetPoints as target (target.location)}
                <T.Mesh
                  name={`spatial-target-${target.location}`}
                  position={positionTuple(target.position)}
                  renderOrder={8}
                >
                  <T.SphereGeometry
                    args={[
                      target.location === activeLocation ? 0.09 : 0.066,
                      18,
                      18,
                    ]}
                  />
                  <T.MeshBasicMaterial
                    color={activeColor}
                    transparent
                    opacity={target.location === activeLocation ? 0.9 : 0.2}
                    wireframe={target.location !== activeLocation}
                    depthWrite={false}
                  />
                </T.Mesh>
              {/each}
            {/if}
          </T.Group>

          <SpatialSculptureTracer
            {leftCurve}
            {rightCurve}
            {beats}
            {activeBeatIndex}
            {activeHand}
            {playing}
            {motionMode}
            {undulationDepth}
            {undulationPeriod}
            {onplayheadbeat}
            onscalechange={(scale) => (sculptureScale = scale)}
          />
        {:else if showNodes}
          {#each beats as beat, index (beat.id)}
            {@const leftPoint = leftPoints[index]}
            {@const rightPoint = rightPoints[index]}
            {#if leftPoint && rightPoint}
              <T.Mesh
                name={`spatial-beat-${index}`}
                position={positionTuple(leftPoint)}
                renderOrder={6}
              >
                <T.SphereGeometry
                  args={[index === activeBeatIndex ? 0.072 : 0.045, 18, 18]}
                />
                <T.MeshBasicMaterial
                  color="#38a9ff"
                  transparent
                  opacity={index === activeBeatIndex ? 1 : 0.72}
                  depthWrite={false}
                />
              </T.Mesh>
              <T.Mesh
                name={`spatial-beat-${index}`}
                position={positionTuple(rightPoint)}
                renderOrder={6}
              >
                <T.SphereGeometry
                  args={[index === activeBeatIndex ? 0.072 : 0.045, 18, 18]}
                />
                <T.MeshBasicMaterial
                  color="#ff516a"
                  transparent
                  opacity={index === activeBeatIndex ? 1 : 0.72}
                  depthWrite={false}
                />
              </T.Mesh>
            {/if}
          {/each}
        {/if}
      </T.Group>
    {/snippet}
  </Scene3D>

  <div class="scene-hud" aria-live="polite">
    <div class="hud-primary">
      <span class="hud-step">Beat {activeBeatIndex + 1}</span>
      <span class="motion-badge" data-mode={motionMode}>
        <i
          class={motionMode === "trace" ? "fas fa-route" : "fas fa-wave-square"}
          aria-hidden="true"
        ></i>
        {motionMode === "trace" ? "Tracing" : "Undulating"}
      </span>
    </div>
    {#if activeBeat}
      <span class="hud-detail">
        {PLANE_LABELS[activeBeat.plane]} · {activeHand === "left"
          ? "Blue"
          : "Red"}
        · {LOCATION_LABELS[activeLocation ?? activeBeat.leftLocation]}
      </span>
    {/if}
  </div>

  <div class="orbit-hint">
    <i class="fas fa-cube" aria-hidden="true"></i>
    Drag to orbit · Scroll to zoom · Pick a point
  </div>
</div>

<style>
  .scene-shell {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 420px;
    overflow: hidden;
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-panel-bg, #080812);
  }

  .scene-shell :global(.scene-container) {
    min-height: 100%;
    border-radius: inherit;
  }

  .scene-hud,
  .orbit-hint {
    position: absolute;
    z-index: 3;
    pointer-events: none;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10101b) 88%,
      transparent
    );
    color: var(--theme-text, #fff);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  }

  .scene-hud {
    top: var(--settings-spacing-sm, 10px);
    left: var(--settings-spacing-sm, 10px);
    display: grid;
    gap: 2px;
    min-width: 18ch;
    padding: 9px 12px;
    border-radius: var(--settings-radius-md, 12px);
  }

  .hud-step {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .hud-primary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .motion-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 7px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 18%,
      transparent
    );
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
  }

  .motion-badge[data-mode="undulate"] {
    background: color-mix(in srgb, #d66dff 22%, transparent);
    color: #f2c8ff;
  }

  .hud-detail,
  .orbit-hint {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
  }

  .hud-detail {
    min-width: 30ch;
  }

  .orbit-hint {
    right: var(--settings-spacing-sm, 10px);
    bottom: var(--settings-spacing-sm, 10px);
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 11px;
    border-radius: 999px;
  }

  @container (max-width: 620px) {
    .orbit-hint {
      display: none;
    }

    .hud-detail {
      min-width: 0;
    }
  }
</style>
