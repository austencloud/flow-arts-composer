/**
 * How the sparks off a burning steel wool or charcoal prop fly, glow and go
 * out, in metres and seconds. The 3D and 2D Coal views both take their numbers
 * from here, so a spark flies as far and lasts as long in either view.
 *
 * Spun steel wool throws droplets of burning iron and iron oxide, a tenth to
 * half a millimetre across. The numbers below come from that picture:
 *
 * - A droplet is thousands of times denser than air, so it leaves at the full
 *   speed of the wool and flies off along the tangent of the spin. It does not
 *   trail behind the prop the way a flame does.
 * - Air drag on a small sphere is a = 3 Cd rho_air |v| v / (4 rho d), with Cd
 *   from the Schiller-Naumann fit. A 0.3 mm droplet thrown at 9 m/s loses half
 *   its speed in about 0.2 s and sinks toward a terminal fall of about 3.6 m/s,
 *   which bends its path into an arc about two and a half metres long.
 * - The droplet burns by the d-squared law (burn time grows with diameter
 *   squared), white-yellow all the while, then cools by radiation through
 *   orange to dull red in about a tenth of a second. Small sparks are brief
 *   flicks; the big ones are the long arcs that reach the floor.
 * - Carbon steel sparks fork: carbon in the droplet boils off as gas that
 *   bursts it into a star of smaller sparks partway through its flight.
 * - Charcoal embers are light (about 300 kg/m3) and a millimetre or two
 *   across, and they are flakes rather than spheres, with several times a
 *   sphere's drag. They stop within tens of centimetres, burn for seconds and
 *   sink at about a metre a second instead of flying.
 */

import type { CharcoalEmissionStyle } from "./effects-config";

/** Density of air at room temperature (kg/m3). */
export const AIR_DENSITY = 1.2;
/** Kinematic viscosity of air (m2/s). */
export const AIR_KINEMATIC_VISCOSITY = 1.5e-5;
/** Gravity (m/s2). */
export const SPARK_GRAVITY = 9.81;
/**
 * How long a camera shutter stays open (s). A spark is drawn as the streak it
 * paints in that time, which is how the eye and a video camera both see it.
 */
export const SPARK_SHUTTER_SECONDS = 1 / 40;
/** Heat below which a spark no longer shows against a dark stage. */
export const SPARK_VISIBLE_HEAT = 0.12;
/**
 * Heat when the droplet has burned out. It leaves white-yellow and is
 * yellow-orange by then: iron burns near 2,000 K but the droplet's surface
 * cools as it shrinks and its oxide shell thickens.
 */
export const SPARK_BURNOUT_HEAT = 0.68;
/**
 * Screen pixels per metre in the 2D views at the 500 px reference canvas,
 * the same scale the 2D fire uses.
 */
export const SPARK_2D_PIXELS_PER_METRE = 140;

export interface SparkMaterial {
  /** Droplet or ember density (kg/m3). */
  readonly density: number;
  /** Drag relative to a sphere's: 1 for droplets, more for flakes. */
  readonly dragFactor: number;
  /** Smallest and largest thrown diameter (m). Small ones are more common. */
  readonly diameterMin: number;
  readonly diameterMax: number;
  /** d-squared law constant: burn time (s) per square millimetre. */
  readonly burnPerMm2: number;
  /** Cooling time constant after burnout (s) per millimetre of diameter. */
  readonly coolPerMm: number;
  /** Share of the prop's velocity a spark keeps when it leaves. */
  readonly carry: number;
  /** Speed of the random kick each spark gets on release (m/s). */
  readonly scatter: number;
  /** Chance a spark bursts into smaller ones partway through its burn. */
  readonly forkChance: number;
  /** How many sparks a fork throws. */
  readonly forkChildrenMin: number;
  readonly forkChildrenMax: number;
  /** Speed the fork throws its children at, relative to the parent (m/s). */
  readonly forkSpeed: number;
  /** Share of vertical speed kept when a spark hits the floor. */
  readonly restitution: number;
}

/** Each Coal look's spark, by the emission style it names. */
export const SPARK_MATERIALS: Readonly<
  Record<CharcoalEmissionStyle, SparkMaterial>
