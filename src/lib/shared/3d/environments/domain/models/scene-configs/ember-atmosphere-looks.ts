import type {
  FallingParticlesConfig,
  SkyGradientConfig,
} from "../environment-models";
import type { FogConfig, HemisphereLightConfig } from "./shared-scene-config";
import type {
  LavaRiversConfig,
  VolcanicHazeConfig,
} from "./ember-scene-config";

export const EMBER_ATMOSPHERE_LOOK_IDS = [
  "blackglass-inferno",
  "furnace-storm",
  "sulfur-caldera",
] as const;

export type EmberAtmosphereLookId = (typeof EMBER_ATMOSPHERE_LOOK_IDS)[number];

export const DEFAULT_EMBER_ATMOSPHERE_LOOK: EmberAtmosphereLookId =
  "blackglass-inferno";

export interface EmberDirectionalLightConfig {
  position: [number, number, number];
  color: string;
  intensity: number;
}

export interface EmberPointLightConfig extends EmberDirectionalLightConfig {
  distance: number;
  decay: number;
}

export interface EmberHeatFieldConfig {
  position: { x: number; z: number };
  radius: number;
  height: number;
  intensity: number;
}

export interface EmberPlumeConfig {
  position: [number, number, number];
  count: number;
  /** Mouth footprint and the column height a puff dissolves over. */
  area: { width: number; height: number; depth: number };
  /**
   * Mean climb in metres per second across a puff's whole life. Buoyancy runs
   * above it at the mouth and below it at the crown, and `area.height` divided
   * by it is how long a puff lives — so this sets the pace of the column, not
   * just the speed of a sprite.
   */
  speed: number;
  /** Ash at the mouth, underlit by the vent. */
  litColor: string;
  /** Ash aloft, where the column is a silhouette against the sky. */
  ashColor: string;
  sizeRange: [number, number];
  opacity: number;
  motionScale: number;
  /** Metres of lateral drift per metre climbed. One wind across a look. */
  windShear?: [number, number];
  /** Radius multiplier at birth and at dissolution. */
  growth?: [number, number];
}

interface EmberMaterialLayerConfig {
  tint: string;
  tintBlend: number;
  emissive: string;
  emissiveBlend: number;
  emissiveIntensity: number;
  roughnessScale: number;
  metalnessAdd: number;
}

export interface EmberMaterialTreatmentConfig {
  world: EmberMaterialLayerConfig;
  playableSurface: EmberMaterialLayerConfig;
  meshyGeology: EmberMaterialLayerConfig;
  mineral: EmberMaterialLayerConfig;
}

export interface EmberAtmosphereRigConfig {
  id: EmberAtmosphereLookId;
  label: string;
  directionals: EmberDirectionalLightConfig[];
  points: EmberPointLightConfig[];
  calderaLight: EmberPointLightConfig;
  heatFields: EmberHeatFieldConfig[];
  plumes: EmberPlumeConfig[];
  materials: EmberMaterialTreatmentConfig;
}

export interface EmberAtmosphereLookPreset {
  id: EmberAtmosphereLookId;
  label: string;
  sky: SkyGradientConfig;
  fog: FogConfig;
  lavaRivers: Required<
    Pick<
      LavaRiversConfig,
      | "baseColor"
      | "hotColor"
      | "crustColor"
      | "leveeColor"
      | "flowSpeed"
      | "warpIntensity"
      | "crustCoverage"
      | "edgeCooling"
      | "bankRadiance"
    >
  >;
  volcanicHaze: VolcanicHazeConfig;
  embers: FallingParticlesConfig;
  ash: FallingParticlesConfig;
  smoke: FallingParticlesConfig;
  hemisphereLight: HemisphereLightConfig;
  skyLight: {
    enabled: true;
    color: string;
    intensity: number;
    position: [number, number, number];
  };
  rig: EmberAtmosphereRigConfig;
}

/**
 * Bearing of the active caldera, matching `rig.calderaLight`. The sky glow and
 * the haze underglow both key off it so the lit half of the sky and the lit
 * terrain agree.
 */
const CALDERA_BEARING: [number, number, number] = [-25, 0, 145];

