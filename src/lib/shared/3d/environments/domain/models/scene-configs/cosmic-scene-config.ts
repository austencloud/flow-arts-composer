/** Cosmic environment configuration and production defaults. */

import type {
  FallingParticlesConfig,
  SkyGradientConfig,
} from "../environment-models";
import type {
  FogConfig,
  GroundConfig,
  HemisphereLightConfig,
  PointLightConfig,
} from "./shared-scene-config";

export interface PlatformConfig {
  enabled: boolean;
  shape: "circle" | "hexagon" | "octagon";
  /** Platform radius (meters). */
  radius: number;
  /** Platform height/thickness (meters). */
  height: number;
  metallic: number;
  roughness: number;
  baseColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
  /** Width of the glowing edge rim (meters). */
  edgeGlowWidth: number;
  /** Pulse animation speed (Hz). */
  pulseSpeed: number;
  /** Hexagonal grid line density on top surface. 0 = no grid. */
  gridDensity: number;
  /** Grid line emissive intensity (separate from edge glow). */
  gridIntensity: number;
  /** Number of accent lights around platform edge. 0 = disabled. */
  accentLightCount: number;
  /** Intensity of each accent light. */
  accentLightIntensity: number;
  /** Falloff distance of each accent light (meters). */
  accentLightDistance: number;
  /** Audience seating enabled. */
  seatingEnabled: boolean;
  /** Number of seating rows. */
  seatingRows: number;
  /** Seating emissive accent color. Falls back to emissiveColor if empty. */
  seatingAccentColor: string;
}

export interface EarthConfig {
  enabled: boolean;
  position: [number, number, number];
  /** Sphere radius (meters). */
  radius: number;
  rimColor: string;
  rimIntensity: number;
  /** Y-axis rotation speed (rad/s). */
  rotationSpeed: number;
}

export interface NebulaConfig {
  enabled: boolean;
  color1: string;
  color2: string;
  opacity: number;
  scale: number;
  animationSpeed: number;
}

export interface EnergyParticlesConfig {
  enabled: boolean;
  count: number;
  /** Upward drift speed (m/s). */
  riseSpeed: number;
  colors: string[];
  sizeRange: [number, number];
  /** Spawn area radius around platform (meters). */
  spawnRadius: number;
  /** Maximum height before recycling (meters). */
  maxHeight: number;
}

export interface MeteorStreaksConfig {
  enabled: boolean;
  /** Average interval between meteors (seconds). */
  frequency: number;
  /** Visual travel speed used to derive the crossing duration. */
  speed: number;
  colors: string[];
  /** Relative tail length used to derive the screen-space streak. */
  trailLength: number;
  /** Trail radiance multiplier. Defaults to 1. */
  brightness?: number;
  /** Bright head diameter in screen pixels. Omit or set to 0 for a trail-only meteor. */
  headSize?: number;
}

export interface LunarCrystalsConfig {
  enabled: boolean;
  clusterCount: number;
  ringRadius: number;
  color: string;
  glowColor: string;
  glowIntensity: number;
  heightRange: [number, number];
  opacity: number;
}

// Crystal Formations (Tier 1 upgrade — replaces LunarCrystals)

export interface CrystalSpeciesConfig {
  type: "spire" | "cluster" | "plate" | "branch";
  count: number;
  sizeRange: [number, number];
  palette: string[];
  glowIntensity: number;
}

export interface CrystalModelConfig {
  path: string;
  weight: number;
  glowIntensity: number;
}

export interface CrystalFormationsConfig {
  enabled: boolean;
  seed: number;
  placementRadius: [number, number];
  totalCount: number;
  sizeRange: [number, number];
  models: CrystalModelConfig[];
  species: CrystalSpeciesConfig[];
}

export interface PrismaticCausticsConfig {
  enabled: boolean;
  baseColor: string;
  intensity: number;
  scale: number;
  speed: number;
  spectrumShift: number;
}

export interface EarthGodRaysConfig {
  enabled: boolean;
  color: string;
  intensity: number;
  count: number;
  speed: number;
}

export interface LunarGroundConfig {
  enabled: boolean;
  veinColor: string;
  veinIntensity: number;
  veinPulseSpeed: number;
  veinDensity: number;
  bioColor?: string;
  bioIntensity?: number;
  frostColor?: string;
  frostIntensity?: number;
}