> = {
  // Fine steel wool: iron and oxide droplets, long arcs, the odd pop.
  "steel-wool": {
    density: 5200,
    dragFactor: 1,
    diameterMin: 0.00012,
    diameterMax: 0.00042,
    burnPerMm2: 5.5,
    coolPerMm: 0.35,
    carry: 0.95,
    scatter: 0.45,
    forkChance: 0.06,
    forkChildrenMin: 2,
    forkChildrenMax: 3,
    forkSpeed: 1.2,
    restitution: 0.3,
  },
  // Carbon steel: shorter-lived sparks that burst into stars.
  "forge-burst": {
    density: 5600,
    dragFactor: 1,
    diameterMin: 0.0001,
    diameterMax: 0.00036,
    burnPerMm2: 4.5,
    coolPerMm: 0.35,
    carry: 0.9,
    scatter: 0.6,
    forkChance: 0.6,
    forkChildrenMin: 3,
    forkChildrenMax: 5,
    forkSpeed: 2.2,
    restitution: 0.3,
  },
  // Coarse wool: bigger droplets thrown wide that carry further.
  "cinder-fan": {
    density: 4800,
    dragFactor: 1,
    diameterMin: 0.00022,
    diameterMax: 0.0006,
    burnPerMm2: 3.8,
    coolPerMm: 0.4,
    carry: 0.85,
    scatter: 1.2,
    forkChance: 0.12,
    forkChildrenMin: 2,
    forkChildrenMax: 3,
    forkSpeed: 1.4,
    restitution: 0.3,
  },
  // Charcoal: light embers that drift and smoulder for seconds.
  "banked-ember": {
    density: 320,
    dragFactor: 4,
    diameterMin: 0.0006,
    diameterMax: 0.002,
    burnPerMm2: 0.85,
    coolPerMm: 0.6,
    carry: 0.6,
    scatter: 0.25,
    forkChance: 0,
    forkChildrenMin: 0,
    forkChildrenMax: 0,
    forkSpeed: 0,
    restitution: 0.15,
  },
};

/** Glowing chips of charcoal or wire that fall off a burning head. */
export const EMBER_CHIP_MATERIAL: SparkMaterial = {
  density: 600,
  dragFactor: 3,
  diameterMin: 0.0008,
  diameterMax: 0.0022,
  burnPerMm2: 0.6,
  coolPerMm: 0.5,
  carry: 0.7,
  scatter: 0.35,
  forkChance: 0,
  forkChildrenMin: 0,
  forkChildrenMax: 0,
  forkSpeed: 0,
  restitution: 0.2,
};

export function resolveSparkMaterial(
  style: CharcoalEmissionStyle | undefined
): SparkMaterial {
  return SPARK_MATERIALS[style ?? "steel-wool"] ?? SPARK_MATERIALS["steel-wool"];
}

/** Drag coefficient of a sphere (Schiller-Naumann, flat above Re 1000). */
export function sphereDragCoefficient(reynolds: number): number {
  if (reynolds >= 1000) return 0.44;
  const re = Math.max(1e-6, reynolds);
  return (24 / re) * (1 + 0.15 * Math.pow(re, 0.687));
}

/**
 * Drag as a rate (1/s): the spark's acceleration is -rate * velocity. Finite
 * at zero speed, where drag falls back to Stokes' law.
 */
export function sparkDragRate(
  speed: number,
  diameter: number,
  material: SparkMaterial
): number {
  const d = Math.max(1e-6, diameter);
  const reynolds = (Math.max(0, speed) * d) / AIR_KINEMATIC_VISCOSITY;
  const cdTimesSpeed =
    reynolds < 1e-6
      ? (24 * AIR_KINEMATIC_VISCOSITY) / d
      : sphereDragCoefficient(reynolds) * speed;
  return (
    (0.75 * AIR_DENSITY * cdTimesSpeed * material.dragFactor) /
    (material.density * d)
  );
}

export interface SparkVelocity {
  vx: number;
  vy: number;
  vz: number;
}

