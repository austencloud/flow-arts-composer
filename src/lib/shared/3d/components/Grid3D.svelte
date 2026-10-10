<script lang="ts">
  /**
   * Grid3D Component
   *
   * Renders all three orthogonal grid planes (Wall, Wheel, Floor)
   * with visibility toggles for each.
   *
   * Grid size is derived from user proportions (height + staff length)
   * to ensure the grid matches the user's actual reach and staff size.
   *
   * Positioning is handled by the parent scene graph (PerformerRig wraps
   * Grid3D in positioned T.Groups). This component is pure content.
   */

  import { T, useThrelte, useTask } from "@threlte/core";
  import { Vector3 } from "three";
  import GridPlane from "./GridPlane.svelte";
  import {
    Plane,
    PlaneMode,
    PLANE_COLORS,
    PLANE_MODE_CONFIGS,
  } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { PLANE_NORMALS } from "../domain/constants/plane-transforms";
  import {
    alignGridJoin,
    isGridJoin,
    type GridJoinSpec,
  } from "@tka/render-core";
  import { gridJoinOffset3D } from "../services/grid-join-3d";
  import { joinedGridPointColors3D } from "../services/joined-grid-points-3d";
  import {
    DEFAULT_PERFORMER_HAND_DISTANCE,
    type PerformerHandDistance,
  } from "../domain/performer-hand-distance";
  import { getHandPoints } from "../domain/constants/grid-layout";
  import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
  import {
    getGridMarkerGeometry,
    getGridMaterial,
    getGridOrientationHelperArgs,
  } from "./grid-render-resources";

  interface Props {
    /** Which planes to show */
    visiblePlanes?: Set<Plane>;
    /** Size of each plane (default: derived from user proportions) */
    size?: number;
    /** Distance from center to the performer's hand positions. */
    handPointRadius?: number;
    /** Furthest prop extent shown by the outer ring. */
    outerPointRadius?: number;
    /** Matches the rig's lateral hand anchors in dual-wheel mode. */
    staffHalfLength?: number;
    /** Whether to show grid point labels */
    showLabels?: boolean;
    /** Opacity for plane surfaces */
    planeOpacity?: number;
    /** Grid mode: diamond or box */
    gridMode?: GridMode;
    /** Performer layout used to place plane geometry */
    planeMode?: PlaneMode;
    /** Optional label for this grid (e.g., "Performer 1") */
    label?: string;
    /**
     * Center sphere + axis arrows. Film-style surfaces show dictated plane
     * grids as scenery and want these editor helpers off.
     */
    showOrientationHelpers?: boolean;
    gridJoin?: GridJoinSpec | null;
    handDistance?: PerformerHandDistance;
  }

  let {
    visiblePlanes = new Set([Plane.WALL, Plane.WHEEL, Plane.FLOOR]),
    size,
    handPointRadius,
    outerPointRadius,
    staffHalfLength,
    showLabels = true,
    planeOpacity = 0.15,
    gridMode = "diamond",
    planeMode = PlaneMode.WALL,
    label,
    showOrientationHelpers = true,
    gridJoin = null,
    handDistance = DEFAULT_PERFORMER_HAND_DISTANCE,
  }: Props = $props();

  const effectiveSize = $derived(size ?? userProportionsState.gridSize);
  const effectiveStaffHalfLength = $derived(
    staffHalfLength ?? userProportionsState.staffLength / 2
  );
  const join = $derived(
    isGridJoin(gridJoin) ? alignGridJoin(gridJoin, gridMode) : null
  );
  const hands = ["left", "right"] as const;
  const handColors = { left: "#3b82f6", right: "#ef4444" };
  const joinedPlanes = $derived(
    visiblePlaneList.map((plane) => {
      const config = PLANE_MODE_CONFIGS[planeMode];
      const splitWheel =
        plane === Plane.WHEEL && config.bluePlane === Plane.WHEEL;
      const radius = handDistance.left.max;
      const outerRadius = outerPointRadius ?? radius + effectiveStaffHalfLength;
      // Merge only coplanar points on equal circles. Separated wheel planes and
      // directional reach grids have distinct points even at the same grid label.
      const sameCircle = hands.every(
        (hand) =>
          handDistance[hand].max === radius &&
          getHandPoints(gridMode).every(
            (location) =>
              Math.abs(
                handDistance[hand].toward(plane, LOCATION_ANGLES[location]) -
                  radius
              ) < 1e-9
          )
      );
      const pointColors =
        join && sameCircle && !splitWheel
          ? joinedGridPointColors3D(
              join,
              gridMode,
              radius,
              outerRadius,
              handColors
            )
          : null;
      return {
        plane,
        frames: hands.map((hand) => {
          const position = gridJoinOffset3D(
            join,
            hand,
            plane,
            handDistance[hand]
          );
          if (splitWheel)
            position.x +=
              planeMode === PlaneMode.DUAL_WHEEL
                ? (hand === "left" ? 1 : -1) * effectiveStaffHalfLength
                : hand === "left"
                  ? config.blueLateralOffset
                  : config.redLateralOffset;
          return {
            hand,
            position,
            radius: handDistance[hand].max,
            outerRadius:
              outerPointRadius ??
              handDistance[hand].max + effectiveStaffHalfLength,
            pointColors: pointColors?.[hand],
          };
        }),
      };
    })
  );
  const wheelPlaneOffsets = $derived.by(() => {
    if (planeMode !== PlaneMode.DUAL_WHEEL) return [0];
    return [effectiveStaffHalfLength, -effectiveStaffHalfLength];
  });

  const { camera } = useThrelte();
  const centerPointGeometry = getGridMarkerGeometry(0.04, 32);
  const centerPointMaterial = getGridMaterial(0xf59e0b);
  const orientationHelpers = $derived(
    getGridOrientationHelperArgs(effectiveSize)
  );

  // Stable render order so the {#each} keys don't churn as planes toggle.
  const visiblePlaneList = $derived(
    (Object.values(Plane) as Plane[]).filter((p) => visiblePlanes.has(p))
  );

  const _viewDir = new Vector3();
  let labelPlane = $state<Plane | null>(null);

  useTask(() => {
    if (!showLabels) {
      labelPlane = null;
      return;
    }

    const cam = camera.current;
    cam.getWorldDirection(_viewDir);

    let bestPlane: Plane | null = null;
    let bestDot = -1;

    for (const p of visiblePlaneList) {
      const normal = PLANE_NORMALS[p];
      if (!normal) continue;
      const dot = Math.abs(_viewDir.dot(normal));
      if (dot > bestDot) {
        bestDot = dot;
        bestPlane = p;
      }
    }

    labelPlane = bestPlane;
  });
