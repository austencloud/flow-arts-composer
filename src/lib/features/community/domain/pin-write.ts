/**
 * How a saved city is written, given the person's own listing flags.
 *
 * A hidden or disabled person's pin must stay off the public map: the rules
 * refuse a public pin while the profile is unlisted. Their pin is written
 * private and marked hiddenByFlag, the same mark syncMapPinVisibility puts on
 * a pin it hides, so the trigger makes it public again when they come back.
 */

export interface ListingFlags {
  isHidden?: boolean | null;
  isDisabled?: boolean | null;
}

export type PinWrite =
  | { visibility: "public" }
  | { visibility: "private"; hiddenByFlag: true };

export function pinWriteFor(flags: ListingFlags | null): PinWrite {
  if (flags?.isHidden === true || flags?.isDisabled === true) {
    return { visibility: "private", hiddenByFlag: true };
  }
  return { visibility: "public" };
}
