/**
 * How a burning wick's flame behaves, in metres and seconds. The 3D particle
 * fire and the 2D fluid fire both take their numbers from here, so a flame is
 * the same length and lasts the same time in either view.
 *
 * A fire prop's wick (Kevlar soaked in white gas or kerosene, about 5 cm
 * thick) feeds a diffusion flame: fuel vapour leaves the wick, mixes with air
 * and glows from hot soot until it has burned through. The numbers below come
 * from that picture:
 *
 * - Burning gas has almost no inertia. It leaves the wick carrying a little of
 *   the wick's speed in the wake, then matches the surrounding air within a few
 *   hundredths of a second. A moving wick therefore leaves its flame behind in
 *   the air instead of throwing it.
 * - Hot gas rises at about 1.5 to 2 m/s above a flame this size.
 * - A still wick's flame stands about 30 cm tall, so gas glows for about 0.2 s.
 * - Moving through air feeds the flame more oxygen and it burns faster, so the
 *   glow time shrinks as the wick speeds up. The trail still grows longer,
 *   because the wick covers more ground in that time: about half a metre at
 *   5 m/s and seventy centimetres at 10 m/s, a quarter of a staff circle.
 * - A still flame puffs: its tip pinches off a few times a second (about
 *   1.5 / sqrt(wick diameter) Hz). Moving air sweeps the puffing away.
 */

export const FIRE_PHYSICS = {
  /** Radius of fresh burning gas at the wick (m): a staff or poi head's wick
   *  is about 5 cm thick, and its flame base is a little wider. */
  wickRadius: 0.04,
  /** How long gas glows above a still wick (s). */
  stillBurnTime: 0.2,
  /** Wick speed at which the glow time halves (m/s). */
  mixingSpeed: 6,
  /** Share of the wick's velocity fresh gas carries in its wake. */
  wakeCarry: 0.3,
  /** How quickly gas sheds the wake's speed and follows the air (s). */
  wakeTime: 0.03,
  /** Speed hot gas rises at once it has left the wick (m/s). */
  riseSpeed: 1.6,
  /** Time the gas takes to reach that rise speed (s). */
  riseTime: 0.06,
  /** How fast a parcel of gas widens as it mixes with air (m/s). */
  spreadSpeed: 0.32,
  /** Puffing frequency of a still flame (Hz). */
  puffHz: 6.5,
  /** Wick speed above which puffing is swept away (m/s). */
  puffFadeSpeed: 2.5,
} as const;

/** How long gas glows after leaving a wick moving at `wickSpeed` (s). */
export function flameBurnTime(wickSpeed: number): number {
  return (
    FIRE_PHYSICS.stillBurnTime /
    (1 + Math.max(0, wickSpeed) / FIRE_PHYSICS.mixingSpeed)
  );
}

/** Radius of a parcel of burning gas `age` seconds after it left the wick (m). */
export function flameParcelRadius(age: number): number {
  return FIRE_PHYSICS.wickRadius + FIRE_PHYSICS.spreadSpeed * Math.max(0, age);
}

/**
 * How strongly a still flame's puffing shows at this wick speed: 1 when still,
 * fading to 0 once moving air sweeps it away.
 */
export function flamePuffShare(wickSpeed: number): number {
  const t = Math.min(1, Math.max(0, wickSpeed) / FIRE_PHYSICS.puffFadeSpeed);
  return 1 - t * t * (3 - 2 * t);
}

export interface FlameParcelVelocity {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Advance a parcel's velocity by `dt`. Horizontal motion relaxes toward the
 * air's velocity over `wakeTime`; vertical motion relaxes toward the air's
 * plus the rise speed over `riseTime`. Exact for any `dt`, so the flame does
 * not change with the frame rate.
 */
export function stepFlameParcelVelocity(
  v: FlameParcelVelocity,
  airVx: number,
  airVy: number,
  airVz: number,
  dt: number
): void {
  const wake = Math.exp(-dt / FIRE_PHYSICS.wakeTime);
  const rise = Math.exp(-dt / FIRE_PHYSICS.riseTime);
  v.vx = airVx + (v.vx - airVx) * wake;
  v.vz = airVz + (v.vz - airVz) * wake;
  const targetY = airVy + FIRE_PHYSICS.riseSpeed;
  v.vy = targetY + (v.vy - targetY) * rise;
}

/**
 * Per-step retention for a quantity that decays at `ratePerSecond`, for a
 * fluid grid that multiplies by a factor each step.
 */
export function retentionPerStep(ratePerSecond: number, dt: number): number {
  return Math.exp(-ratePerSecond * dt);
}
