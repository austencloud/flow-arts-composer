import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

/** One footer line: `${lead} [swatch] ${rest}`. The swatch is drawn, not said. */
export interface HandLegend {
  lead: string;
  swatch: string;
  rest: string;
  /** Screen-reader text for the line, spelling out what the swatch means. */
  spoken: string;
}

/**
 * The swatch is the right-hand prop color under both labelings. Under mirror
 * me the hand swap has already relabeled the motions, so that color is drawn on
 * the viewer's right. Under as performed it is the performer's right hand, on
 * the viewer's left. The line says what the viewer sees on the card.
 */
export function handLegendFor(
  labeling: HandLabeling,
  rightHandColor: string
): HandLegend {
  if (labeling === "mirror-me") {
    return {
      lead: "Mirror me.",
      swatch: rightHandColor,
      rest: "is your right hand.",
      spoken: "Mirror me. The color on your right is your right hand.",
    };
  }
  return {
    lead: "As performed.",
    swatch: rightHandColor,
    rest: "is my right hand, on your left.",
    spoken: "As performed. The performer's right hand appears on your left.",
  };
}
