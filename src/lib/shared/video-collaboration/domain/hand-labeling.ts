/**
 * How notation beside performance footage labels hands.
 *
 * Notation is read from the performer's own frame. Footage is shot from the
 * audience, so the performer's right hand appears on the viewer's left.
 *
 * "mirror-me": the card is mirrored and hand-swapped, so the color drawn on
 * the viewer's right is the viewer's right hand. Copy what you see. This is
 * the default for everything posted.
 *
 * "as-performed": the card stays in performer view. The right-hand color is
 * the performer's right hand, on the viewer's left.
 */
export type HandLabeling = "mirror-me" | "as-performed";

export const DEFAULT_HAND_LABELING: HandLabeling = "mirror-me";

export function isHandLabeling(value: unknown): value is HandLabeling {
  return value === "mirror-me" || value === "as-performed";
}

/** A record with no stored choice gets the default. */
export function resolveHandLabeling(
  video: { readonly handLabeling?: HandLabeling } | undefined
): HandLabeling {
  return video?.handLabeling ?? DEFAULT_HAND_LABELING;
}
