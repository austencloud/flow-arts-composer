export const PRESENTATIONS = ["feminine", "masculine"] as const;
export const AGE_BANDS = ["young", "middleage", "old"] as const;
export const HAIR_STYLES = [
  "bald",
  "short01",
  "short02",
  "short03",
  "short04",
  "bob01",
  "bob02",
  "ponytail01",
  "afro01",
  "braid01",
  "long01",
] as const;
export const SHOES = [
  "shoes01",
  "shoes02",
  "shoes03",
  "shoes04",
  "shoes05",
  "shoes06",
] as const;
export const HATS = ["none", "fedora01", "fedora_cocked"] as const;
export const EYEBROWS = [
  "eyebrow001",
  "eyebrow002",
  "eyebrow003",
  "eyebrow004",
  "eyebrow005",
  "eyebrow006",
  "eyebrow007",
  "eyebrow008",
  "eyebrow009",
  "eyebrow010",
  "eyebrow011",
  "eyebrow012",
] as const;
export const EYELASHES = [
  "none",
  "eyelashes01",
  "eyelashes02",
  "eyelashes03",
  "eyelashes04",
] as const;
export const EYE_COLORS = [
  "blue",
  "bluegreen",
  "brown",
  "brownlight",
  "deepblue",
  "green",
  "grey",
  "ice",
  "lightblue",
] as const;

export const OUTFITS = {
  feminine: [
    "female_casualsuit01",
    "female_casualsuit02",
    "female_elegantsuit01",
    "female_sportsuit01",
  ],
  masculine: [
    "male_casualsuit01",
    "male_casualsuit02",
    "male_casualsuit03",
    "male_casualsuit04",
    "male_casualsuit05",
    "male_casualsuit06",
    "male_elegantsuit01",
    "male_worksuit01",
  ],
} as const;

export type Presentation = (typeof PRESENTATIONS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Shoe = (typeof SHOES)[number];
export type Hat = (typeof HATS)[number];
export type Eyebrow = (typeof EYEBROWS)[number];
export type Eyelashes = (typeof EYELASHES)[number];
export type EyeColor = (typeof EYE_COLORS)[number];
export type Outfit = (typeof OUTFITS)[Presentation][number];

export interface GenerationOptions {
  presentation: Presentation;
  age: AgeBand;
  height: number;
  weight: number;
  muscle: number;
  proportions: number;
  face: number;
  hair: HairStyle;
  outfit: Outfit;
  shoes: Shoe;
  hat: Hat;
  eyebrows: Eyebrow;
  eyelashes: Eyelashes;
  eyeColor: EyeColor;
  hairColorOverride: string | null;
  outfitColorOverride: string | null;
  variationSeed: number | null;
  faceSeed: number | null;
}

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  presentation: "feminine",
  age: "young",
  height: 0.5,
  weight: 0.5,
  muscle: 0.5,
  proportions: 0.5,
  face: 0.5,
  hair: "ponytail01",
  outfit: "female_sportsuit01",
  shoes: "shoes01",
  hat: "none",
  eyebrows: "eyebrow001",
  eyelashes: "eyelashes01",
  eyeColor: "brown",
  hairColorOverride: null,
  outfitColorOverride: null,
  variationSeed: null,
  faceSeed: null,
};

const NUMBER_FIELDS = [
  "height",
  "weight",
  "muscle",
  "proportions",
  "face",
] as const;
const OPTION_KEYS = [
  "presentation",
  "age",
  ...NUMBER_FIELDS,
  "hair",
  "outfit",
  "shoes",
  "hat",
  "eyebrows",
  "eyelashes",
  "eyeColor",
  "hairColorOverride",
  "outfitColorOverride",
  "variationSeed",
  "faceSeed",
] as const;

function isOneOf<T extends readonly string[]>(
  value: unknown,
  values: T
): value is T[number] {
  return typeof value === "string" && values.includes(value);
}
function isControlValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1 &&
    Math.round(value * 20) === value * 20
  );
}
function isColorOverride(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value))
  );
}
function isSeed(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= 2147483647)
  );
}

/** Reject unknown fields so the local creator never becomes a Blender path input. */
export function parseGenerationOptions(
  value: unknown
): GenerationOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some(
      (key) => !OPTION_KEYS.includes(key as (typeof OPTION_KEYS)[number])
    )
  )
    return null;
  const expanded = { ...DEFAULT_GENERATION_OPTIONS, ...candidate };
  const { height, weight, muscle, proportions, face } = expanded;
  if (
    !isOneOf(expanded.presentation, PRESENTATIONS) ||
    !isOneOf(expanded.age, AGE_BANDS) ||
    !isOneOf(expanded.hair, HAIR_STYLES) ||
    !isOneOf(expanded.outfit, OUTFITS[expanded.presentation]) ||
    !isOneOf(expanded.shoes, SHOES) ||
    !isOneOf(expanded.hat, HATS) ||
    !isOneOf(expanded.eyebrows, EYEBROWS) ||
    !isOneOf(expanded.eyelashes, EYELASHES) ||
    !isOneOf(expanded.eyeColor, EYE_COLORS) ||
    !isColorOverride(expanded.hairColorOverride) ||
    !isColorOverride(expanded.outfitColorOverride) ||
    !isSeed(expanded.variationSeed) ||
    !isSeed(expanded.faceSeed) ||
    !isControlValue(height) ||
    !isControlValue(weight) ||
    !isControlValue(muscle) ||
    !isControlValue(proportions) ||
    !isControlValue(face)
  )
    return null;
  return {
    presentation: expanded.presentation,
    age: expanded.age,
    height,
    weight,
    muscle,
    proportions,
    face,
    hair: expanded.hair,
    outfit: expanded.outfit,
    shoes: expanded.shoes,
    hat: expanded.hat,
    eyebrows: expanded.eyebrows,
    eyelashes: expanded.eyelashes,
    eyeColor: expanded.eyeColor,
    hairColorOverride: expanded.hairColorOverride,
    outfitColorOverride: expanded.outfitColorOverride,
    variationSeed: expanded.variationSeed,
    faceSeed: expanded.faceSeed,
  };
}
