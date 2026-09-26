import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
import {
  TIMING_DIRECTION_ARTICLES,
  type TimingDirectionArticle,
} from "../../timing-and-direction/_data/timing-direction-articles";

/**
 * Common spinning trick names mapped to the page on this site that explains
 * each one. Only names spinners actually use get an entry; the timing and
 * direction modes are not each given a trick name just to fill a grid.
 * Timing entries take their definition from the timing-and-direction
 * article so the two never drift.
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

function modeArticle(code: VtgMode): TimingDirectionArticle {
  const article = TIMING_DIRECTION_ARTICLES.find((a) => a.code === code);
  if (!article) throw new Error(`Missing timing/direction article ${code}`);
  return article;
}

function timingTrick(
  id: string,
  name: string,
  code: VtgMode,
  usage: string,
  { withDefinition = true }: { withDefinition?: boolean } = {}
): TrickName {
  const article = modeArticle(code);
  return {
    id,
    name,
    usage,
    detail: withDefinition ? article.definition : undefined,
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

export const TRICK_NAMES: readonly TrickName[] = [
  timingTrick(
    "weave",
    "Weave",
    "SS",
    "A regular three-beat poi weave uses Split-Same."
  ),
  // The weave card above already defines Split-Same; repeating it here
  // would print the same sentence twice in one row.
  timingTrick(
    "windmill",
    "Windmill",
    "SS",
    "Windmills that keep the same timing use Split-Same, like the weave.",
    { withDefinition: false }
  ),
  timingTrick(
    "butterfly",
    "Butterfly",
    "TO",
    "A regular poi butterfly uses Together-Opposite. Both poi heads share the same downbeat."
  ),
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
    usage: "On a staff, the thumb end isolates while the pinky end extends.",
    detail:
      "A club can perform either path, so club spinners learn isolation and extension as separate moves with the same underlying geometry.",
    link: { href: "/notation/clubs", label: "Clubs" },
  },
  {
    id: "antispin",
    name: "Antispin",
    usage: "The prop rotates in the opposite direction of the hand path.",
    detail: "In an antispin, the ends swap orientation.",
    link: STAFF_MOTIONS,
  },
];
