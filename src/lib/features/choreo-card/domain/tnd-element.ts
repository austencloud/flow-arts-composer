import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { deriveTnDFromPictograph } from "#lib/shared/pictograph/shared/domain/utils/tnd-deriver.js";
import {
  TND_ELEMENTS as BASE_ELEMENTS,
  type TnDElement as BaseTnDElement,
} from "@tka/shape-domain";

export {
  MODE_ELEMENT,
  elementFor,
  type ElementIcons,
  type ElementName,
} from "@tka/shape-domain";

/**
 * The six elements live in @tka/shape-domain without icon paths, so a host
 * outside the Composer can point at its own copies. The Composer's deck,
 * cards and glyphs read `iconPath`, which this adapter adds back.
 */
export interface TnDElement extends Omit<BaseTnDElement, "element"> {
  /** One of the six elements, or a stand-in such as the store's "cover" frame. */
  readonly element: BaseTnDElement["element"] | (string & {});
  readonly iconPath: string;
}

export const TND_ELEMENTS: readonly TnDElement[] = BASE_ELEMENTS.map(
  (element) => ({
    ...element,
    iconPath: `/images/elements/norm/${element.element}.png`,
  })
);

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
