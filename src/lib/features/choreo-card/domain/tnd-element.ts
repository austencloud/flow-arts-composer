export interface TnDElement {
  readonly familyId: string;
  readonly name: string;
  readonly element: string;
  readonly accentColor: string;
  readonly darkComplement: string;
  readonly iconPath: string;
  /** CIELAB-tuned opacity (0–1) for card interior tint; compensates for each color's perceptual distance from white */
  readonly cardTintOpacity: number;
  /** Per-icon visual-size multiplier for display. Now 1 for every element: the
   *  normalization is baked into the assets themselves (`/images/elements/norm/*`
   *  — each glyph trimmed, perceptually sized, and centered in a uniform square
   *  with padding), so no consumer needs a per-icon fudge factor. Kept as a hook
   *  for any future asset that can't be pre-normalized. */
  readonly iconScale: number;
}

export const TND_ELEMENTS: readonly TnDElement[] = [
  {
    familyId: "split-same",
    name: "Split-Same",
    element: "water",
    accentColor: "#3568a0",
    darkComplement: "#1a3a5e",
    iconPath: "/images/elements/norm/water.png",
    cardTintOpacity: 0.25,
    iconScale: 1,
  },
  {
    familyId: "tog-same",
    name: "Tog-Same",
    element: "earth",
    accentColor: "#75A874",
    darkComplement: "#2a4a29",
    iconPath: "/images/elements/norm/earth.png",
    cardTintOpacity: 0.15,
    iconScale: 1,
  },
  {
    familyId: "quarter-same",
    name: "Quarter-Same",
    element: "sun",
    accentColor: "#ffde17",
    darkComplement: "#7a6a00",
    iconPath: "/images/elements/norm/sun.png",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
  {
    familyId: "split-opp",
    name: "Split-Opp",
    element: "fire",
    accentColor: "#f2673a",
    darkComplement: "#6b1a0a",
    iconPath: "/images/elements/norm/fire.png",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
  {
    familyId: "tog-opp",
    name: "Tog-Opp",
    element: "air",
    accentColor: "#bce4f7",
    darkComplement: "#3a6a8b",
    iconPath: "/images/elements/norm/air.png",
    cardTintOpacity: 0.16,
    iconScale: 1,
  },
  {
    familyId: "quarter-opp",
    name: "Quarter-Opp",
    element: "moon",
    accentColor: "#6a4199",
    darkComplement: "#2a1540",
    iconPath: "/images/elements/norm/moon.png",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
] as const;

export const TND_BY_FAMILY: Readonly<Record<string, TnDElement>> =
  Object.fromEntries(TND_ELEMENTS.map((t) => [t.familyId, t]));

const TND_BY_ELEMENT: Readonly<Record<string, TnDElement>> = Object.fromEntries(
  TND_ELEMENTS.map((element) => [element.element, element])
);

/**
 * Resolve the print-frame palette from each step's actual hand-path geometry.
 * Non-orbital Type 2 steps have no element and add no artificial neutral band.
 * Repeated elements stay repeated so the stripe rhythm reflects the sequence.
 */
export function resolveSequenceElementFramePalette(
  sequence: SequenceData
): readonly string[] {
  const elements = sequence.steps.flatMap((step) => {
    const elementalType = deriveTnDFromPictograph(step).elementalType;
    const element = elementalType ? TND_BY_ELEMENT[elementalType] : undefined;
    return element ? [element] : [];
  });
  if (elements.length === 0) return [];

  const uniqueElements = new Set(elements.map((element) => element.element));
  if (uniqueElements.size === 1) {
    const [element] = elements;
    return [element!.accentColor, element!.darkComplement];
  }
  return elements.map((element) => element.accentColor);
}

export const TND_RATIO_LEVEL_MAP: Readonly<Record<string, number>> = {
  "1:1": 1,
  "3:1": 2,
  "5:1": 2,
  "7:1": 2,
  "2:1": 3,
  "4:1": 3,
  "6:1": 3,
};

export const TND_RATIO_TURNS_MAP: Readonly<Record<string, number>> = {
  "1:1": 0,
  "2:1": 0.5,
  "3:1": 1,
  "4:1": 1.5,
  "5:1": 2,
  "6:1": 2.5,
  "7:1": 3,
};

/** Inverse of TND_RATIO_TURNS_MAP - maps turn values to ratio strings */
export const TND_TURNS_RATIO_MAP: Readonly<Record<number, string>> = {
  0: "1:1",
  0.5: "2:1",
  1: "3:1",
  1.5: "4:1",
  2: "5:1",
  2.5: "6:1",
  3: "7:1",
};

export function getTnDElement(familyId: string): TnDElement | null {
  return TND_ELEMENTS.find((t) => t.familyId === familyId) ?? null;
}

// Maps every superseded icon path to its current (normalized) equivalent so
// lookups against data that stored an older path still resolve.
const ICON_LEGACY: Readonly<Record<string, string>> = {
  "/images/elements/sun-v2.png": "/images/elements/norm/sun.png",
  "/images/elements/sun-v4.png": "/images/elements/norm/sun.png",
  "/images/elements/water-v2.png": "/images/elements/norm/water.png",
  "/images/elements/earth-v2.png": "/images/elements/norm/earth.png",
  "/images/elements/fire-v2.png": "/images/elements/norm/fire.png",
  "/images/elements/air-v2.png": "/images/elements/norm/air.png",
  "/images/elements/moon-v2.png": "/images/elements/norm/moon.png",
};

export function getTnDElementByIconPath(iconPath: string): TnDElement | null {
  const normalized = ICON_LEGACY[iconPath] ?? iconPath;
  return TND_ELEMENTS.find((t) => t.iconPath === normalized) ?? null;
}
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