/**
 * The baked world spans x ±190 and z −145…229, so the furthest terrain any
 * camera can frame is roughly 530 m out. The haze dome is depth-tested; at its
 * old 260 it cut a visible shell through the ridgelines and only the terrain
 * behind that shell received any atmosphere. Sitting it past the world makes it
 * purely sky and leaves every metre of distance to scene fog.
 */
const HAZE_DOME_RADIUS = 660;

/**
 * Scene fog is the only aerial-perspective mechanism the scene has, so its
 * colour is the colour distance converges to. A near-black fog drove every
 * ridge, mesa and the basalt tower to a flat cutout the further away it stood.
 * Each look's fog now sits between its own sky mid and bottom stops: warm
 * enough that distance desaturates into atmosphere, dark enough that the
 * ridgeline still reads against the lit sky. Densities are set so the
 * performer's 25 m stays under two per cent and the wash arrives past 60 m.
 */
const FOG: Record<EmberAtmosphereLookId, FogConfig> = {
  "blackglass-inferno": { color: "#3f2018", density: 0.0042 },
  // The two coloured looks were set a third to three-quarters heavier than
  // blackglass, which at the F09 orbit turned each into one flat wash: the
  // lava run went to a smear and the far ridge lost its form entirely. A
  // brighter fog colour carries much further at the same density than the
  // near-black blackglass fog does, so matching blackglass's reach means
  // sitting close to its density, not above it. Storm keeps a touch more haze
  // than the other two because that is the look's whole premise.
  "furnace-storm": { color: "#6b3018", density: 0.0046 },
  "sulfur-caldera": { color: "#443f22", density: 0.0044 },
};

/**
 * A grazing fill on the terminus bearing, which the other four directionals
 * leave dark: two rake from the caldera side, one is nearly overhead. At about
 * eight degrees of elevation it lands on vertical rock — mesa walls, ridge
 * flanks, the basalt tower's columns — and contributes barely a seventh of its
 * intensity to level ground, so it gives distant form back without lifting the
 * plain or diluting the close-range rim light.
 */
const TERMINUS_FILL_POSITION: [number, number, number] = [26, 18, -130];