export interface StarfieldConfig {
  enabled: boolean;
  count: number;
  radius: number;
  sizeRange: [number, number];
  twinkleSpeed: number;
  /**
   * Multiplies every star's alpha. Above 1 it lifts the dim majority without
   * blowing out the bright few, which is what a scene fighting a black sky
   * needs. Defaults to 1 (unchanged).
   */
  intensity?: number;
  /**
   * Exponent of the magnitude distribution. Higher means more dim stars and
   * fewer bright ones. Defaults to 3.
   */
  magnitudeFalloff?: number;
  /** Lowest per-star brightness before intensity. Defaults to 0.3. */
  brightnessFloor?: number;
  /**
   * Fraction of the sphere the distribution covers, measured down from the
   * zenith. Lower values pull stars above the tree line. Defaults to 0.6.
   */
  horizonSpread?: number;
  /** Optional art-directed elevation band in degrees, from lower to upper. */
  elevationRangeDegrees?: [number, number];
}

export interface MoonConfig {
  enabled: boolean;
  texture: string;
  /** Direction on the celestial dome. Magnitude is ignored. */
  direction?: [number, number, number];
  /** Apparent diameter in degrees. Earth's Moon averages about 0.52 degrees. */
  angularDiameterDegrees?: number;
  /** @deprecated Legacy world-space position, interpreted only as a direction. */
  position?: [number, number, number];
  /** @deprecated Legacy world-space diameter used to migrate apparent size. */
  diameter?: number;
  opacity: number;
  glowScale: number;
  glowOpacity: number;
  /** Lift the darkest crater values toward white. Defaults to 0. */
  surfaceLift?: number;
  /** Warmth of the low-horizon atmospheric tint, 0 cool to 1 amber. */
  horizonWarmth?: number;
}

export interface CosmicSceneConfig {
  sky: SkyGradientConfig;
  fog: FogConfig;
  ground: GroundConfig;
  platform: PlatformConfig;
  earth: EarthConfig;
  nebula: NebulaConfig;
  particles: {
    /** Slow-drifting star field. */
    starDrift: FallingParticlesConfig;
    /** Optional cosmic dust layer. */
    cosmicDust: FallingParticlesConfig | null;
    /** Optional rising energy motes near platform. */
    energyParticles: EnergyParticlesConfig | null;
    /** Optional meteor streaks across the sky. */
    meteorStreaks: MeteorStreaksConfig | null;
  };
  lighting: {
    ambient: HemisphereLightConfig;
    coldDirectional: {
      enabled: boolean;
      color: string;
      intensity: number;
      position: [number, number, number];
    };
    warmStation: PointLightConfig & { enabled: boolean };
    accentEmissive: {
      enabled: boolean;
      color: string;
      intensity: number;
      /** Pulse animation speed (Hz). */
      pulseSpeed: number;
    };
  };
  crystals: LunarCrystalsConfig;
  crystalFormations: CrystalFormationsConfig;
  caustics: PrismaticCausticsConfig;
  godRays: EarthGodRaysConfig;
  lunarGround: LunarGroundConfig;
  starfield: StarfieldConfig;
}

const LUNAR_TEXTURES = {
  diffuseMap: "/textures/terrain/rock/diffuse.jpg",
  normalMap: "/textures/terrain/rock/normal.jpg",
  roughnessMap: "/textures/terrain/rock/roughness.jpg",
};

