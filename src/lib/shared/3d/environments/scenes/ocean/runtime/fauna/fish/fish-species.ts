import { LocomotionMode } from "./fish-locomotion";

export { LocomotionMode };

export enum TrophicRole {
  ApexPredator = 0,
  Mesopredator = 1,
  SchoolingPrey = 2,
  ReefCruiser = 3,
  Territorial = 4,
  Neutral = 5,
}

export interface FishSpeciesConfig {
  name: string;
  modelFile: string;
  locomotionMode: LocomotionMode;
  trophicRole: TrophicRole;
  sizeScale: number;
  speed: [number, number];
  social: [number, number];
  bold: [number, number];
  instanceCount: number;
  resident: boolean;
}

// 13 resident species — always loaded, ~87 total fish
export const RESIDENT_SPECIES: FishSpeciesConfig[] = [
  {
    name: "Clownfish",
    modelFile: "clownfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Territorial,
    sizeScale: 0.22,
    speed: [0.6, 0.75],
    social: [0.8, 1.2],
    bold: [0.7, 1.0],
    instanceCount: 4,
    resident: true,
  },
  {
    name: "Blue Tang",
    modelFile: "blue_tang.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.6,
    speed: [0.8, 1.0],
    social: [1.0, 1.4],
    bold: [0.6, 0.9],
    instanceCount: 6,
    resident: true,
  },
  {
    name: "Yellow Tang",
    modelFile: "yellow_tang.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.4,
    speed: [0.8, 1.0],
    social: [1.0, 1.4],
    bold: [0.6, 0.9],
    instanceCount: 5,
    resident: true,
  },
  {
    name: "Emperor Angelfish",
    modelFile: "emperor_angelfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.76,
    speed: [0.5, 0.7],
    social: [0.6, 1.0],
    bold: [0.7, 1.0],
    instanceCount: 3,
    resident: true,
  },
  {
    name: "Copperband Butterflyfish",
    modelFile: "copperband_butterflyfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.4,
    speed: [0.5, 0.7],
    social: [0.8, 1.2],
    bold: [0.6, 0.9],
    instanceCount: 4,
    resident: true,
  },
  {
    name: "Moorish Idol",
    modelFile: "moorish_idol.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.44,
    speed: [0.5, 0.7],
    social: [0.6, 1.0],
    bold: [0.6, 0.9],
    instanceCount: 3,
    resident: true,
  },
  {
    name: "Blue-Green Chromis",
    modelFile: "blue_green_chromis.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.2,
    speed: [1.2, 1.5],
    social: [1.5, 2.0],
    bold: [0.3, 0.5],
    instanceCount: 30,
    resident: true,
  },
  {
    name: "Three-Stripe Damselfish",
    modelFile: "three_stripe_damselfish.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.Territorial,
    sizeScale: 0.2,
    speed: [1.0, 1.3],
    social: [0.8, 1.2],
    bold: [0.8, 1.1],
    instanceCount: 5,
    resident: true,
  },
  {
    name: "Lyretail Anthias",
    modelFile: "lyretail_anthias.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.3,
    speed: [0.9, 1.1],
    social: [1.3, 1.8],
    bold: [0.4, 0.6],
    instanceCount: 15,
    resident: true,
  },
  {
    name: "Blackspotted Puffer",
    modelFile: "blackspotted_puffer.glb",
    locomotionMode: LocomotionMode.Ostraciiform,
    trophicRole: TrophicRole.Neutral,
    sizeScale: 0.66,
    speed: [0.3, 0.5],
    social: [0.2, 0.4],
    bold: [1.2, 1.5],
    instanceCount: 2,
    resident: true,
  },
  {
    name: "Banggai Cardinalfish",
    modelFile: "banggai_cardinalfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.16,
    speed: [0.5, 0.7],
    social: [0.8, 1.2],
    bold: [0.5, 0.8],
    instanceCount: 4,
    resident: true,
  },
  {
    name: "Cleaner Wrasse",
    modelFile: "cleaner_wrasse.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.Neutral,
    sizeScale: 0.28,
    speed: [0.6, 0.8],
    social: [0.4, 0.8],
    bold: [0.9, 1.2],
    instanceCount: 3,
    resident: true,
  },
  {
    name: "Royal Gramma",
    modelFile: "royal_gramma.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Territorial,
    sizeScale: 0.16,
    speed: [0.5, 0.7],
    social: [0.3, 0.6],
    bold: [0.7, 1.0],
    instanceCount: 3,
    resident: true,
  },
];

