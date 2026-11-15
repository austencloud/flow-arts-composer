/**
 * Fitting the blue-and-red pair drawing into a button's box.
 *
 * The pair is drawn on a 100x100 canvas, but two props only paint part of it
 * (two fans reach about x 3 to 97, y 11 to 89; two clubs are wide and short).
 * Callers used to oversize the drawing and let it hang out of a smaller slot.
 * Here the painted extent is worked out from the composition itself: each
 * hand's placement, rotation and scale from the recipe, and its artwork's
 * crop window. The drawing then crops its viewBox to that extent and fits the
 * box, centred, aspect kept.
 *
 * The extent is the bounding box of each hand's rotated artwork rectangle.
 * That is exact when the artwork touches its rectangle's edges (the glyph
 * crops are measured painted bounds) and never smaller than the paint.
 */
import type { CompositionRecipe } from "./prop-composition-recipes";
import type { PropTileCrop } from "./prop-look";

/** Side of the square each hand's artwork is fitted into, in canvas units. */
export const PAIR_IMAGE_SIZE = 158;

export interface HandPlacement {
  x: number;
  y: number;
  rotation: number;
  /** Scale with the recipe's pair scale already applied. */
  scale: number;
}

export interface PairPlacements {
  left?: HandPlacement;
  right?: HandPlacement;
}

export interface PairBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where each hand sits on the pair canvas. A single-hand preview sits in the
 * middle; two different props get side-by-side slots; the rest follow the
 * recipe. PropCompositionPreview draws from these same values.
 */
export function pairHandPlacements(
  recipe: CompositionRecipe,
  mixedPair: boolean,
  singleHand?: "left" | "right"
): PairPlacements {
  const hand = (side: "left" | "right"): HandPlacement => {
    if (singleHand) return { x: 50, y: 50, rotation: 0, scale: 0.55 };
    if (mixedPair) {
      return side === "left"
        ? { x: 28, y: 42, rotation: 0, scale: 0.34 }
        : { x: 72, y: 58, rotation: 0, scale: 0.34 };
    }
    const t = recipe[side];
    return {
      x: t.x,
      y: t.y,
      rotation: t.rotation,
      scale: t.scale * recipe.pairScale,
    };
  };
  return {
    ...(singleHand !== "right" ? { left: hand("left") } : {}),
    ...(singleHand !== "left" ? { right: hand("right") } : {}),
  };
}

/** SVG transform for one placed hand. */
export function placementTransform(p: HandPlacement): string {
  return `translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`;
}

/**
 * Width and height of a hand's artwork at scale 1, centred on its origin.
 * The component fits the artwork (or its crop window) into a square, aspect
 * kept, so the long side is the square's side.
 */
export function handArtworkSize(
  crop: Pick<PropTileCrop, "width" | "height"> | undefined,
  aspect = 1
): { width: number; height: number } {
  const ratio = crop && crop.height > 0 ? crop.width / crop.height : aspect;
  const r = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return r >= 1
    ? { width: PAIR_IMAGE_SIZE, height: PAIR_IMAGE_SIZE / r }
    : { width: PAIR_IMAGE_SIZE * r, height: PAIR_IMAGE_SIZE };
}

/** Bounding box of one placed, rotated artwork rectangle. */
export function placedHandBounds(
  placement: HandPlacement,
  artwork: { width: number; height: number }
): PairBounds {
  const rad = (placement.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const w = placement.scale * (cos * artwork.width + sin * artwork.height);
  const h = placement.scale * (sin * artwork.width + cos * artwork.height);
  return {
    x: placement.x - w / 2,
    y: placement.y - h / 2,
    width: w,
    height: h,
  };
}

/** The union of the hands' bounds, or null with no hands. */
export function pairPaintedBounds(
  hands: {
    placement: HandPlacement;
    artwork: { width: number; height: number };
  }[]
): PairBounds | null {
  if (!hands.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { placement, artwork } of hands) {
    const b = placedHandBounds(placement, artwork);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The drawn size of `bounds` when fitted into a box: as large as the box
 * allows and never larger, aspect kept. The svg takes the box as its size and
 * the bounds as its viewBox; `meet` centres it.
 */
export function fitBoundsInBox(
  bounds: PairBounds,
  boxWidth: number,
  boxHeight: number
): { width: number; height: number; viewBox: string } {
  const scale = Math.min(boxWidth / bounds.width, boxHeight / bounds.height);
  return {
    width: bounds.width * scale,
    height: bounds.height * scale,
    viewBox: `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`,
  };
}

/**
 * Width over height of an SVG source, from its viewBox or its width and
 * height. Artwork without a crop is drawn at its own aspect.
 */
export function svgSourceAspect(source: string | null | undefined): number {
  if (!source) return 1;
  const tag = /<svg\b[^>]*>/i.exec(source)?.[0] ?? "";
  const box =
    /viewBox\s*=\s*["']\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*["']/i.exec(
      tag
    );
  let w = box ? Number(box[3]) : NaN;
  let h = box ? Number(box[4]) : NaN;
  if (!(w > 0 && h > 0)) {
    w = Number(/\swidth\s*=\s*["']([\d.]+)/i.exec(tag)?.[1]);
    h = Number(/\sheight\s*=\s*["']([\d.]+)/i.exec(tag)?.[1]);
  }
  return w > 0 && h > 0 ? w / h : 1;
}
