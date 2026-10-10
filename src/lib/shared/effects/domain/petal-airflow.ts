import { curl2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";

export interface PetalAirflow2D {
  x: number;
  y: number;
  turn: number;
}

export interface PetalAirflow3D extends PetalAirflow2D {
  z: number;
}

export interface PetalWakeSource2D {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export interface PetalWakeSource3D extends PetalWakeSource2D {
  z: number;
  velocityZ: number;
}

const AIRFLOW_NORMALIZATION = 0.22;
const TWO_DIMENSIONAL_SPAN = 220;
const THREE_DIMENSIONAL_SCALE = 0.52;

function saturate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function normalizedCurl(value: number): number {
  return Math.tanh(value * AIRFLOW_NORMALIZATION);
}

/**
 * A long breath followed by a smaller answering gust. Its average stays at one,
 * so the scene gains phrases without quietly increasing the particle budget.
 */
export function resolvePetalAirflowPhrase(time: number): number {
  return (
    1 + Math.sin(time * 0.43 + 0.35) * 0.23 + Math.sin(time * 1.07 - 1.1) * 0.11
  );
}

/** Nearby petals sample the same curl field, so they bend as one loose sheet. */
export function samplePetalAirflow2D(
  x: number,
  y: number,
  time: number,
  scale: number,
  out: PetalAirflow2D
): PetalAirflow2D {
  const safeScale = Math.max(scale, 0.01);
  const spatialScale = 1 / (TWO_DIMENSIONAL_SPAN * safeScale);
  const flow = curl2D(x * spatialScale, y * spatialScale, time * 0.42);
  const flowX = normalizedCurl(flow.vx);
  const flowY = normalizedCurl(flow.vy);
  const phrase = resolvePetalAirflowPhrase(time);
  out.x = flowX * 17 * safeScale * phrase;
  out.y = flowY * 5.5 * safeScale * phrase;
  out.turn = (flowX * 0.52 + flowY * 0.18) * phrase;
  return out;
}

/**
 * Two orthogonal samples make the same field occupy Three.js depth without a
 * volumetric grid. The stronger X component keeps the motion readable head-on.
 */
export function samplePetalAirflow3D(
  x: number,
  y: number,
  z: number,
  time: number,
  out: PetalAirflow3D
): PetalAirflow3D {
  const xy = curl2D(
    x * THREE_DIMENSIONAL_SCALE,
    y * THREE_DIMENSIONAL_SCALE,
    time * 0.42
  );
  const zy = curl2D(
    z * THREE_DIMENSIONAL_SCALE + 23.7,
    y * THREE_DIMENSIONAL_SCALE - 11.9,
    time * 0.42 + 7.3
  );
  const xFlow = normalizedCurl(xy.vx);
  const zFlow = normalizedCurl(zy.vx);
  const lift = normalizedCurl(xy.vy + zy.vy) * 0.5;
  const phrase = resolvePetalAirflowPhrase(time);
  out.x = xFlow * 0.19 * phrase;
  out.y = lift * 0.065 * phrase;
  out.z = zFlow * 0.13 * phrase;
  out.turn = (xFlow * 0.62 + zFlow * 0.38) * phrase;
  return out;
}

/** A passing prop lends nearby petals a small part of its direction. */
export function addPetalWake2D(
  out: PetalAirflow2D,
  particleX: number,
  particleY: number,
  source: PetalWakeSource2D,
  scale: number
): void {
  const safeScale = Math.max(scale, 0.01);
  const dx = particleX - source.x;
  const dy = particleY - source.y;
  const radius = 126 * safeScale;
  const distance = Math.hypot(dx, dy);
  if (distance >= radius) return;
  const speed = Math.hypot(source.velocityX, source.velocityY);
  if (speed <= 1e-4) return;
  const distanceEnvelope = 1 - saturate(distance / radius);
  const influence =
    distanceEnvelope * distanceEnvelope * saturate(speed / (260 * safeScale));
  const wakeSpeed = 24 * safeScale * influence;
  out.x += (source.velocityX / speed) * wakeSpeed;
  out.y += (source.velocityY / speed) * wakeSpeed * 0.62;
  out.turn +=
    ((dx * source.velocityY - dy * source.velocityX) / (radius * speed)) *
    influence *
    1.4;
}

/** The 3D wake uses the same falloff and directional transfer in world units. */
export function addPetalWake3D(
  out: PetalAirflow3D,
  particleX: number,
  particleY: number,
  particleZ: number,
  source: PetalWakeSource3D
): void {
  const dx = particleX - source.x;
  const dy = particleY - source.y;
  const dz = particleZ - source.z;
  const radius = 0.92;
  const distance = Math.hypot(dx, dy, dz);
  if (distance >= radius) return;
  const speed = Math.hypot(
    source.velocityX,
    source.velocityY,
    source.velocityZ
  );
  if (speed <= 1e-4) return;
  const distanceEnvelope = 1 - saturate(distance / radius);
  const influence = distanceEnvelope * distanceEnvelope * saturate(speed / 2.2);
  const wakeSpeed = 0.24 * influence;
  out.x += (source.velocityX / speed) * wakeSpeed;
  out.y += (source.velocityY / speed) * wakeSpeed * 0.62;
  out.z += (source.velocityZ / speed) * wakeSpeed;
  out.turn +=
    ((dx * source.velocityY - dy * source.velocityX) / (radius * speed)) *
    influence *
    1.4;
}