// 37 visitor species — loaded on rotation, swim through scene
export const VISITOR_SPECIES: FishSpeciesConfig[] = [
  // Pelagic predators
  {
    name: "Great Barracuda",
    modelFile: "great_barracuda.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 2.2,
    speed: [1.4, 1.8],
    social: [0.1, 0.3],
    bold: [1.3, 1.5],
    instanceCount: 1,
    resident: false,
  },
  {
    name: "Yellowfin Tuna",
    modelFile: "yellowfin_tuna.glb",
    locomotionMode: LocomotionMode.Thunniform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 3.0,
    speed: [1.5, 2.0],
    social: [0.3, 0.6],
    bold: [1.3, 1.5],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Giant Trevally",
    modelFile: "giant_trevally.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 2.0,
    speed: [1.3, 1.7],
    social: [0.2, 0.5],
    bold: [1.2, 1.5],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Wahoo",
    modelFile: "wahoo.glb",
    locomotionMode: LocomotionMode.Thunniform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 3.2,
    speed: [1.6, 2.0],
    social: [0.1, 0.2],
    bold: [1.4, 1.5],
    instanceCount: 1,
    resident: false,
  },
  {
    name: "Mahi-Mahi",
    modelFile: "mahi_mahi.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 2.4,
    speed: [1.3, 1.7],
    social: [0.3, 0.6],
    bold: [1.2, 1.5],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Goliath Grouper",
    modelFile: "goliath_grouper.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 3.0,
    speed: [0.3, 0.5],
    social: [0.1, 0.2],
    bold: [1.4, 1.5],
    instanceCount: 1,
    resident: false,
  },
  // Schooling pelagics
  {
    name: "Atlantic Herring",
    modelFile: "atlantic_herring.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.5,
    speed: [1.2, 1.6],
    social: [1.8, 2.0],
    bold: [0.2, 0.4],
    instanceCount: 50,
    resident: false,
  },
  {
    name: "European Sardine",
    modelFile: "european_sardine.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.4,
    speed: [1.2, 1.5],
    social: [1.8, 2.0],
    bold: [0.2, 0.4],
    instanceCount: 50,
    resident: false,
  },
  {
    name: "European Anchovy",
    modelFile: "european_anchovy.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.3,
    speed: [1.3, 1.7],
    social: [1.8, 2.0],
    bold: [0.2, 0.3],
    instanceCount: 60,
    resident: false,
  },
  {
    name: "Atlantic Mackerel",
    modelFile: "atlantic_mackerel.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.7,
    speed: [1.3, 1.6],
    social: [1.5, 1.8],
    bold: [0.3, 0.5],
    instanceCount: 25,
    resident: false,
  },
  {
    name: "Skipjack Tuna",
    modelFile: "skipjack_tuna.glb",
    locomotionMode: LocomotionMode.Thunniform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 1.6,
    speed: [1.4, 1.8],
    social: [0.5, 0.8],
    bold: [1.2, 1.4],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Yellowtail Amberjack",
    modelFile: "yellowtail_amberjack.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ApexPredator,
    sizeScale: 2.2,
    speed: [1.2, 1.6],
    social: [0.4, 0.7],
    bold: [1.1, 1.4],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Spanish Mackerel",
    modelFile: "spanish_mackerel.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 2.4,
    speed: [1.3, 1.7],
    social: [0.5, 0.8],
    bold: [1.0, 1.3],
    instanceCount: 6,
    resident: false,
  },
  {
    name: "Sergeant Major",
    modelFile: "sergeant_major.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.SchoolingPrey,
    sizeScale: 0.3,
    speed: [1.0, 1.3],
    social: [1.3, 1.7],
    bold: [0.4, 0.6],
    instanceCount: 20,
    resident: false,
  },
  // Reef visitors
  {
    name: "True Clownfish",
    modelFile: "true_clownfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Territorial,
    sizeScale: 0.22,
    speed: [0.6, 0.75],
    social: [0.8, 1.2],
    bold: [0.7, 1.0],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Powder Blue Tang",
    modelFile: "powder_blue_tang.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.46,
    speed: [0.8, 1.0],
    social: [1.0, 1.4],
    bold: [0.6, 0.9],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Naso Unicornfish",
    modelFile: "naso_unicornfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.9,
    speed: [0.6, 0.8],
    social: [0.6, 1.0],
    bold: [0.7, 1.0],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Queen Angelfish",
    modelFile: "queen_angelfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.8,
    speed: [0.5, 0.7],
    social: [0.5, 0.9],
    bold: [0.7, 1.0],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Flame Angelfish",
    modelFile: "flame_angelfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.2,
    speed: [0.5, 0.7],
    social: [0.6, 1.0],
    bold: [0.6, 0.9],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Lemonpeel Angelfish",
    modelFile: "lemonpeel_angelfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.24,
    speed: [0.5, 0.7],
    social: [0.6, 1.0],
    bold: [0.6, 0.9],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Raccoon Butterflyfish",
    modelFile: "raccoon_butterflyfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.46,
    speed: [0.5, 0.7],
    social: [0.7, 1.1],
    bold: [0.6, 0.9],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Threadfin Butterflyfish",
    modelFile: "threadfin_butterflyfish.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.46,
    speed: [0.5, 0.7],
    social: [0.7, 1.1],
    bold: [0.6, 0.9],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Moon Wrasse",
    modelFile: "moon_wrasse.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.56,
    speed: [0.7, 0.9],
    social: [0.6, 1.0],
    bold: [0.7, 1.0],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Six-Line Wrasse",
    modelFile: "six_line_wrasse.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.18,
    speed: [0.7, 0.9],
    social: [0.5, 0.9],
    bold: [0.7, 1.0],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Bluehead Wrasse",
    modelFile: "bluehead_wrasse.glb",
    locomotionMode: LocomotionMode.Labriform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.4,
    speed: [0.7, 0.9],
    social: [0.6, 1.0],
    bold: [0.7, 1.0],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Domino Damselfish",
    modelFile: "domino_damselfish.glb",
    locomotionMode: LocomotionMode.Carangiform,
    trophicRole: TrophicRole.Territorial,
    sizeScale: 0.28,
    speed: [1.0, 1.3],
    social: [0.8, 1.2],
    bold: [0.8, 1.1],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Pajama Cardinalfish",
    modelFile: "pajama_cardinalfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.16,
    speed: [0.4, 0.6],
    social: [0.8, 1.2],
    bold: [0.5, 0.8],
    instanceCount: 4,
    resident: false,
  },
  {
    name: "Longnose Hawkfish",
    modelFile: "longnose_hawkfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.ReefCruiser,
    sizeScale: 0.26,
    speed: [0.4, 0.6],
    social: [0.3, 0.6],
    bold: [0.8, 1.1],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Picasso Triggerfish",
    modelFile: "picasso_triggerfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 0.6,
    speed: [0.6, 0.9],
    social: [0.3, 0.6],
    bold: [1.0, 1.3],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Clown Triggerfish",
    modelFile: "clown_triggerfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 1.0,
    speed: [0.5, 0.8],
    social: [0.2, 0.5],
    bold: [1.0, 1.3],
    instanceCount: 1,
    resident: false,
  },
  {
    name: "Blue Triggerfish",
    modelFile: "blue_triggerfish.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 0.9,
    speed: [0.6, 0.9],
    social: [0.3, 0.6],
    bold: [1.0, 1.3],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Longspine Porcupinefish",
    modelFile: "longspine_porcupinefish.glb",
    locomotionMode: LocomotionMode.Ostraciiform,
    trophicRole: TrophicRole.Neutral,
    sizeScale: 1.0,
    speed: [0.3, 0.5],
    social: [0.2, 0.4],
    bold: [1.2, 1.5],
    instanceCount: 1,
    resident: false,
  },
  {
    name: "Valentini Puffer",
    modelFile: "valentini_puffer.glb",
    locomotionMode: LocomotionMode.Ostraciiform,
    trophicRole: TrophicRole.Neutral,
    sizeScale: 0.22,
    speed: [0.3, 0.5],
    social: [0.2, 0.4],
    bold: [1.0, 1.3],
    instanceCount: 2,
    resident: false,
  },
  {
    name: "Red Snapper",
    modelFile: "red_snapper.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 1.5,
    speed: [0.7, 1.0],
    social: [0.5, 0.8],
    bold: [0.9, 1.2],
    instanceCount: 3,
    resident: false,
  },
  // Deep/cold water visitors
  {
    name: "Atlantic Cod",
    modelFile: "atlantic_cod.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 2.0,
    speed: [0.5, 0.8],
    social: [0.4, 0.7],
    bold: [0.8, 1.1],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "Haddock",
    modelFile: "haddock.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 1.4,
    speed: [0.5, 0.8],
    social: [0.5, 0.8],
    bold: [0.7, 1.0],
    instanceCount: 3,
    resident: false,
  },
  {
    name: "European Hake",
    modelFile: "european_hake.glb",
    locomotionMode: LocomotionMode.Subcarangiform,
    trophicRole: TrophicRole.Mesopredator,
    sizeScale: 1.6,
    speed: [0.5, 0.8],
    social: [0.3, 0.6],
    bold: [0.8, 1.1],
    instanceCount: 2,
    resident: false,
  },
];

