/**
 * Hand Path Animator
 *
 * Animates a hand SVG from one grid location to another.
 * Position-only - hands don't rotate, so no staff angle calculation.
 *
 * Movement types (same as SvgPropAnimator):
 * - Shifts (adjacent points): arc path around the grid circle
 * - Dashes (opposite points): straight line through center
 * - Static (same point): no movement
 *
 * Uses the effort easing system from animation canvas settings.
 */

import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  LOCATION_ANGLES,
  PI,
  TWO_PI,
} from "$lib/shared/foundation/domain/math-constants";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { applyEffort } from "$lib/shared/effort/domain/effort-easing-unified";

// 950x950 SVG coordinate space
const CENTER = 475;
const GRID_RADIUS = 143.1;

function normPos(angle: number): number {
  const n = angle % TWO_PI;
  return n < 0 ? n + TWO_PI : n;
}

function normSigned(angle: number): number {
  const n = normPos(angle);
  return n > PI ? n - TWO_PI : n;
}

function locToAngle(loc: GridLocation): number {
  return LOCATION_ANGLES[loc];
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = normSigned(b - a);
  return normPos(a + d * t);
}

/** Determine if two locations are diametrically opposite (dash) */
export function isOpposite(a: GridLocation, b: GridLocation): boolean {
  const delta = Math.abs(normSigned(locToAngle(b) - locToAngle(a)));
  return Math.abs(delta - PI) < 0.01;
}

/** Apply the user's chosen effort easing */
function applyEasing(t: number): number {
  const preset = getAnimationVisibilityManager().getEffortPreset();
  return applyEffort(preset, t);
}

function resolveHandPathType(isDash: boolean): "arc" | "linear" | "concave" {
  if (isDash) return "linear";
  return getAnimationVisibilityManager().getPathShape();
}

function interpolateConcavePoint(
  startAngle: number,
  endAngle: number,
  t: number,
): { x: number; y: number } {
  // Circle point
  const arcAngle = lerpAngle(startAngle, endAngle, t);
  const circleX = Math.cos(arcAngle);
  const circleY = Math.sin(arcAngle);
  // Straight line point
  const sx = Math.cos(startAngle);
  const sy = Math.sin(startAngle);
  const ex = Math.cos(endAngle);
  const ey = Math.sin(endAngle);
  const straightX = sx + (ex - sx) * t;
  const straightY = sy + (ey - sy) * t;
  // Reflect
  return {
    x: CENTER + (2 * straightX - circleX) * GRID_RADIUS,
    y: CENTER + (2 * straightY - circleY) * GRID_RADIUS,
  };
}

/**
 * Generate SVG path points for a movement between two grid locations.
 * Returns an array of {x, y} points that trace the actual path:
 * - Arc for shifts (adjacent locations)
 * - Straight line for dashes (opposite locations)
 */
export function getPathPoints(
  from: GridLocation,
  to: GridLocation,
  numSegments = 20,
  overridePathType?: "arc" | "linear" | "concave",
): Array<{ x: number; y: number }> {
  const startAngle = locToAngle(from);
  const endAngle = locToAngle(to);
  const isDash = isOpposite(from, to);
  const pathType = overridePathType ?? resolveHandPathType(isDash);

  const points: Array<{ x: number; y: number }> = [];

  if (pathType === "linear") {
    const sx = Math.cos(startAngle);
    const sy = Math.sin(startAngle);
    const ex = Math.cos(endAngle);
    const ey = Math.sin(endAngle);
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const cx = sx + (ex - sx) * t;
      const cy = sy + (ey - sy) * t;
      points.push({
        x: CENTER + cx * GRID_RADIUS,
        y: CENTER + cy * GRID_RADIUS,
      });
    }
  } else if (pathType === "concave") {
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      points.push(interpolateConcavePoint(startAngle, endAngle, t));
    }
  } else {
    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const angle = lerpAngle(startAngle, endAngle, t);
      points.push({
        x: CENTER + Math.cos(angle) * GRID_RADIUS,
        y: CENTER + Math.sin(angle) * GRID_RADIUS,
      });
    }
  }

  return points;
}

/**
 * Build an SVG path "d" attribute for the movement between two locations.
 * Arc paths use a series of line segments to approximate the curve.
 * Dash paths are a straight line.
 */
export function getPathD(
  from: GridLocation,
  to: GridLocation,
  overridePathType?: "arc" | "linear" | "concave",
): string {
  const points = getPathPoints(from, to, 20, overridePathType);
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return `M${first!.x},${first!.y} ${rest.map(p => `L${p.x},${p.y}`).join(" ")}`;
}

export interface HandAnimationParams {
  element: SVGGElement;
  startLocation: GridLocation;
  endLocation: GridLocation;
  durationMs: number;
  handCenter: { x: number; y: number };
}

export class HandPathAnimator {
  private animationFrameId: number | null = null;
  private cancelResolve: (() => void) | null = null;

  async animate(params: HandAnimationParams): Promise<void> {
    this.cancel();

    const { element, startLocation, endLocation, durationMs, handCenter } = params;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = prefersReduced ? 0 : durationMs;

    const startAngle = locToAngle(startLocation);
    const endAngle = locToAngle(endLocation);
    const isSamePoint = startLocation === endLocation;
    const isDash = !isSamePoint && isOpposite(startLocation, endLocation);
    const pathType = resolveHandPathType(isDash);
    const useCartesian = pathType !== "arc";

    const startX = useCartesian ? Math.cos(startAngle) : 0;
    const startY = useCartesian ? Math.sin(startAngle) : 0;
    const endX = useCartesian ? Math.cos(endAngle) : 0;
    const endY = useCartesian ? Math.sin(endAngle) : 0;

    if (duration <= 0 || isSamePoint) {
      this.applyPosition(element, endAngle, useCartesian, endX, endY, handCenter);
      return;
    }

    return new Promise<void>((resolve) => {
      this.cancelResolve = resolve;
      const startTime = performance.now();

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const rawProgress = Math.min(elapsed / duration, 1);
        const t = applyEasing(rawProgress);

        let cartX = 0;
        let cartY = 0;
        let angle: number;

        if (pathType === "concave") {
          const pt = interpolateConcavePoint(startAngle, endAngle, t);
          cartX = (pt.x - CENTER) / GRID_RADIUS;
          cartY = (pt.y - CENTER) / GRID_RADIUS;
          angle = Math.atan2(cartY, cartX);
        } else if (pathType === "linear") {
          cartX = startX + (endX - startX) * t;
          cartY = startY + (endY - startY) * t;
          angle = Math.atan2(cartY, cartX);
        } else {
          angle = lerpAngle(startAngle, endAngle, t);
        }

        this.applyPosition(element, angle, useCartesian, cartX, cartY, handCenter);

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

  private applyPosition(
    element: SVGGElement,
    centerAngle: number,
    useCartesian: boolean,
    cartX: number,
    cartY: number,
    handCenter: { x: number; y: number },
  ): void {
    let x: number;
    let y: number;

    if (useCartesian) {
      x = CENTER + cartX * GRID_RADIUS;
      y = CENTER + cartY * GRID_RADIUS;
    } else {
      x = CENTER + Math.cos(centerAngle) * GRID_RADIUS;
      y = CENTER + Math.sin(centerAngle) * GRID_RADIUS;
    }

    element.style.transform =
      `translate(${x}px, ${y}px) translate(${-handCenter.x}px, ${-handCenter.y}px)`;
  }
}
