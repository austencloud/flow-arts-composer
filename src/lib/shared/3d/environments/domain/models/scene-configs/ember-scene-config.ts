/** Ember environment configuration and production defaults. */

import type {
  FallingParticlesConfig,
  SkyGradientConfig,
} from "../environment-models";
import type {
  CampfireConfig,
  FogConfig,
  GroundConfig,
  HemisphereLightConfig,
  ObsidianPlatformConfig,
  TreeRingConfig,
} from "./shared-scene-config";
import volcanicWorldR7 from "./ember-volcanic-world-r7.json";
import {
  DEFAULT_EMBER_ATMOSPHERE_LOOK,
  getEmberAtmosphereLook,
  type EmberAtmosphereLookId,
  type EmberAtmosphereRigConfig,
} from "./ember-atmosphere-looks";

export interface LavaPoolConfig {
  enabled: boolean;
  position: { x: number; z: number };
  radius: number;
  baseColor: string;
  hotColor: string;
  crustColor: string;
  flowSpeed: number;
  lightIntensity: number;
  lightDistance: number;
  pulseSpeed: number;
  warpIntensity: number;
  craterDepth?: number;
  craterWallColor?: string;
}

export interface LavaCracksConfig {
  enabled: boolean;
  crackColor: string;
  intensity: number;
  speed: number;
  scale: number;
  pulseSpeed: number;
  pulseIntensity: number;
}

export interface LavaRiverChannelConfig {
  angle?: number;
  length?: number;
  curvature?: number;
  widthScale: number;
  /** Fraction of the channel length used to widen a fissure source into the river. */
  sourceTaperFraction?: number;
  /** Runtime X, Z, and height above the performer ground plane. */
  points?: [number, number, number][];
}

/** Point lights that sit above the channel to light the rock it runs between. */
export interface LavaRiverBankLightConfig {
  count?: number;
  intensity?: number;
  distance?: number;
  /** Metres above the channel surface. Low values lay a hard disc on the bank. */
  heightOffset?: number;
}

export interface LavaRiversConfig {
  enabled: boolean;
  channels: LavaRiverChannelConfig[];
  baseColor: string;
  hotColor: string;
  crustColor: string;
  /** Chilled rock flanking the molten channel. Falls back to `crustColor`. */
  leveeColor?: string;
  flowSpeed: number;
  width: number;
  warpIntensity: number;
  crustCoverage: number;
  /**
   * How far the chilled margin reaches in from the nominal edge, as a fraction
   * of the channel half-width. Higher values leave a narrower incandescent
   * thread and a wider cooled shoulder.
   */
  edgeCooling?: number;
  /** Strength of the channel's radiance falling on the levee beside it. */
  bankRadiance?: number;
  /** Strip width reserved beyond the channel for the ragged shore contour. */
  bankMarginFraction?: number;
  /** Metres the reserved margin drops so its polygon edge tucks into the bank. */
  bankPlunge?: number;
  bankLight?: LavaRiverBankLightConfig;
  /** How the run is draped onto the baked world mesh. */
  drape?: LavaRiverDrapeConfig;
  /** How the run loses heat between the source and the terminus. */
  thermal?: LavaRiverThermalConfig;
  /** The spreading, cooling lobe the run ends on. */
  terminus?: LavaRiverTerminusConfig;
  /** The emissive breach the run emerges from. */
  source?: LavaRiverSourceConfig;
  /** Additive ground skirt that lights the corridor without spending lights. */
  bankGlow?: LavaRiverBankGlowConfig;
}

/** Sampling of the ribbon against the baked terrain, done once at build time. */
export interface LavaRiverDrapeConfig {
  /** Set false to keep the authored polyline heights. */
  enabled?: boolean;
  /** Metres the draped surface floats above the sampled ground. */
  surfaceOffset?: number;
  /** Metres the outer margin is pushed below the bank it meets. */
  marginBury?: number;
  /** Ceiling on how far the margin chases terrain downward. */
  maxMarginDrop?: number;
  /** Centreline samples along the run. Clamped to a floor of 60. */
  longitudinalSegments?: number;
  lateralSegments?: number;
}