export const ALL_SPECIES: FishSpeciesConfig[] = [
  ...RESIDENT_SPECIES,
  ...VISITOR_SPECIES,
];

export const RESIDENT_FISH_COUNT = RESIDENT_SPECIES.reduce(
  (sum, sp) => sum + sp.instanceCount,
  0
);

// 6x6 threat matrix: THREAT_MATRIX[myRole * 6 + neighborRole] = 1.0 means neighborRole threatens myRole
// prettier-ignore
export const THREAT_MATRIX = new Float32Array([
	//          Apex  Meso  Prey  Cruis Terr  Neut
	/* Apex */  0,    0,    0,    0,    0,    0,
	/* Meso */  1,    0,    0,    0,    0,    0,
	/* Prey */  1,    1,    0,    0,    0,    0,
	/* Crus */  1,    0,    0,    0,    0,    0,
	/* Terr */  1,    0,    0,    0,    0,    0,
	/* Neut */  0,    0,    0,    0,    0,    0,
]);

// 6x6 hunt matrix: HUNT_MATRIX[myRole * 6 + neighborRole] = 1.0 means I hunt neighborRole
// prettier-ignore
export const HUNT_MATRIX = new Float32Array([
	//          Apex  Meso  Prey  Cruis Terr  Neut
	/* Apex */  0,    0,    1,    1,    0,    0,
	/* Meso */  0,    0,    1,    0,    0,    0,
	/* Prey */  0,    0,    0,    0,    0,    0,
	/* Crus */  0,    0,    0,    0,    0,    0,
	/* Terr */  0,    0,    0,    0,    0,    0,
	/* Neut */  0,    0,    0,    0,    0,    0,
]);

