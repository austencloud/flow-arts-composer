import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * How big each size is drawn on the Size page, in the true ratio of the two
 * props as the pictograph draws them.
 *
 * `art` is the long side of what the prop's artwork actually paints and
 * `frame` the long side of the file's viewBox, measured from the SVGs in
 * static/images/props/buttons (the artwork the pair preview draws; the
 * pictograph folder holds the same drawings). The pair preview fits each
 * file's frame to the same square, so a prop that paints half its frame comes
 * out half size. The real size is `art`, so each picture is scaled by its
 * frame (art over art/frame). The bigger of the two is drawn at 1. `art` is kept
 * as the measured record the frame sits beside.
 */
interface SizeArt {
  art: number;
  frame: number;
}
const SIZE_ART: Partial<Record<PropType, { standard: SizeArt; big: SizeArt }>> =
  {
    [PropType.STAFF]: {
      standard: { art: 249, frame: 252.8 },
      big: { art: 596, frame: 600 },
    },
    [PropType.CLUB]: {
      standard: { art: 134, frame: 133.67 },
      big: { art: 251, frame: 252 },
    },
    [PropType.MINIHOOP]: {
      standard: { art: 135, frame: 257.9 },
      big: { art: 303, frame: 600 },
    },
    [PropType.EIGHTRINGS]: {
      standard: { art: 257, frame: 257.3 },
      big: { art: 600, frame: 600 },
    },
    [PropType.TORCH]: {
      standard: { art: 151, frame: 153.5 },
      big: { art: 250, frame: 250 },
    },
    [PropType.CHICKEN]: {
      standard: { art: 171, frame: 325 },
      big: { art: 251, frame: 252.8 },
    },
    [PropType.DOUBLESTAR]: {
      standard: { art: 300, frame: 300 },
      big: { art: 600, frame: 600 },
    },
    [PropType.CONTACTBALL]: {
      standard: { art: 150, frame: 300 },
      big: { art: 300, frame: 600 },
    },
    [PropType.DOUBLECONTACTBALL]: {
      standard: { art: 300, frame: 300 },
      big: { art: 600, frame: 600 },
    },
  };

/** A size pair with no measurement. */
const UNMEASURED = { standard: 0.5, big: 1 };

/** Drawn scale of the Standard and Big picture (0..1, the larger is 1). */
export function sizeArtScales(standardProp: PropType): {
  standard: number;
  big: number;
} {
  const entry = SIZE_ART[standardProp];
  if (!entry) return UNMEASURED;
  // The pair preview draws a file at art / frame of its square, but the real
  // size is proportional to art, so the picture is scaled by
  // art / (art / frame), which is the frame.
  const top = Math.max(entry.standard.frame, entry.big.frame);
  return {
    standard: entry.standard.frame / top,
    big: entry.big.frame / top,
  };
}