/**
 * One step of gravity and drag, implicit in the drag so a long frame never
 * overshoots and reverses a spark. `metresPerUnit` converts the velocity's
 * units to metres (1 in 3D, 1 / pixels-per-metre in 2D); the gravity vector
 * is in the velocity's own units.
 */
export function stepSparkVelocity(
  v: SparkVelocity,
  dt: number,
  diameter: number,
  material: SparkMaterial,
  gx: number,
  gy: number,
  gz: number,
  metresPerUnit = 1
): void {
  if (dt <= 0) return;
  const ax = v.vx + gx * dt;
  const ay = v.vy + gy * dt;
  const az = v.vz + gz * dt;
  const speed = Math.sqrt(ax * ax + ay * ay + az * az) * metresPerUnit;
  const damping = 1 / (1 + sparkDragRate(speed, diameter, material) * dt);
  v.vx = ax * damping;
  v.vy = ay * damping;
  v.vz = az * damping;
}

/** Picks a diameter; `u` is uniform in [0, 1). Small sparks are commoner. */
export function sampleSparkDiameter(material: SparkMaterial, u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return (
    material.diameterMin + (material.diameterMax - material.diameterMin) * t * t
  );
}

/** How long a spark of this diameter burns before it starts to cool (s). */
export function sparkBurnTime(material: SparkMaterial, diameter: number): number {
  const mm = diameter * 1000;
  return material.burnPerMm2 * mm * mm;
}

/** Cooling time constant after burnout (s). */
export function sparkCoolTime(material: SparkMaterial, diameter: number): number {
  return material.coolPerMm * diameter * 1000;
}

/** How long a spark stays visible: its burn plus cooling to the visible floor. */
export function sparkLifetime(burnTime: number, coolTime: number): number {
  return burnTime + coolTime * Math.log(SPARK_BURNOUT_HEAT / SPARK_VISIBLE_HEAT);
}

/**
 * A spark's heat at `age`, 1 white-hot to 0 dark. It cools from white toward
 * yellow-orange while it burns, then falls off exponentially once it is out.
 */
export function sparkHeat(age: number, burnTime: number, coolTime: number): number {
  if (age <= 0) return 1;
  if (age < burnTime) {
    return 1 - (1 - SPARK_BURNOUT_HEAT) * (age / Math.max(1e-6, burnTime));
  }
  return (
    SPARK_BURNOUT_HEAT * Math.exp(-(age - burnTime) / Math.max(1e-6, coolTime))
  );
}

/**
 * When a spark forks, in seconds after release, or -1 if it does not. `u1`
 * decides whether, `u2` when: carbon boils off once the droplet is well alight.
 */
export function sampleSparkFork(
  material: SparkMaterial,
  burnTime: number,
  u1: number,
  u2: number
): number {
  if (u1 >= material.forkChance) return -1;
  return burnTime * (0.35 + 0.45 * u2);
}

/**
 * Release velocity: the prop's velocity times the material's carry, plus an
 * isotropic kick up to `scatter` (in the velocity's units). Writes into `out`.
 */
export function releaseSparkVelocity(
  out: SparkVelocity,
  vx: number,
  vy: number,
  vz: number,
  carry: number,
  scatter: number,
  random: () => number = Math.random
): void {
  const z = random() * 2 - 1;
  const azimuth = random() * Math.PI * 2;
  const radial = Math.sqrt(Math.max(0, 1 - z * z));
  const kick = scatter * Math.cbrt(random());
  out.vx = vx * carry + Math.cos(azimuth) * radial * kick;
  out.vy = vy * carry + Math.sin(azimuth) * radial * kick;
  out.vz = vz * carry + z * kick;
}

/** The same kick in a plane, for the 2D views. */
export function releaseSparkVelocity2D(
  out: SparkVelocity,
  vx: number,
  vy: number,
  carry: number,
  scatter: number,
  random: () => number = Math.random
): void {
  const azimuth = random() * Math.PI * 2;
  const kick = scatter * Math.sqrt(random());
  out.vx = vx * carry + Math.cos(azimuth) * kick;
  out.vy = vy * carry + Math.sin(azimuth) * kick;
  out.vz = 0;
}