export function isThreat(
  myRole: TrophicRole,
  neighborRole: TrophicRole
): boolean {
  return THREAT_MATRIX[myRole * 6 + neighborRole] === 1;
}

export function isPrey(
  myRole: TrophicRole,
  neighborRole: TrophicRole
): boolean {
  return HUNT_MATRIX[myRole * 6 + neighborRole] === 1;
}

export interface SlotAllocation {
  startIndex: number;
  count: number;
}

export interface VisitorGroup {
  species: FishSpeciesConfig[];
  slots: SlotAllocation;
  remainingTime: number;
  entryAngle: number;
  exitAngle: number;
}

interface VisitorPattern {
  name: string;
  speciesNames: string[];
  duration: number;
  cooldownMin: number;
  cooldownMax: number;
}

const VISITOR_DURATION_SECONDS = {
  short: 30,
  standard: 45,
  long: 60,
  extended: 90,
} as const;

const VISITOR_PATTERNS: VisitorPattern[] = [
  {
    name: "Sardine Ball",
    speciesNames: ["European Sardine"],
    duration: VISITOR_DURATION_SECONDS.standard,
    cooldownMin: 60,
    cooldownMax: 120,
  },
  {
    name: "Tuna Run",
    speciesNames: ["Yellowfin Tuna", "Skipjack Tuna"],
    duration: VISITOR_DURATION_SECONDS.short,
    cooldownMin: 90,
    cooldownMax: 180,
  },
  {
    name: "Barracuda Patrol",
    speciesNames: ["Great Barracuda"],
    duration: VISITOR_DURATION_SECONDS.short,
    cooldownMin: 120,
    cooldownMax: 240,
  },
  {
    name: "Mackerel School",
    speciesNames: ["Atlantic Mackerel"],
    duration: VISITOR_DURATION_SECONDS.standard,
    cooldownMin: 90,
    cooldownMax: 120,
  },
  {
    name: "Grouper Ambush",
    speciesNames: ["Goliath Grouper"],
    duration: VISITOR_DURATION_SECONDS.long,
    cooldownMin: 180,
    cooldownMax: 300,
  },
  {
    name: "Deep Water Pass",
    speciesNames: ["Atlantic Cod", "Haddock", "European Hake"],
    duration: VISITOR_DURATION_SECONDS.extended,
    cooldownMin: 120,
    cooldownMax: 240,
  },
];

