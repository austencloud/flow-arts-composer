<script lang="ts">
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  /**
   * Viewer2DScene
   *
   * Orthographic 2D scene content: grid + props rendered as flat geometry.
   * Coordinate system: unit circle = grid hand point radius.
   * Origin = grid center. X-right, Y-up (Three.js default).
   *
   * Conversion from Canvas2D (Y-down) PropState angles:
   *   threeX = cos(centerPathAngle)
   *   threeY = -sin(centerPathAngle)
   */

  import { T } from "@threlte/core";
  import Grid2DOverlay from "./Grid2DOverlay.svelte";
  import PropPlane2D from "./PropPlane2D.svelte";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import { getPropDimensions } from "$lib/shared/animation-engine/services/IPropTextureLoader";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  interface Props {
    leftPropState: PropState | null;
    rightPropState: PropState | null;
    leftPropType?: string | null;
    rightPropType?: string | null;
    gridMode?: string | null;
    currentStep?: number;
  }

  let {
    leftPropState,
    rightPropState,
    leftPropType = "staff",
    rightPropType = "staff",
    gridMode = "diamond",
    currentStep = 0,
  }: Props = $props();

  const GRID_RADIUS_VB = 150;

  function propStateToPosition(state: PropState): [number, number, number] {
    if (state.x !== undefined && state.y !== undefined) {
      return [state.x, -state.y, 0];
    }
    return [
      Math.cos(state.centerPathAngle),
      -Math.sin(state.centerPathAngle),
      0,
    ];
  }

  function propDimsToWorld(propType: string): { width: number; height: number } {
    const dims = getPropDimensions(propType || "staff");
    return {
      width: dims.width / GRID_RADIUS_VB,
      height: dims.height / GRID_RADIUS_VB,
    };
  }

  const leftDims = $derived(propDimsToWorld(leftPropType ?? "staff"));
  const rightDims = $derived(propDimsToWorld(rightPropType ?? "staff"));

  const leftPos = $derived(leftPropState ? propStateToPosition(leftPropState) : null);
  const rightPos = $derived(rightPropState ? propStateToPosition(rightPropState) : null);
  const isLeftHand = $derived((leftPropType ?? "").toLowerCase() === "hand");
  const isRightHand = $derived((rightPropType ?? "").toLowerCase() === "hand");
  const leftRot = $derived(isLeftHand ? 0 : (leftPropState?.staffRotationAngle ?? 0));
  const rightRot = $derived(isRightHand ? 0 : (rightPropState?.staffRotationAngle ?? 0));

  const leftColor = $derived(getSettings().primaryPropColors?.left ?? getMotionColor(HandSide.LEFT, "dark"));
  const rightColor = $derived(getSettings().primaryPropColors?.right ?? getMotionColor(HandSide.RIGHT, "dark"));
</script>

<T.AmbientLight intensity={1} />

<Grid2DOverlay
  gridMode={gridMode === "box" ? "box" : "diamond"}
/>

{#if leftPos}
  <PropPlane2D
    position={leftPos}
    rotation={leftRot}
    width={leftDims.width}
    height={leftDims.height}
    color={leftColor}
    propType={leftPropType ?? "staff"}
    zIndex={0.01}
  />
{/if}

{#if rightPos}
  <PropPlane2D
    position={rightPos}
    rotation={rightRot}
    width={rightDims.width}
    height={rightDims.height}
    color={rightColor}
    propType={rightPropType ?? "staff"}
    zIndex={0.02}
  />
{/if}
