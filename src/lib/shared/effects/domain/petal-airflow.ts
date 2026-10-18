import { curl2D } from "#lib/shared/3d/effects/smoke/smoke-curl-field.js";

export interface PetalAirflow2D {
  x: number;
  y: number;
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
/** How far from a moving prop the air it drags along reaches (m). */
const WAKE_RADIUS = 0.5;
/** Air beside a moving prop moves at this share of the prop's speed. */
const WAKE_SHARE = 0.3;
/** Screen pixels per metre in the 2D views at scale 1. */
const PIXELS_PER_METRE = 140;
const TWO_DIMENSIONAL_SPAN = 220;
const THREE_DIMENSIONAL_SCALE = 0.52;

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
  return out;
}

/**
 * A moving prop drags the air beside it along: close to the prop the air
 * moves at WAKE_SHARE of its speed, fading to still WAKE_RADIUS away.
 */
function wakeShare(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const envelope = 1 - distance / radius;
  return WAKE_SHARE * envelope * envelope;
}

/** The air a passing prop drags along, in screen pixels per second. */
export function addPetalWake2D(
  out: PetalAirflow2D,
  particleX: number,
  particleY: number,
  source: PetalWakeSource2D,
  scale: number
): void {
  const radius = WAKE_RADIUS * PIXELS_PER_METRE * Math.max(scale, 0.01);
  const share = wakeShare(
    Math.hypot(particleX - source.x, particleY - source.y),
    radius
  );
  out.x += source.velocityX * share;
  out.y += source.velocityY * share;
}

/** The air a passing prop drags along, in metres per second. */
export function addPetalWake3D(
  out: PetalAirflow3D,
  particleX: number,
  particleY: number,
  particleZ: number,
  source: PetalWakeSource3D
): void {
  const share = wakeShare(
    Math.hypot(
      particleX - source.x,
      particleY - source.y,
      particleZ - source.z
    ),
    WAKE_RADIUS
  );
  out.x += source.velocityX * share;
  out.y += source.velocityY * share;
  out.z += source.velocityZ * share;
}