/** Downstream cooling, which is what makes the descent legible from the side. */
export interface LavaRiverThermalConfig {
  /** Emission multiplier at the tail relative to the source. */
  falloff?: number;
  /** Extra crust coverage accumulated by the tail. */
  crustGain?: number;
  /** Strength of the transverse pressure ridges on steep sections. */
  gradeRidges?: number;
}

export interface LavaRiverTerminusConfig {
  /** Fraction of the run, measured from the tail, that spreads into the toe. */
  fraction?: number;
  /** Half-width multiplier at full spread, before the rounding cap. */
  spread?: number;
  /** Where inside the toe the semicircular cap starts closing the outline. */
  capStart?: number;
}

export interface LavaRiverSourceConfig {
  enabled?: boolean;
  /** Mouth width across the flow, in channel widths. */
  widthScale?: number;
  /** Mouth length along the flow, in channel widths. */
  lengthScale?: number;
  /** Metres the mouth's centre sits below its rim. */
  bowlDepth?: number;
  /** Extra emission at the mouth, on top of the source end of the gradient. */
  radiance?: number;
}

export interface LavaRiverBankGlowConfig {
  enabled?: boolean;
  /** Half-span of the skirt in channel half-widths. 1 is the channel edge. */
  reach?: number;
  /** Peak additive strength just outside the channel edge. */
  intensity?: number;
  /** Falloff exponent across the skirt. Higher keeps the glow tight. */
  softness?: number;
}

/**
 * A corridor the ring generator must leave empty, in the pillar group's own
 * local XZ space. `points` is a polyline; anything whose centre lands within
 * `radius` of it is dropped.
 */
export interface PillarKeepOut {
  points: [number, number][];
  radius: number;
}

export interface ObsidianPillarsConfig {
  enabled: boolean;
  rings: TreeRingConfig[];
  clearingRadius: number;
  /**
   * Optional. The rings are laid out by angle alone, so in a scene where people
   * walk THROUGH the ring rather than standing inside it, whole pillars land in
   * the walkway. Listing the walked route here punches a gate in the ring
   * instead. Omit it and placement is unchanged.
   */
  keepOut?: PillarKeepOut[];
  veinColor: string;
  veinIntensity: number;
  baseColor: string;
  heightRange: [number, number];
  pulseSpeed: number;
  pulseColor: string;
}

export interface FireWispsConfig {
  enabled: boolean;
  count: number;
  spawnRadius: number;
  heightRange: [number, number];
  driftSpeed: number;
  pulseSpeed: number;
  colors: string[];
  lightIntensity: number;
  lightDistance: number;
}

export interface EmberFountainsConfig {
  enabled: boolean;
  count: number;
  riseSpeed: number;
  colors: string[];
  sizeRange: [number, number];
  spawnRadius: number;
  maxHeight: number;
  gravity: number;
  burstInterval: number;
  burstCount: number;
}

export interface VolcanicHazeConfig {
  enabled: boolean;
  color1: string;
  color2: string;
  opacity: number;
  scale: number;
  animationSpeed: number;
  /** Seconds between lightning strikes. */
  lightningInterval: number;
  lightningIntensity: number;
  innerGlowColor: string;
  /**
   * The dome is depth-tested, so this is where it stops being sky: terrain
   * closer hides it, terrain further away is painted over. Keep it past the
   * furthest terrain any camera can reach or it cuts a shell across the
   * ridgelines.
   */
  radius: number;
  /** Bearing of the distant vent lighting the low haze. Horizontal part only. */
  underglowDirection?: [number, number, number];
  /** Defaults to `innerGlowColor`. */
  underglowColor?: string;
  /** Zero leaves the dome evenly lit at eye level. */
  underglowStrength?: number;
  /** Falloff exponent of the caldera lobe. Higher is a tighter pool. */
  underglowFocus?: number;
  /** Share of the underglow reaching the bearing opposite the vent. */
  underglowWrap?: number;
}

export interface EmberSceneConfig {
  atmosphere: EmberAtmosphereRigConfig;
  sky: SkyGradientConfig;
  fog: FogConfig;
  ground: GroundConfig;

