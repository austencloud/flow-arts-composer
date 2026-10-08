<script lang="ts">
  import { T } from "@threlte/core";
  import { HTML } from "@threlte/extras";
  import { Plane } from "@austencloud/scene-3d";
  import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { LOCATION_ANGLES } from "$lib/shared/foundation/domain/math-constants";
  import {
    getPlaneRotation,
    planeAngleToWorldPosition,
  } from "../domain/constants/plane-transforms";
  import {
    CENTER_POINT_SIZE,
    HAND_POINT_SIZE,
    OUTER_POINT_SIZE,
    type GridMode,
    getHandPoints,
    getOuterPoints,
  } from "../domain/constants/grid-layout";
  import { userProportionsState } from "@austencloud/scene-3d";
  import type { HandDistance } from "../domain/performer-hand-distance";
  import {
    getGridMarkerGeometry,
    getGridMaterial,
    getGridPlaneGeometry,
    getGridRingGeometry,
  } from "./grid-render-resources";

  interface Props {
    plane: Plane;
    color?: string;
    opacity?: number;
    showLabels?: boolean;
    size?: number;
    handRadius?: number;
    outerRadius?: number;
    gridMode?: GridMode;
    /** Joined grids share point ownership; a missing key is not drawn. */
    pointColors?: ReadonlyMap<string, string>;
    handDistance?: HandDistance;
  }

  let {
    plane,
    color = "var(--theme-accent-strong)",
    opacity = 0.15,
    showLabels = true,
    size,
    handRadius,
    outerRadius,
    gridMode = "diamond",
    pointColors,
    handDistance,
  }: Props = $props();

  const handPointRadius = $derived(
    handRadius ?? userProportionsState.handPointRadius
  );
  const outerPointRadius = $derived(
    outerRadius ?? userProportionsState.outerPointRadius
  );
  const effectiveSize = $derived(size ?? userProportionsState.gridSize);

  const handPoints = $derived(
    getHandPoints(gridMode).filter(
      (location) => !pointColors || pointColors.has(`hand:${location}`)
    )
  );
  const outerPoints = $derived(
    getOuterPoints(gridMode).filter(
      (location) => !pointColors || pointColors.has(`outer:${location}`)
    )
  );
  const planeGeometry = $derived(getGridPlaneGeometry(effectiveSize));
  const handRingGeometry = $derived(
    getGridRingGeometry(handPointRadius, 0.015, 64)
  );
  const outerRingGeometry = $derived(
    getGridRingGeometry(outerPointRadius, 0.01, 64)
  );
  const centerGeometry = getGridMarkerGeometry(CENTER_POINT_SIZE, 16);
  const handMarkerGeometry = getGridMarkerGeometry(HAND_POINT_SIZE, 16);
  const outerMarkerGeometry = getGridMarkerGeometry(OUTER_POINT_SIZE, 12);
  const planeMaterial = $derived(
    getGridMaterial(color, {
      opacity,
      doubleSided: true,
      depthWrite: false,
    })
  );
  const handRingMaterial = $derived(
    getGridMaterial(color, { opacity: 0.5, doubleSided: true })
  );
  const outerRingMaterial = $derived(
    getGridMaterial(color, { opacity: 0.25, doubleSided: true })
  );
  const pointMaterial = $derived(getGridMaterial(color));
  const outerPointMaterial = $derived(getGridMaterial(color, { opacity: 0.6 }));
  const centerMaterial = getGridMaterial(0xf59e0b);

  function getGridPointPosition(
    location: GridLocation,
    radius: number
  ): [number, number, number] {
    const angle = LOCATION_ANGLES[location];
    const pos = planeAngleToWorldPosition(plane, angle, radius);
    return [pos.x, pos.y, pos.z];
  }

  // The domain owns plane orientation for the full nine-plane catalog; the
  // fusion planes (shields, ramps, wings) have no hardcoded case here.
  const planeRotation = $derived.by((): [number, number, number] => {
    const euler = getPlaneRotation(plane);
    return [euler.x, euler.y, euler.z];
  });

  const locationLabels: Record<GridLocation, string> = {
    [GridLocation.NORTH]: "N",
    [GridLocation.NORTHEAST]: "NE",
    [GridLocation.EAST]: "E",
    [GridLocation.SOUTHEAST]: "SE",
    [GridLocation.SOUTH]: "S",
    [GridLocation.SOUTHWEST]: "SW",
    [GridLocation.WEST]: "W",
    [GridLocation.NORTHWEST]: "NW",
    [GridLocation.CENTER]: "C",
  };
</script>

<!-- Plane group with rotation -->
<T.Group rotation={planeRotation}>
  <!-- Semi-transparent plane surface -->
  <T.Mesh geometry={planeGeometry} material={planeMaterial} dispose={false} />

  <!-- Hand point circle (inner ring) - 1.5cm thickness -->
  <T.Mesh
    geometry={handRingGeometry}
    material={handRingMaterial}
    position={[0, 0, 0.005]}
    dispose={false}
  />

  <!-- Outer point circle - 1cm thickness -->
  <T.Mesh
    geometry={outerRingGeometry}
    material={outerRingMaterial}
    position={[0, 0, 0.003]}
    dispose={false}
  />

  <!-- Center point (largest, white/gold) -->
  {#if !pointColors || pointColors.has("center:c")}
    <T.Mesh
      geometry={centerGeometry}
      material={pointColors
        ? getGridMaterial(pointColors.get("center:c")!)
        : centerMaterial}
      position={[0, 0, 0.01]}
      dispose={false}
    />
  {/if}
</T.Group>

<!-- Hand point markers (medium size, at hand radius) -->
{#each handPoints as location}
  {@const pos = getGridPointPosition(
    location,
    handDistance?.toward(plane, LOCATION_ANGLES[location]) ?? handPointRadius
  )}
  <T.Mesh
    geometry={handMarkerGeometry}
    material={pointColors
      ? getGridMaterial(pointColors.get(`hand:${location}`)!)
      : pointMaterial}
    position={pos}
    dispose={false}
  />
{/each}

<!-- Outer point markers (smaller, at outer radius) -->
{#each outerPoints as location}
  {@const pos = getGridPointPosition(location, outerPointRadius)}
  <T.Mesh
    geometry={outerMarkerGeometry}
    material={pointColors
      ? getGridMaterial(pointColors.get(`outer:${location}`)!, { opacity: 0.6 })
      : outerPointMaterial}
    position={pos}
    dispose={false}
  />

  {#if showLabels}
    <T.Group position={[pos[0] * 1.08, pos[1] * 1.08, pos[2] * 1.08]}>
      <HTML center sprite>
        <span class="grid-label" style="color: {color};"
          >{locationLabels[location]}</span
        >
      </HTML>
    </T.Group>
  {/if}
{/each}

<style>
  .grid-label {
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    text-shadow:
      -1px -1px 0 rgba(0, 0, 0, 0.6),
      1px -1px 0 rgba(0, 0, 0, 0.6),
      -1px 1px 0 rgba(0, 0, 0, 0.6),
      1px 1px 0 rgba(0, 0, 0, 0.6);
  }
</style>