export function createDefaultCosmicNightConfig(): CosmicSceneConfig {
  return {
    // Space seen from the Moon: black, and no air for fog.
    sky: {
      topColor: "#000000",
      midColor: "#010102",
      bottomColor: "#020203",
    },
    fog: { color: "#000000", density: 0 },
    ground: {
      color: "#1a1a2e",
      size: 60,
      textured: true,
      ...LUNAR_TEXTURES,
      normalScale: 2.0,
      textureRepeat: 30,
      opacity: 0.9,
    },
    platform: {
      enabled: true,
      shape: "octagon",
      radius: 3.5,
      height: 0.4,
      metallic: 0.8,
      roughness: 0.2,
      baseColor: "#0a0a1a",
      emissiveColor: "#4488ff",
      emissiveIntensity: 0.6,
      edgeGlowWidth: 0.04,
      pulseSpeed: 0.5,
      gridDensity: 8,
      gridIntensity: 0.3,
      accentLightCount: 8,
      accentLightIntensity: 15,
      accentLightDistance: 6,
      seatingEnabled: true,
      seatingRows: 3,
      seatingAccentColor: "#4488ff",
    },
    earth: {
      enabled: true,
      position: [-40, 2, -60],
      radius: 8,
      rimColor: "#6ab4ff",
      rimIntensity: 1.2,
      rotationSpeed: 0.02,
    },
    nebula: {
      enabled: true,
      color1: "#1a1040",
      color2: "#2a1555",
      opacity: 0.15,
      scale: 2.5,
      animationSpeed: 0.08,
    },
    particles: {
      starDrift: {
        type: "stars",
        count: 200,
        area: { width: 80, height: 50, depth: 80 },
        speed: 0.005,
        colors: ["#ffffff", "#aaccff", "#ccbbee", "#8877cc"],
        sizeRange: [0.02, 0.12],
        spin: false,
      },
      cosmicDust: {
        type: "dust",
        count: 100,
        area: { width: 40, height: 20, depth: 40 },
        speed: 0.015,
        colors: ["#4466aa", "#3355aa", "#2244aa", "#5577cc"],
        sizeRange: [0.01, 0.06],
        spin: false,
      },
      energyParticles: {
        enabled: true,
        count: 50,
        riseSpeed: 0.3,
        colors: ["#4488ff", "#66aaff", "#88ccff", "#aaddff"],
        sizeRange: [0.03, 0.08],
        spawnRadius: 2.5,
        maxHeight: 6,
      },
      meteorStreaks: {
        enabled: true,
        frequency: 8,
        speed: 15,
        colors: ["#ffffff", "#aaccff", "#88aaee"],
        trailLength: 4,
      },
    },
    lighting: {
      ambient: {
        skyColor: "#2a2a55",
        groundColor: "#151525",
        intensity: 0.7,
      },
      coldDirectional: {
        enabled: true,
        color: "#8899dd",
        intensity: 1.2,
        // Rakes across the observatory terrace relief from the orrery flank
        // instead of backlighting from Earth's own direction.
        position: [28, 12, -19],
      },
      warmStation: {
        enabled: true,
        color: "#6688bb",
        intensity: 25,
        distance: 12,
        decay: 1.5,
        heightOffset: 0.5,
      },
      accentEmissive: {
        enabled: true,
        color: "#4488ff",
        intensity: 0.4,
        pulseSpeed: 0.5,
      },
    },
    crystals: {
      enabled: false,
      clusterCount: 8,
      ringRadius: 6.5,
      color: "#334466",
      glowColor: "#4488ff",
      glowIntensity: 0.8,
      heightRange: [0.8, 2.5],
      opacity: 0.6,
    },
    crystalFormations: {
      enabled: true,
      seed: 42,
      placementRadius: [7, 22],
      totalCount: 72,
      sizeRange: [0.6, 2.8],
      models: [
        {
          path: "/models/cosmic/crystal-spire-prismatic.glb",
          weight: 2.5,
          glowIntensity: 0.9,
        },
        {
          path: "/models/cosmic/crystal-pyramid-blue.glb",
          weight: 2.5,
          glowIntensity: 0.8,
        },
        {
          path: "/models/cosmic/crystal-cluster-aurora.glb",
          weight: 2,
          glowIntensity: 1.0,
        },
        {
          path: "/models/cosmic/crystal-branch-moonlit.glb",
          weight: 2,
          glowIntensity: 0.9,
        },
        {
          path: "/models/cosmic/crystal-spire-cyan.glb",
          weight: 2.5,
          glowIntensity: 0.85,
        },
        {
          path: "/models/cosmic/crystal-cluster-emerald.glb",
          weight: 2,
          glowIntensity: 1.0,
        },
        {
          path: "/models/cosmic/crystal-spire-amethyst.glb",
          weight: 2.5,
          glowIntensity: 0.95,
        },
      ],
      species: [],
    },
    caustics: {
      enabled: true,
      baseColor: "#4488ff",
      intensity: 0.35,
      scale: 1.2,
      speed: 1.0,
      spectrumShift: 0.02,
    },
    godRays: {
      enabled: true,
      color: "#4488ff",
      intensity: 0.15,
      count: 5,
      speed: 0.3,
    },
    lunarGround: {
      enabled: true,
      veinColor: "#4488ff",
      veinIntensity: 0.4,
      veinPulseSpeed: 0.5,
      veinDensity: 3.0,
      bioColor: "#2266cc",
      bioIntensity: 0.3,
      frostColor: "#aaccff",
      frostIntensity: 0.4,
    },
    starfield: {
      enabled: true,
      count: 1500,
      radius: 75,
      sizeRange: [0.5, 3.0],
      twinkleSpeed: 0.8,
    },
  };
}