const BLACKGLASS_INFERNO: EmberAtmosphereLookPreset = {
  id: "blackglass-inferno",
  label: "Blackglass Inferno",
  sky: {
    topColor: "#05070e",
    // The mid stop owns most of the visible sky whenever a camera sits above
    // the plain and looks down the valley, so a plum near-black there is what
    // read as a void over the terminus.
    midColor: "#341a15",
    bottomColor: "#7d2a10",
    horizonGlow: {
      color: "#c8451a",
      direction: CALDERA_BEARING,
      height: 0.24,
      spread: 0.62,
      intensity: 0.38,
    },
  },
  fog: FOG["blackglass-inferno"],
  lavaRivers: {
    baseColor: "#e33a05",
    hotColor: "#ffd05b",
    crustColor: "#070303",
    leveeColor: "#231512",
    flowSpeed: 0.06,
    warpIntensity: 0.68,
    crustCoverage: 0.46,
    edgeCooling: 0.34,
    bankRadiance: 0.5,
  },
  volcanicHaze: {
    enabled: true,
    color1: "#7b2b16",
    color2: "#090b0f",
    opacity: 0.42,
    scale: 2.7,
    animationSpeed: 0.035,
    lightningInterval: 7.5,
    lightningIntensity: 0.5,
    innerGlowColor: "#ff5a12",
    radius: HAZE_DOME_RADIUS,
    underglowDirection: CALDERA_BEARING,
    underglowColor: "#d8501a",
    underglowStrength: 0.42,
    underglowFocus: 2.2,
    underglowWrap: 0.3,
  },
  // A mote whose projected size falls under a pixel is still drawn a whole
  // pixel wide, so at range these fields used to read as hot white specks
  // parked on the sky. `subPixel` charges each mote only the coverage it earns
  // and `fade` retires it before it can drift into empty sky as a stray.
  embers: {
    type: "embers",
    count: 126,
    area: { width: 28, height: 11, depth: 34 },
    speed: 0.17,
    colors: ["#ff3a08", "#ff6a0a", "#ff9c20", "#ffb03a"],
    sizeRange: [0.014, 0.05],
    spin: false,
    buoyant: true,
    rangeFalloff: {
      subPixel: true,
      fade: [45, 110],
      tint: { color: "#c22a04", start: 22, end: 90 },
    },
  },
  ash: {
    type: "dust",
    count: 118,
    area: { width: 34, height: 13, depth: 42 },
    speed: 0.038,
    colors: ["#5c4038", "#3a2c28", "#6e4b3a", "#2a2422"],
    sizeRange: [0.018, 0.07],
    spin: false,
    rangeFalloff: {
      subPixel: true,
      fade: [35, 85],
      tint: { color: "#1c0f0c", start: 18, end: 70 },
    },
  },
  smoke: {
    type: "smoke",
    count: 34,
    area: { width: 34, height: 10, depth: 38 },
    speed: 0.018,
    colors: ["#160b0b", "#23100d", "#0b080b", "#32120d"],
    sizeRange: [0.12, 0.38],
    spin: false,
    buoyant: true,
    rangeFalloff: { subPixel: true, fade: [40, 95] },
  },
  // A hemisphere's ground colour is what reaches the vertical faces the sky
  // half misses, so the basin bounce carries the sides of every column and
  // cliff. It was dark enough that those faces had nothing but the two keys.
  hemisphereLight: {
    skyColor: "#8799a2",
    groundColor: "#46170e",
    intensity: 1.44,
  },
  skyLight: {
    enabled: true,
    color: "#ffd2b0",
    intensity: 2.05,
    position: [-18, 24, -10],
  },
  rig: {
    id: "blackglass-inferno",
    label: "Blackglass Inferno",
    directionals: [
      { position: [18, 15, 18], color: "#ffc18c", intensity: 0.72 },
      { position: [-20, 10, 12], color: "#7fa9bd", intensity: 1.22 },
      { position: [0, 24, -6], color: "#ffeadb", intensity: 0.38 },
      { position: [-34, 20, 90], color: "#c84620", intensity: 0.68 },
      { position: TERMINUS_FILL_POSITION, color: "#8a6259", intensity: 0.46 },
    ],
    points: [
      {
        position: [-8, 4.6, 15],
        color: "#ff5b13",
        intensity: 118,
        distance: 34,
        decay: 2,
      },
      // Ground irradiance falls as height/dist^3, so a light close to a flat
      // plain paints a hard disc: at 1.1m over 12m these two dropped 196:1 and
      // 14:1 across six metres. The river lights its own banks now, so these
      // sit high enough to wash the plain instead of spotlighting it.
      {
        position: [5, 4, 11],
        color: "#ff8a20",
        intensity: 22,
        distance: 26,
        decay: 2,
      },
      {
        position: [-5, 3.2, -1],
        color: "#ff4210",
        intensity: 16,
        distance: 30,
        decay: 2,
      },
      {
        position: [-12, 10, 30],
        color: "#587b91",
        intensity: 96,
        distance: 46,
        decay: 2,
      },
      {
        position: [2, 5, -108],
        color: "#ff4610",
        intensity: 86,
        distance: 44,
        decay: 2,
      },
    ],
    calderaLight: {
      position: [-25, 18, 145],
      color: "#ff3d0b",
      intensity: 210,
      distance: 58,
      decay: 2,
    },
    heatFields: [
      { position: { x: 14, z: 2 }, radius: 3.4, height: 5.2, intensity: 0.035 },
      { position: { x: 8, z: 40 }, radius: 4.8, height: 8, intensity: 0.038 },
      {
        position: { x: -12, z: -72 },
        radius: 5.4,
        height: 7.5,
        intensity: 0.024,
      },
      { position: { x: -25, z: 145 }, radius: 9, height: 15, intensity: 0.06 },
    ],
    // Ash is lit from beneath, so `litColor` holds the mouth and `ashColor`
    // takes the crown into silhouette. Normal blending carries both: a column
    // darkens the bright horizon band and lightens the near-black zenith from
    // one material. One shear vector per look keeps every vent on one wind.
    //
    // The crown stays near-black on purpose: against this sky, which sits near
    // 0.03 linear luminance, the dark crown carries roughly four times the
    // silhouette contrast of the grey the other two looks use. What kept the
    // columns off every camera was coverage, not hue — at 0.24-0.34 opacity,
    // spread across a soft body falloff and mottling, a whole column could not
    // move a pixel far enough to see. The opacities below are what buys the
    // silhouette; `PLUME_FOG_BLEND_CAP` is what stops distance erasing it.
    plumes: [
      {
        position: [-25, 44, 145],
        count: 64,
        area: { width: 18, height: 34, depth: 16 },
        speed: 2.05,
        litColor: "#7a3a18",
        ashColor: "#14100f",
        sizeRange: [1.5, 3.6],
        opacity: 0.68,
        motionScale: 0.7,
        windShear: [0.34, -0.12],
        growth: [0.22, 1.15],
      },
      {
        position: [34, 15, -74],
        count: 24,
        area: { width: 8, height: 18, depth: 8 },
        speed: 1.9,
        litColor: "#6b3315",
        ashColor: "#14100f",
        sizeRange: [0.8, 1.85],
        opacity: 0.5,
        motionScale: 0.6,
        windShear: [0.34, -0.12],
        growth: [0.26, 1],
      },
      {
        position: [-37, 12, 28],
        count: 18,
        area: { width: 6, height: 12, depth: 6 },
        speed: 1.7,
        litColor: "#6b3315",
        ashColor: "#16110f",
        sizeRange: [0.55, 1.3],
        opacity: 0.46,
        motionScale: 0.56,
        windShear: [0.34, -0.12],
        growth: [0.26, 1],
      },
      {
        position: [2, 12, -108],
        count: 32,
        area: { width: 10, height: 22, depth: 9 },
        speed: 1.95,
        litColor: "#74371a",
        ashColor: "#15110f",
        sizeRange: [0.95, 2.25],
        opacity: 0.54,
        motionScale: 0.64,
        windShear: [0.34, -0.12],
        growth: [0.24, 1.08],
      },
    ],
    materials: {
      world: {
        tint: "#03070a",
        tintBlend: 0.52,
        emissive: "#3a0903",
        emissiveBlend: 0.08,
        emissiveIntensity: 0.16,
        roughnessScale: 1.34,
        metalnessAdd: -0.35,
      },
      playableSurface: {
        tint: "#070b0d",
        tintBlend: 0.34,
        emissive: "#681704",
        emissiveBlend: 0.025,
        emissiveIntensity: 0.05,
        roughnessScale: 1.8,
        metalnessAdd: -0.4,
      },
      meshyGeology: {
        tint: "#151a1c",
        tintBlend: 0.08,
        emissive: "#4a0d03",
        emissiveBlend: 0.06,
        emissiveIntensity: 0.14,
        roughnessScale: 0.88,
        metalnessAdd: 0.05,
      },
      mineral: {
        tint: "#482119",
        tintBlend: 0.035,
        emissive: "#2a0904",
        emissiveBlend: 0.01,
        emissiveIntensity: 0.025,
        roughnessScale: 0.9,
        metalnessAdd: 0,
      },
    },
  },
};

