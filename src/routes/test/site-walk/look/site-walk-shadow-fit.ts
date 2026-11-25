/**
 * Where the sun's shadow map looks.
 *
 * A low sun sees the ground almost edge on, so a square map spends most of its
 * rows on empty air and the ground's shadows come out in steps. This fits the
 * map to what the sun really sees of the site: wide across, short up and down.
 */

import { Vector3 } from "three";

export interface ShadowBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** The tallest thing that throws a shadow worth having, metres. */
  height: number;
}

export interface ShadowFit {
  position: Vector3;
  target: Vector3;
  left: number;
  right: number;
  top: number;
  bottom: number;
  near: number;
  far: number;
}

const DISTANCE = 300;

export function fitShadow(
  direction: Vector3,
  box: ShadowBox,
  margin = 12
): ShadowFit {
  const target = new Vector3(
    (box.minX + box.maxX) / 2,
    0,
    (box.minZ + box.maxZ) / 2
  );
  const toward = direction.clone().normalize();
  // The camera three.js builds for the light: looking down -direction with +y up.
  const right = new Vector3(0, 1, 0).cross(toward).normalize();
  const up = toward.clone().cross(right);
  const p = new Vector3();
  const range = {
    x0: Infinity,
    x1: -Infinity,
    y0: Infinity,
    y1: -Infinity,
    d0: Infinity,
  };
  for (const x of [box.minX - margin, box.maxX + margin]) {
    for (const z of [box.minZ - margin, box.maxZ + margin]) {
      for (const y of [0, box.height]) {
        p.set(x, y, z).sub(target);
        range.x0 = Math.min(range.x0, p.dot(right));
        range.x1 = Math.max(range.x1, p.dot(right));
        range.y0 = Math.min(range.y0, p.dot(up));
        range.y1 = Math.max(range.y1, p.dot(up));
        range.d0 = Math.min(range.d0, p.dot(toward));
      }
    }
  }
  return {
    position: target.clone().addScaledVector(toward, DISTANCE),
    target,
    left: range.x0,
    right: range.x1,
    top: range.y1,
    bottom: range.y0,
    // Anything between the sun and the site can throw a shadow onto it.
    near: 1,
    far: DISTANCE - range.d0 + 5,
  };
}

/** How many pixels across and up the map should have, so a pixel covers a square patch of what the light sees. */
export function shadowMapSize(
  fit: Pick<ShadowFit, "left" | "right" | "top" | "bottom">,
  pixels: number,
  largest: number
): { width: number; height: number } {
  const aspect = (fit.right - fit.left) / (fit.top - fit.bottom);
  const width = Math.min(largest, Math.sqrt(pixels * aspect));
  const height = Math.min(largest, width / aspect);
  return { width: Math.floor(height * aspect), height: Math.floor(height) };
}