export class SpeciesRotationManager {
  readonly maxSlots: number;
  readonly residentCount: number;
  private nextFreeSlot: number;
  private freeRanges: SlotAllocation[] = [];
  private _activeGroups: VisitorGroup[] = [];
  private spawnCooldown = 30 + Math.random() * 30;

  constructor(maxSlots: number, residentCount: number) {
    this.maxSlots = maxSlots;
    this.residentCount = residentCount;
    this.nextFreeSlot = residentCount;
  }

  get activeGroups(): VisitorGroup[] {
    return this._activeGroups;
  }

  allocateSlots(count: number): SlotAllocation | null {
    for (let i = 0; i < this.freeRanges.length; i++) {
      const range = this.freeRanges[i]!;
      if (range.count >= count) {
        const alloc: SlotAllocation = { startIndex: range.startIndex, count };
        range.startIndex += count;
        range.count -= count;
        if (range.count === 0) this.freeRanges.splice(i, 1);
        return alloc;
      }
    }

    if (this.nextFreeSlot + count <= this.maxSlots) {
      const alloc: SlotAllocation = { startIndex: this.nextFreeSlot, count };
      this.nextFreeSlot += count;
      return alloc;
    }

    return null;
  }

  releaseSlots(alloc: SlotAllocation): void {
    this.freeRanges.push({ ...alloc });
    this.freeRanges.sort((a, b) => a.startIndex - b.startIndex);

    const merged: SlotAllocation[] = [];
    for (const r of this.freeRanges) {
      const prev = merged[merged.length - 1];
      if (prev && prev.startIndex + prev.count === r.startIndex) {
        prev.count += r.count;
      } else {
        merged.push({ ...r });
      }
    }
    this.freeRanges = merged;

    while (this.freeRanges.length > 0) {
      const last = this.freeRanges[this.freeRanges.length - 1]!;
      if (last.startIndex + last.count === this.nextFreeSlot) {
        this.nextFreeSlot = last.startIndex;
        this.freeRanges.pop();
      } else break;
    }
  }

  tick(dt: number): VisitorGroup | null {
    for (let i = this._activeGroups.length - 1; i >= 0; i--) {
      this._activeGroups[i]!.remainingTime -= dt;
      if (this._activeGroups[i]!.remainingTime <= 0) {
        const expired = this._activeGroups.splice(i, 1)[0]!;
        this.releaseSlots(expired.slots);
      }
    }

    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0 || this._activeGroups.length >= 3) return null;

    const pattern =
      VISITOR_PATTERNS[Math.floor(Math.random() * VISITOR_PATTERNS.length)]!;
    this.spawnCooldown =
      pattern.cooldownMin +
      Math.random() * (pattern.cooldownMax - pattern.cooldownMin);

    const species = pattern.speciesNames
      .map((name) => VISITOR_SPECIES.find((s) => s.name === name))
      .filter((s): s is FishSpeciesConfig => s !== undefined);

    if (species.length === 0) return null;

    const totalCount = species.reduce((sum, sp) => sum + sp.instanceCount, 0);
    const slots = this.allocateSlots(totalCount);
    if (!slots) return null;

    const entryAngle = Math.random() * Math.PI * 2;
    const group: VisitorGroup = {
      species,
      slots,
      remainingTime: pattern.duration,
      entryAngle,
      exitAngle: entryAngle + Math.PI,
    };

    this._activeGroups.push(group);
    return group;
  }
}