const FURNACE_STORM: EmberAtmosphereLookPreset = {
  ...BLACKGLASS_INFERNO,
  id: "furnace-storm",
  label: "Furnace Storm",
  sky: {
    topColor: "#1a0a09",
    midColor: "#54180c",
    bottomColor: "#b23a10",
    horizonGlow: {
      color: "#e0561d",
      direction: CALDERA_BEARING,
      height: 0.36,
      spread: 0.8,
      intensity: 0.66,
    },
  },
  fog: FOG["furnace-storm"],
  lavaRivers: {
    ...BLACKGLASS_INFERNO.lavaRivers,
    baseColor: "#e74306",
    hotColor: "#ffd057",
    leveeColor: "#2b1710",
    crustCoverage: 0.58,
    edgeCooling: 0.29,
    bankRadiance: 0.62,
  },
  // Storm air scatters furthest, so its glow wraps hardest onto the bearings
  // facing away from the vent and its lobe is the loosest of the three.
  volcanicHaze: {
    ...BLACKGLASS_INFERNO.volcanicHaze,
    color1: "#b93b13",
    color2: "#260807",
    opacity: 0.5,
    scale: 2.8,
    animationSpeed: 0.05,
    lightningInterval: 4.6,
    lightningIntensity: 0.8,
    underglowColor: "#f0631f",
    underglowStrength: 0.54,
    underglowFocus: 1.9,
    underglowWrap: 0.38,
  },
  // Furnace already ran the densest air of the three looks, so it gains its
  // liveliness from the shared larger mote sizes rather than from more of them.
  embers: {
    ...BLACKGLASS_INFERNO.embers,
    count: 164,
    speed: 0.22,
  },
  ash: {
    ...BLACKGLASS_INFERNO.ash,
    count: 124,
    colors: ["#8a4c30", "#5a3428", "#a4643a", "#382723"],
    rangeFalloff: {
      subPixel: true,
      fade: [35, 85],
      tint: { color: "#32130d", start: 18, end: 70 },
    },
  },
  smoke: {
    ...BLACKGLASS_INFERNO.smoke,
    count: 38,
    colors: ["#35130e", "#541d12", "#1e1010", "#6b2514"],
  },
  hemisphereLight: {
    skyColor: "#b87056",
    groundColor: "#9c3411",
    intensity: 1.3,
  },
  skyLight: {
    enabled: true,
    color: "#ffb677",
    intensity: 1.9,
    position: [-12, 22, -8],
  },
  rig: {
    ...BLACKGLASS_INFERNO.rig,
    id: "furnace-storm",
    label: "Furnace Storm",
    directionals: [
      { position: [16, 18, 12], color: "#ffad65", intensity: 0.86 },
      { position: [-18, 12, 14], color: "#a06f6a", intensity: 0.54 },
      { position: [0, 26, -4], color: "#ffe1bf", intensity: 0.42 },
      { position: [-30, 18, 86], color: "#ff5520", intensity: 0.82 },
      { position: TERMINUS_FILL_POSITION, color: "#a97056", intensity: 0.56 },
    ],
    points: BLACKGLASS_INFERNO.rig.points.map((light) => ({
      ...light,
      intensity: light.intensity * 1.25,
      color: "#ff6720",
    })),
    // Storm-grey ash, driven harder and leaning further off each vent.
    plumes: BLACKGLASS_INFERNO.rig.plumes.map((plume) => ({
      ...plume,
      count: Math.max(12, Math.floor(plume.count * 0.72)),
      // A storm drives its columns harder and shreds them sooner, so the same
      // vents climb faster here on top of nearly twice the lateral shear.
      speed: plume.speed * 1.18,
      litColor: "#8f4a20",
      ashColor: "#2e2a2c",
      opacity: plume.opacity * 1.12,
      windShear: [0.52, -0.2] as [number, number],
    })),
    calderaLight: {
      ...BLACKGLASS_INFERNO.rig.calderaLight,
      intensity: 215,
      distance: 68,
    },
    materials: {
      ...BLACKGLASS_INFERNO.rig.materials,
      world: {
        ...BLACKGLASS_INFERNO.rig.materials.world,
        tint: "#4b1b0f",
        tintBlend: 0.16,
        emissiveIntensity: 0.24,
      },
      playableSurface: {
        ...BLACKGLASS_INFERNO.rig.materials.playableSurface,
        tint: "#32100b",
        tintBlend: 0.22,
        emissiveIntensity: 0.32,
      },
    },
  },
};

