import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import {
  TIMING_DIRECTION_ARTICLES,
  type TimingDirectionArticle,
} from "../../timing-and-direction/_data/timing-direction-articles";

/**
 * Common spinning trick names mapped to the page on this site that explains
 * each one. The sentences restate what those pages already say; a name gets
 * an entry only when a real page covers it. Timing entries take their
 * definition from the timing-and-direction article so the two never drift.
 */
export interface TrickLink {
  readonly href: string;
  readonly label: string;
}

export interface TrickName {
  readonly id: string;
  readonly name: string;
  readonly usage: string;
  readonly detail?: string;
  readonly link: TrickLink;
  /** Timing and direction mode, for the element icon and accent. */
  readonly mode?: VtgMode;
  readonly modeName?: string;
}

export interface TrickGroup {
  readonly id: string;
  readonly title: string;
  readonly tricks: readonly TrickName[];
}

function modeArticle(code: VtgMode): TimingDirectionArticle {
  const article = TIMING_DIRECTION_ARTICLES.find((a) => a.code === code);
  if (!article) throw new Error(`Missing timing/direction article ${code}`);
  return article;
}

function timingTrick(
  id: string,
  name: string,
  code: VtgMode,
  usage: string
): TrickName {
  const article = modeArticle(code);
  return {
    id,
    name,
    usage,
    detail: article.definition,
    link: {
      href: `/timing-and-direction/${article.slug}`,
      label: article.name,
    },
    mode: code,
    modeName: article.compactName,
  };
}

const STAFF_MOTIONS: TrickLink = {
  href: "/guide/level-1/staff-motions",
  label: "Staff Motions",
};
const CLUBS: TrickLink = { href: "/notation/clubs", label: "Clubs" };
const SPIN_RATIOS: TrickLink = { href: "/guide/ratios", label: "Spin ratios" };

export const TRICK_GROUPS: readonly TrickGroup[] = [
  {
    id: "weaves-and-butterflies",
    title: "Weaves and butterflies",
    tricks: [
      timingTrick(
        "three-beat-weave",
        "Three-beat weave and windmill",
        "SS",
        "A regular three-beat poi weave uses Split-Same. So do windmills that keep the same timing."
      ),
      timingTrick(
        "parallel-weave",
        "Parallel weave",
        "TS",
        "In poi, a parallel weave uses Together-Same."
      ),
      timingTrick(
        "quarter-time-weave",
        "Quarter-time weave",
        "QS",
        "Quarter-time poi weaves use Quarter-Same. DrexFactor also uses this timing in a third-order chase."
      ),
      timingTrick(
        "split-time-butterfly",
        "Split-time butterfly",
        "SO",
        "A split-time poi butterfly uses Split-Opposite. Its downbeats alternate."
      ),
      timingTrick(
        "butterfly",
        "Butterfly",
        "TO",
        "A regular poi butterfly uses Together-Opposite. Both poi heads share the same downbeat."
      ),
      timingTrick(
        "quarter-time-butterfly",
        "Quarter-time butterfly",
        "QO",
        "Quarter-time poi butterflies use Quarter-Opposite."
      ),
    ],
  },
  {
    id: "prop-spin",
    title: "Prop spin",
    tricks: [
      {
        id: "prospin",
        name: "Prospin",
        usage: "The prop rotates the same direction as the hand path.",
        detail: "A 90 degree isolation is the base unit of prospin.",
        link: STAFF_MOTIONS,
      },
      {
        id: "antispin",
        name: "Antispin",
        usage: "The prop rotates in the opposite direction of the hand path.",
        detail: "In an antispin, the ends swap orientation.",
        link: STAFF_MOTIONS,
      },
      {
        id: "isolation",
        name: "Isolation",
        usage:
          "In a base isolation, the thumb orientation remains the same for the entire motion.",
        detail:
          "Negative Space and Body Turns walks through a full 360° isolation on a staff.",
        link: {
          href: "/guide/level-1/negative-space",
          label: "Negative Space and Body Turns",
        },
      },
      {
        id: "extension",
        name: "Extension",
        usage:
          "On a staff, the thumb end isolates while the pinky end extends.",
        detail:
          "A club can perform either path, so club spinners learn isolation and extension as separate moves with the same underlying geometry.",
        link: CLUBS,
      },
    ],
  },
  {
    id: "flowers-and-caps",
    title: "Flowers and CAPs",
    tricks: [
      {
        id: "flowers",
        name: "Flowers",
        usage:
          "A spin ratio counts hand circles against prop rotations, and the ratio fixes the petal count.",
        detail: "At 1:3, prospin draws 2 petals and antispin draws 4.",
        link: SPIN_RATIOS,
      },
      {
        id: "vertical-and-horizontal-antispin",
        name: "Vertical and horizontal antispin",
        usage:
          "A club's antispin reads as a vertical or a horizontal flower depending on its orientation through the pattern.",
        detail:
          "VTG calls these vertical antispin and horizontal antispin. A staff shows both at once.",
        link: CLUBS,
      },
      {
        id: "float",
        name: "Float",
        usage: "The prop makes no rotation of its own while the hand circles.",
        detail:
          "That is the ratio 1:0, which the Kinetic Alphabet names Float.",
        link: { href: "/guide/ratios#reading-heading", label: "Spin ratios" },
      },
      {
        id: "cap",
        name: "CAP (Continuous Assembly Pattern)",
        usage:
          "A CAP is a cyclic path assembled in time from two or more elementary patterns.",
        detail:
          "One prop traces every fragment and returns to its starting point.",
        link: { href: "/notation/caps", label: "CAPs" },
      },
    ],
  },
];

export const TRICK_NAMES: readonly TrickName[] = TRICK_GROUPS.flatMap(
  (group) => group.tricks
);
