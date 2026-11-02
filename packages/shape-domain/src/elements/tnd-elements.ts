import { MODE_FAMILY_ID, type VtgMode } from "./vtg-modes.js";

/** The six element names, one per timing-and-direction family. */
export type ElementName = "water" | "earth" | "sun" | "fire" | "air" | "moon";

/**
 * Icon URLs by element. The consumer supplies them (the Composer points at
 * /images/elements/norm/*.png, the demo at its vendored copies), so the
 * element records carry no paths.
 */
export type ElementIcons = Record<ElementName, string>;

export interface TnDElement {
  readonly familyId: string;
  readonly name: string;
  readonly element: ElementName;
  readonly accentColor: string;
  readonly darkComplement: string;
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
    cardTintOpacity: 0.25,
    iconScale: 1,
  },
  {
    familyId: "tog-same",
    name: "Tog-Same",
    element: "earth",
    accentColor: "#75A874",
    darkComplement: "#2a4a29",
    cardTintOpacity: 0.15,
    iconScale: 1,
  },
  {
    familyId: "quarter-same",
    name: "Quarter-Same",
    element: "sun",
    accentColor: "#ffde17",
    darkComplement: "#7a6a00",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
  {
    familyId: "split-opp",
    name: "Split-Opp",
    element: "fire",
    accentColor: "#f2673a",
    darkComplement: "#6b1a0a",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
  {
    familyId: "tog-opp",
    name: "Tog-Opp",
    element: "air",
    accentColor: "#bce4f7",
    darkComplement: "#3a6a8b",
    cardTintOpacity: 0.16,
    iconScale: 1,
  },
  {
    familyId: "quarter-opp",
    name: "Quarter-Opp",
    element: "moon",
    accentColor: "#6a4199",
    darkComplement: "#2a1540",
    cardTintOpacity: 0.09,
    iconScale: 1,
  },
] as const;

export const TND_BY_FAMILY: Readonly<Record<string, TnDElement>> =
  Object.fromEntries(TND_ELEMENTS.map((t) => [t.familyId, t]));

/** The element each VTG mode realizes as; the same table the TnD deck uses. */
export const MODE_ELEMENT: Record<VtgMode, ElementName> = {
  SS: "water",
  TS: "earth",
  QS: "sun",
  SO: "fire",
  TO: "air",
  QO: "moon",
};

/** The element record for a VTG mode, read through its TnD family. */
export function elementFor(mode: VtgMode): TnDElement {
  return TND_BY_FAMILY[MODE_FAMILY_ID[mode]]!;
}