const SULFUR_CALDERA: EmberAtmosphereLookPreset = {
  ...BLACKGLASS_INFERNO,
  id: "sulfur-caldera",
  label: "Sulfur Caldera",
  sky: {
    topColor: "#0b0f0b",
    midColor: "#333a1f",
    bottomColor: "#7f5a13",
    horizonGlow: {
      color: "#c99a2a",
      direction: CALDERA_BEARING,
      height: 0.28,
      spread: 0.68,
      intensity: 0.46,
    },
  },
  fog: FOG["sulfur-caldera"],
  lavaRivers: {
    ...BLACKGLASS_INFERNO.lavaRivers,
    baseColor: "#bd3704",
    hotColor: "#ffd65a",
    crustColor: "#0b0904",
    leveeColor: "#2a2314",
    crustCoverage: 0.7,
    edgeCooling: 0.42,
    bankRadiance: 0.34,
  },
  // Clear sulfurous air holds the tightest lobe of the three, so the vent
  // stays a readable direction; the wrap keeps the far bearings from emptying.
  volcanicHaze: {
    ...BLACKGLASS_INFERNO.volcanicHaze,
    color1: "#767023",
    color2: "#12150c",
    opacity: 0.34,
    scale: 1.85,
    animationSpeed: 0.028,
    lightningIntensity: 0.26,
    innerGlowColor: "#e8b83d",
    underglowColor: "#d8a537",
    underglowStrength: 0.34,
    underglowFocus: 2.6,
    underglowWrap: 0.24,
  },
  embers: {
    ...BLACKGLASS_INFERNO.embers,
    count: 128,
    colors: ["#ff6a0a", "#ffa21b", "#ffc02e", "#ffce4d"],
    rangeFalloff: {
      subPixel: true,
      fade: [45, 110],
      tint: { color: "#c96a08", start: 22, end: 90 },
    },
  },
  ash: {
    ...BLACKGLASS_INFERNO.ash,
    count: 122,
    colors: ["#7a6f42", "#4e4a30", "#94814a", "#343626"],
    rangeFalloff: {
      subPixel: true,
      fade: [35, 85],
      tint: { color: "#293019", start: 18, end: 70 },
    },
  },
  smoke: {
    ...BLACKGLASS_INFERNO.smoke,
    count: 34,
    colors: ["#22251b", "#3a3c25", "#151812", "#4b4524"],
  },
  hemisphereLight: {
    skyColor: "#879078",
    groundColor: "#6e6224",
    intensity: 1.24,
  },
  skyLight: {
    enabled: true,
    color: "#e5e1b0",
    intensity: 1.72,
    position: [-20, 25, -4],
  },
  rig: {
    ...BLACKGLASS_INFERNO.rig,
    id: "sulfur-caldera",
    label: "Sulfur Caldera",
    // Sulfur-tinged ash on a slack wind: the columns stand nearly upright and
    // hold their shape longer than the storm's do.
    plumes: BLACKGLASS_INFERNO.rig.plumes.map((plume) => ({
      ...plume,
      litColor: "#8f7a24",
      ashColor: "#26261a",
      windShear: [0.22, -0.08] as [number, number],
    })),
    directionals: [
      { position: [18, 16, 14], color: "#d9d3a5", intensity: 0.64 },
      { position: [-22, 11, 16], color: "#789082", intensity: 0.68 },
      { position: [0, 25, -5], color: "#fff3cb", intensity: 0.34 },
      { position: [-34, 20, 88], color: "#a88724", intensity: 0.62 },
      { position: TERMINUS_FILL_POSITION, color: "#8f8a68", intensity: 0.44 },
    ],
    points: BLACKGLASS_INFERNO.rig.points.map((light, index) => ({
      ...light,
      color: index === 3 ? "#698c86" : "#df9b25",
      intensity: light.intensity * 0.88,
    })),
    calderaLight: {
      ...BLACKGLASS_INFERNO.rig.calderaLight,
      color: "#e6a82a",
      intensity: 150,
    },
    materials: {
      ...BLACKGLASS_INFERNO.rig.materials,
      world: {
        ...BLACKGLASS_INFERNO.rig.materials.world,
        tint: "#2f311d",
        tintBlend: 0.13,
        emissive: "#48400f",
      },
      mineral: {
        ...BLACKGLASS_INFERNO.rig.materials.mineral,
        tint: "#9d7c23",
        tintBlend: 0.28,
        emissive: "#6c5310",
      },
    },
  },
};

const LOOKS: Record<EmberAtmosphereLookId, EmberAtmosphereLookPreset> = {
  "blackglass-inferno": BLACKGLASS_INFERNO,
  "furnace-storm": FURNACE_STORM,
  "sulfur-caldera": SULFUR_CALDERA,
};

export function isEmberAtmosphereLookId(
  value: string | null | undefined
): value is EmberAtmosphereLookId {
  return EMBER_ATMOSPHERE_LOOK_IDS.includes(value as EmberAtmosphereLookId);
}

export function getEmberAtmosphereLook(
  id: EmberAtmosphereLookId = DEFAULT_EMBER_ATMOSPHERE_LOOK
): EmberAtmosphereLookPreset {
  return LOOKS[id];
}