export function createDefaultCosmicAuroraConfig(): CosmicSceneConfig {
  return {
    sky: {
      topColor: "#030810",
      midColor: "#0a2a2a",
      bottomColor: "#102030",
    },
    fog: { color: "#061818", density: 0.006 },
    ground: {
      color: "#0a1a1a",
      size: 60,
      textured: true,
      ...LUNAR_TEXTURES,
      normalScale: 2.0,
      textureRepeat: 30,
      opacity: 0.9,
    },
    platform: {
      enabled: true,
      shape: "octagon",
      radius: 3.5,
      height: 0.4,
      metallic: 0.8,
      roughness: 0.2,
      baseColor: "#0a1a1a",
      emissiveColor: "#00ccaa",
      emissiveIntensity: 0.6,
      edgeGlowWidth: 0.04,
      pulseSpeed: 0.4,
      gridDensity: 8,
      gridIntensity: 0.3,
      accentLightCount: 8,
      accentLightIntensity: 15,
      accentLightDistance: 6,
      seatingEnabled: true,
      seatingRows: 3,
      seatingAccentColor: "#00ccaa",
    },
    earth: {
      enabled: true,
      position: [-40, 2, -60],
      radius: 8,
      rimColor: "#44ddcc",
      rimIntensity: 1.4,
      rotationSpeed: 0.02,
    },
    nebula: {
      enabled: true,
      color1: "#00aaaa",
      color2: "#aa44aa",
      opacity: 0.2,
      scale: 1.5,
      animationSpeed: 0.02,
    },
    particles: {
      starDrift: {
        type: "stars",
        count: 200,
        area: { width: 80, height: 50, depth: 80 },
        speed: 0.005,
        colors: ["#44ffee", "#ff66cc", "#33ddbb", "#ee88aa"],
        sizeRange: [0.02, 0.12],
        spin: false,
      },
      cosmicDust: {
        type: "dust",
        count: 120,
        area: { width: 40, height: 20, depth: 40 },
        speed: 0.02,
        colors: ["#00aa88", "#aa44aa", "#00ccaa", "#cc66cc"],
        sizeRange: [0.01, 0.06],
        spin: false,
      },
      energyParticles: {
        enabled: true,
        count: 60,
        riseSpeed: 0.25,
        colors: ["#00ccaa", "#44eedd", "#00ffbb", "#66ffcc"],
        sizeRange: [0.03, 0.08],
        spawnRadius: 2.5,
        maxHeight: 6,
      },
      meteorStreaks: {
        enabled: true,
        frequency: 6,
        speed: 18,
        colors: ["#44ffee", "#ff66cc", "#88ffdd"],
        trailLength: 5,
      },
    },
    lighting: {
      ambient: {
        skyColor: "#1a4444",
        groundColor: "#0c1a1a",
        intensity: 0.8,
      },
      coldDirectional: {
        enabled: true,
        color: "#66cccc",
        intensity: 1.1,
        position: [28, 12, -19],
      },
      warmStation: {
        enabled: true,
        color: "#33bb99",
        intensity: 28,
        distance: 12,
        decay: 1.5,
        heightOffset: 0.5,
      },
      accentEmissive: {
        enabled: true,
        color: "#00ccaa",
        intensity: 0.5,
        pulseSpeed: 0.4,
      },
    },
    crystals: {
      enabled: false,
      clusterCount: 10,
      ringRadius: 6.5,
      color: "#2a4455",
      glowColor: "#00ccaa",
      glowIntensity: 1.0,
      heightRange: [1.0, 3.0],
      opacity: 0.55,
    },
    crystalFormations: {
      enabled: true,
      seed: 99,
      placementRadius: [7, 22],
      totalCount: 84,
      sizeRange: [0.6, 3.0],
      models: [
        {
          path: "/models/cosmic/crystal-spire-prismatic.glb",
          weight: 2.5,
          glowIntensity: 1.0,
        },
        {
          path: "/models/cosmic/crystal-pyramid-blue.glb",
          weight: 2.5,
          glowIntensity: 0.9,
        },
        {
          path: "/models/cosmic/crystal-cluster-aurora.glb",
          weight: 2.5,
          glowIntensity: 1.2,
        },
        {
          path: "/models/cosmic/crystal-branch-moonlit.glb",
          weight: 2,
          glowIntensity: 1.0,
        },
        {
          path: "/models/cosmic/crystal-spire-cyan.glb",
          weight: 2.5,
          glowIntensity: 0.9,
        },
        {
          path: "/models/cosmic/crystal-cluster-emerald.glb",
          weight: 2.5,
          glowIntensity: 1.1,
        },
        {
          path: "/models/cosmic/crystal-spire-amethyst.glb",
          weight: 2.5,
          glowIntensity: 1.0,
        },
      ],
      species: [],
    },
    caustics: {
      enabled: true,
      baseColor: "#00ccaa",
      intensity: 0.4,
      scale: 1.0,
      speed: 1.2,
      spectrumShift: 0.03,
    },
    godRays: {
      enabled: true,
      color: "#44ddcc",
      intensity: 0.12,
      count: 4,
      speed: 0.25,
    },
    lunarGround: {
      enabled: true,
      veinColor: "#00ccaa",
      veinIntensity: 0.5,
      veinPulseSpeed: 0.4,
      veinDensity: 2.5,
      bioColor: "#00aa88",
      bioIntensity: 0.35,
      frostColor: "#88eedd",
      frostIntensity: 0.45,
    },
    starfield: {
      enabled: true,
      count: 1500,
      radius: 75,
      sizeRange: [0.5, 3.0],
      twinkleSpeed: 0.6,
    },
  };
}
