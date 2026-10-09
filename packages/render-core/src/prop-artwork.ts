/**
 * Props whose two hands hold different flat artwork. Two found sticks are
 * never the same branch, so the right hand draws `stick-right.svg` beside the
 * left hand's `stick.svg`: the same length, bark and tape, a different branch.
 */
const HANDED_ARTWORK_PROPS: ReadonlySet<string> = new Set(["stick"]);

export type PropSpriteSide = "left" | "right";

/** File name, without `.svg`, of a prop's flat artwork for one hand. */
export function propArtworkStem(propType: string, side: PropSpriteSide): string {
  return side === "right" && HANDED_ARTWORK_PROPS.has(propType.toLowerCase())
    ? `${propType}-right`
    : propType;
}

/** Where card pictographs find prop artwork, below the static images root. */
export const PICTOGRAPH_PROP_ARTWORK_DIR = "props/pictograph";