  lavaCracks: LavaCracksConfig;
  lavaPool: LavaPoolConfig;
  lavaRivers: LavaRiversConfig | null;
  obsidianPillars: ObsidianPillarsConfig;

  fireVent: CampfireConfig | null;
  fireWisps: FireWispsConfig | null;
  emberFountains: EmberFountainsConfig | null;
  volcanicHaze: VolcanicHazeConfig | null;

  embers: FallingParticlesConfig;
  ash: FallingParticlesConfig | null;
  smoke: FallingParticlesConfig | null;
  cinders: FallingParticlesConfig | null;

  rockCount: number;
  clearingRadius: number;
  rockTintColor: string;
  rockTintBlend: number;

  hemisphereLight: HemisphereLightConfig;

  skyLight: {
    enabled: boolean;
    color: string;
    intensity: number;
    position: [number, number, number];
  } | null;
  platform: ObsidianPlatformConfig;
}

/**
 * Three lights across a 271 metre channel, high enough that each one washes the
 * bank instead of stamping a disc on it. The earlier rig sat 0.7 metres above
 * the surface at intensity 86, which put roughly twenty times more light
 * directly beneath it than on the rock it was meant to be illuminating.
 *
 * The count stays at three and is clamped again against the adaptive quality
 * tier at runtime, because the medium tier allows two dynamic lights in total
 * and the low tier none. Reach comes from `distance`, which costs nothing in a
 * forward renderer, and from the additive bank-glow skirt below; neither buys
 * corridor coverage with another light.
 */
const EMBER_LAVA_RIVER_BANK_LIGHT: LavaRiverBankLightConfig = {
  count: 3,
  intensity: 40,
  distance: 52,
  heightOffset: 3.4,
};

/**
 * The authored polyline hovers over the carved bed by 1.16 metres at the head
 * and 0.01 at the tail, which flattened the apparent profile by more than a
 * metre before anything was shaded. Draping restores the real 15 metre fall.
 */
const EMBER_LAVA_RIVER_DRAPE: LavaRiverDrapeConfig = {
  enabled: true,
  surfaceOffset: 0.1,
  marginBury: 0.14,
  maxMarginDrop: 1.2,
  longitudinalSegments: 152,
  lateralSegments: 16,
};

const EMBER_LAVA_RIVER_THERMAL: LavaRiverThermalConfig = {
  falloff: 0.42,
  crustGain: 0.1,
  gradeRidges: 0.55,
};

const EMBER_LAVA_RIVER_TERMINUS: LavaRiverTerminusConfig = {
  fraction: 0.085,
  spread: 2.15,
  capStart: 0.55,
};

/**
 * Sized to sit inside the baked crater at the head, whose authored radius is
 * six metres: a 6.4 metre channel at 1.56 gives a mouth just under ten metres
 * across, so the rim lands on rock rather than over the crater lip.
 */
const EMBER_LAVA_RIVER_SOURCE: LavaRiverSourceConfig = {
  enabled: true,
  widthScale: 1.56,
  lengthScale: 1.25,
  bowlDepth: 0.55,
  radiance: 1,
};

// Reach is in channel half-widths. At 5.2 / 0.85 the skirt laid a flat
// yellow sheet across the whole stage floor from every close camera; radiance
// off a lava bank is a narrow warm margin, not a second floor.
const EMBER_LAVA_RIVER_BANK_GLOW: LavaRiverBankGlowConfig = {
  enabled: true,
  reach: 2.6,
  intensity: 0.38,
  softness: 2.6,
};

const EMBER_PILLAR_RINGS: TreeRingConfig[] = [
  {
    radius: 8,
    count: 5,
    scaleBase: 1.2,
    scaleVariation: 0.3,
    radiusJitter: 0.8,
  },
  {
    radius: 14,
    count: 8,
    scaleBase: 0.9,
    scaleVariation: 0.25,
    radiusJitter: 1.2,
  },
];