</script>

<!-- All nine planes render through the same generic path; the wheel plane
   additionally splits into two laterally offset copies in DUAL_WHEEL mode. -->
{#if join}
  {#each joinedPlanes as { plane, frames } (plane)}
    {#each frames as frame (frame.hand)}
      <T.Group
        position={[frame.position.x, frame.position.y, frame.position.z]}
        userData={{ joinedGridHand: frame.hand, joinedGridPlane: plane }}
      >
        <GridPlane
          {plane}
          color={handColors[frame.hand]}
          opacity={planeOpacity / 2}
          showLabels={labelPlane === plane}
          size={Math.max(frame.outerRadius, effectiveSize)}
          handRadius={frame.radius}
          outerRadius={frame.outerRadius}
          handDistance={handDistance[frame.hand]}
          pointColors={frame.pointColors}
          {gridMode}
        />
      </T.Group>
    {/each}
  {/each}
{:else}
  {#each visiblePlaneList as plane (plane)}
    {#if plane === Plane.WHEEL}
      {#each wheelPlaneOffsets as lateralOffset, index (index)}
        <T.Group position.x={lateralOffset}>
          <GridPlane
            {plane}
            color={PLANE_COLORS[plane]}
            opacity={planeOpacity}
            showLabels={labelPlane === plane && index === 0}
            size={effectiveSize}
            handRadius={handPointRadius}
            outerRadius={outerPointRadius}
            {gridMode}
          />
        </T.Group>
      {/each}
    {:else}
      <GridPlane
        {plane}
        color={PLANE_COLORS[plane]}
        opacity={planeOpacity}
        showLabels={labelPlane === plane}
        size={effectiveSize}
        handRadius={handPointRadius}
        outerRadius={outerPointRadius}
        {gridMode}
      />
    {/if}
  {/each}
{/if}

{#if showOrientationHelpers && visiblePlaneList.length > 0}
  {#if !join}
    <!-- Joined grids render their own centers and shared point colors. -->
    <T.Mesh
      geometry={centerPointGeometry}
      material={centerPointMaterial}
      position={[0, 0, 0]}
      dispose={false}
    />
  {/if}

  <!-- Axis helpers for orientation reference -->
  <T.Group>
    {#each orientationHelpers as args, index (index)}
      <T.ArrowHelper {args} />
    {/each}
  </T.Group>
{/if}
