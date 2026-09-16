
import { PI } from "$lib/shared/foundation/domain/math-constants";
import type { AnimationParams } from "$lib/shared/assemble-lab/domain/types";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { applyEffort } from "$lib/shared/effort/domain/effort-easing-unified";
import {
  deriveBuilderMotionGeometry,
  lerpAngle,
  normalizeAnglePositive,
  type BuilderMotionGeometry,
} from "./builder-motion-geometry";

// 950x950 SVG coordinate space
const CENTER = 475;
const GRID_RADIUS = 143.1; // distance from center to hand points

/** Apply the user's chosen effort easing, defaulting to linear */
function applyEasing(t: number): number {
  const preset = getAnimationVisibilityManager().getEffortPreset();
  return applyEffort(preset, t);
}

function pointOnBuilderPath(
  geometry: BuilderMotionGeometry,
  progress: number
): { x: number; y: number } {
  const {
    startCenterAngle,
    endCenterAngle,
    isSamePoint,
    isStraightPath,
    startRadius,
    endRadius,
  } = geometry;
  const radius = startRadius + (endRadius - startRadius) * progress;

  if (isStraightPath) {
    const startX = Math.cos(startCenterAngle) * startRadius;
    const startY = Math.sin(startCenterAngle) * startRadius;
    const endX = Math.cos(endCenterAngle) * endRadius;
    const endY = Math.sin(endCenterAngle) * endRadius;
    return {
      x: CENTER + (startX + (endX - startX) * progress) * GRID_RADIUS,
      y: CENTER + (startY + (endY - startY) * progress) * GRID_RADIUS,
    };
  }

  const angle = isSamePoint
    ? startCenterAngle
    : lerpAngle(startCenterAngle, endCenterAngle, progress);
  return {
    x: CENTER + Math.cos(angle) * radius * GRID_RADIUS,
    y: CENTER + Math.sin(angle) * radius * GRID_RADIUS,
  };
}

export interface BuilderMotionPathParams {
  readonly startPosition: AnimationParams["startPlacement"];
  readonly endPosition: AnimationParams["endPlacement"];
  readonly rotationDirection: AnimationParams["rotationDirection"];
  readonly turnCount: number;
  readonly startOrientation: AnimationParams["startOrientation"];
}

/** The exact route used by the prop animator, exposed for candidate previews. */
export function getBuilderMotionPathD(
  params: BuilderMotionPathParams,
  segments = 24
): string | null {
  if (params.startPosition === params.endPosition) return null;
  const geometry = deriveBuilderMotionGeometry(
    params.startPosition,
    params.endPosition,
    params.startOrientation,
    params.rotationDirection,
    params.turnCount
  );
  const points = Array.from({ length: segments + 1 }, (_, index) =>
    pointOnBuilderPath(geometry, index / segments)
  );
  const [first, ...rest] = points;
  if (!first) return null;
  return `M${first.x},${first.y} ${rest
    .map((point) => `L${point.x},${point.y}`)
    .join(" ")}`;
}

export class SvgPropAnimator {
  private animationFrameId: number | null = null;
  private cancelResolve: (() => void) | null = null;

  async animate(params: AnimationParams): Promise<void> {
    this.cancel(); // cancel any running animation

    const {
      element,
      startPlacement: startPosition,
      endPlacement: endPosition,
      rotationDirection,
      turnCount,
      startOrientation,
      durationMs,
      propCenter,
    } = params;

    // Respect reduced motion
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const duration = prefersReduced ? 0 : durationMs;

    const geometry = deriveBuilderMotionGeometry(
      startPosition,
      endPosition,
      startOrientation,
      rotationDirection,
      turnCount
    );
    const { startStaffAngle, staffRotationDelta, isSamePoint } = geometry;

    // Instant jump for 0 duration
    if (duration <= 0) {
      const endPoint = pointOnBuilderPath(geometry, 1);
      this.applyTransform(
        element,
        endPoint.x,
        endPoint.y,
        normalizeAnglePositive(startStaffAngle + staffRotationDelta),
        propCenter
      );
      return;
    }

    return new Promise<void>((resolve) => {
      this.cancelResolve = resolve;
      const startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const t = applyEasing(rawProgress);

        const point = pointOnBuilderPath(geometry, isSamePoint ? 1 : t);

        // Interpolate staff rotation
        const staffAngle = normalizeAnglePositive(
          startStaffAngle + staffRotationDelta * t
        );

        this.applyTransform(element, point.x, point.y, staffAngle, propCenter);

        if (rawProgress < 1) {
          this.animationFrameId = requestAnimationFrame(tick);
        } else {
          this.animationFrameId = null;
          this.cancelResolve = null;
          resolve();
        }
      };

      this.animationFrameId = requestAnimationFrame(tick);
    });
  }

  cancel(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.cancelResolve) {
      this.cancelResolve();
      this.cancelResolve = null;
    }
  }

  /** Apply transform to SVG element in 950x950 space */
  private applyTransform(
    element: SVGGElement,
    x: number,
    y: number,
    staffAngle: number,
    propCenter: { x: number; y: number }
  ): void {
    // Convert staff angle from radians to degrees for SVG transform
    const rotDeg = (staffAngle * 180) / PI;

    element.style.transform = `translate(${x}px, ${y}px) rotate(${rotDeg}deg) translate(${-propCenter.x}px, ${-propCenter.y}px)`;
  }
}
