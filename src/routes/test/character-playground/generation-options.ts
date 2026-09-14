export const PRESENTATIONS = ["feminine", "masculine"] as const;
export const AGE_BANDS = ["young", "middleage", "old"] as const;
export const HAIR_STYLES = [
  "short01",
  "short02",
  "short03",
  "bob01",
  "ponytail01",
  "afro01",
] as const;

export const OUTFITS = {
  feminine: [
    "female_casualsuit01",
    "female_casualsuit02",
    "female_sportsuit01",
  ],
  masculine: ["male_casualsuit01", "male_casualsuit02", "male_casualsuit03"],
} as const;

export type Presentation = (typeof PRESENTATIONS)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type Outfit = (typeof OUTFITS)[Presentation][number];

export interface GenerationOptions {
  presentation: Presentation;
  age: AgeBand;
  height: number;
  weight: number;
  muscle: number;
  proportions: number;
  hair: HairStyle;
  outfit: Outfit;
  face: number;
}

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  presentation: "feminine",
  age: "young",
  height: 0.5,
  weight: 0.5,
  muscle: 0.5,
  proportions: 0.5,
  hair: "ponytail01",
  outfit: "female_sportsuit01",
  face: 0.5,
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

/** Rejects unrecognised fields so a local UI cannot become a general Blender input. */
export function parseGenerationOptions(
  value: unknown
): GenerationOptions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).some(
      (key) => !OPTION_KEYS.includes(key as (typeof OPTION_KEYS)[number])
    )
  ) {
    return null;
  }
  const { height, weight, muscle, proportions, face } = candidate;
  if (
    !isOneOf(candidate.presentation, PRESENTATIONS) ||
    !isOneOf(candidate.age, AGE_BANDS) ||
    !isOneOf(candidate.hair, HAIR_STYLES) ||
    !isOneOf(candidate.outfit, OUTFITS[candidate.presentation]) ||
    !isControlValue(height) ||
    !isControlValue(weight) ||
    !isControlValue(muscle) ||
    !isControlValue(proportions) ||
    !isControlValue(face)
  ) {
    return null;
  }
  return {
    presentation: candidate.presentation,
    age: candidate.age,
    height,
    weight,
    muscle,
    proportions,
    hair: candidate.hair,
    outfit: candidate.outfit,
    face,
  };
}
