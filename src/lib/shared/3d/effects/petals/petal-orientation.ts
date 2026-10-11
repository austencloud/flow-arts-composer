import type { Quaternion } from "three";

export function petalFlightWeight(
  velocityX: number,
  velocityY: number,
  velocityZ: number,
  fallVelocity: number
): number {
  const residualY = velocityY - fallVelocity;
  const speed = Math.hypot(velocityX, residualY, velocityZ);
  const normalized = Math.min(1, Math.max(0, (speed - 0.12) / 0.88));
  return normalized * normalized * (3 - 2 * normalized);
}

export function settlePetalOrientation(
  current: Quaternion,
  flight: Quaternion,
  floating: Quaternion,
  flightWeight: number,
  delta: number,
  target: Quaternion
): void {
  target.copy(floating).slerp(flight, flightWeight);
  current.slerp(target, 1 - Math.exp(-8 * Math.max(0, delta)));
}