export function createDefaultEmberConfig(
  lookId: EmberAtmosphereLookId = DEFAULT_EMBER_ATMOSPHERE_LOOK
): EmberSceneConfig {
  const look = getEmberAtmosphereLook(lookId);
  return {
    atmosphere: look.rig,
    sky: look.sky,
    fog: look.fog,
    ground: {
      color: "#151a19",
      size: 380,
      textured: false,
      opacity: 1,
    },
    lavaCracks: {
      enabled: false,
      crackColor: "#ff4400",
      intensity: 0.09,
      speed: 0.015,
      scale: 4.8,
      pulseSpeed: 0.4,
      pulseIntensity: 0.24,
    },
    lavaPool: {
      enabled: false,
      position: { x: -5, z: 4.5 },
      radius: 5.0,
      baseColor: "#cc2200",
      hotColor: "#ff6600",
      crustColor: "#3a1208",
      flowSpeed: 0.08,
      lightIntensity: 50,
      lightDistance: 22,
      pulseSpeed: 0.3,
      warpIntensity: 4.0,
      craterDepth: 0.6,
      craterWallColor: "#1a0806",
    },
    lavaRivers: {
      enabled: true,
      channels: [
        {
          widthScale: 1,
          sourceTaperFraction: volcanicWorldR7.lavaRiver.sourceTaperFraction,
          points: volcanicWorldR7.lavaRiver.pointsRuntimeXZHeight.map(
            ([x, z, height]) => [x, z, height]
          ) as [number, number, number][],
        },
      ],
      baseColor: look.lavaRivers.baseColor,
      hotColor: look.lavaRivers.hotColor,
      crustColor: look.lavaRivers.crustColor,
      leveeColor: look.lavaRivers.leveeColor,
      flowSpeed: look.lavaRivers.flowSpeed,
      width: volcanicWorldR7.lavaRiver.width,
      warpIntensity: look.lavaRivers.warpIntensity,
      crustCoverage: look.lavaRivers.crustCoverage,
      edgeCooling: look.lavaRivers.edgeCooling,
      bankRadiance: look.lavaRivers.bankRadiance,
      bankLight: EMBER_LAVA_RIVER_BANK_LIGHT,
      drape: EMBER_LAVA_RIVER_DRAPE,
      thermal: EMBER_LAVA_RIVER_THERMAL,
      terminus: EMBER_LAVA_RIVER_TERMINUS,
      source: EMBER_LAVA_RIVER_SOURCE,
      bankGlow: EMBER_LAVA_RIVER_BANK_GLOW,
    },
    obsidianPillars: {
      enabled: false,
      rings: EMBER_PILLAR_RINGS,
      clearingRadius: 8,
      veinColor: "#ff4400",
      veinIntensity: 0.6,
      baseColor: "#0a0808",
      heightRange: [2.0, 6.0],
      pulseSpeed: 0.8,
      pulseColor: "#ff6600",
    },
    fireVent: null,
    fireWisps: {
      enabled: false,
      count: 2,
      spawnRadius: 7,
      heightRange: [1.5, 4.5],
      driftSpeed: 0.25,
      pulseSpeed: 0.8,
      colors: ["#ff6600", "#ff4400", "#ffaa00"],
      lightIntensity: 6,
      lightDistance: 6,
    },
    emberFountains: {
      enabled: false,
      count: 40,
      riseSpeed: 0.6,
      colors: ["#ff4400", "#ff6600", "#ffaa00", "#ff2200"],
      sizeRange: [0.03, 0.08],
      spawnRadius: 3,
      maxHeight: 8,
      gravity: 0.3,
      burstInterval: 3.5,
      burstCount: 12,
    },
    volcanicHaze: look.volcanicHaze,
    embers: look.embers,
    ash: look.ash,
    smoke: look.smoke,
    cinders: null,
    rockCount: 0,
    clearingRadius: 10,
    rockTintColor: "#1a0a08",
    rockTintBlend: 0.4,
    hemisphereLight: look.hemisphereLight,
    skyLight: look.skyLight,
    platform: {
      enabled: false,
      radius: 4.5,
      height: 0.5,
      primaryColor: "#1a1a1a",
      glowIntensity: 0.8,
      crackIntensity: 1.0,
      lavaSpeed: 0.5,
    },
  };
}
