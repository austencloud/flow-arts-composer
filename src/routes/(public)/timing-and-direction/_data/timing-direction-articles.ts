import {
  MODE_FAMILY_ID,
  MODE_ORDER,
  type VtgMode,
} from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";

export type TimingValue = "Together" | "Split" | "Quarter";
export type DirectionValue = "Same" | "Opposite";

export interface TimingDirectionSource {
  readonly label: string;
  readonly url: string;
}

export interface TimingDirectionArticle {
  readonly code: VtgMode;
  readonly slug: string;
  readonly familyId: string;
  readonly name: string;
  readonly compactName: string;
  readonly timing: TimingValue;
  readonly direction: DirectionValue;
  readonly phase: "0°" | "90° / 270°" | "180°";
  readonly representativeLetter: string;
  readonly definition: string;
  readonly aliases: readonly string[];
  readonly metaDescription: string;
}

/** Noel Yee's Vulcan Tech Gospel, where these mode names became standard. */
export const TIMING_DIRECTION_SOURCE: TimingDirectionSource = {
  label: "Noel Yee: Vulcan Tech Gospel",
  url: "https://noelyee.com/instruction/vulcan-tech-gospel/",
};

const ARTICLE_BY_CODE = {
  SS: {
    slug: "split-time-same-direction",
    name: "Split Time, Same Direction",
    compactName: "Split-Same",
    timing: "Split",
    direction: "Same",
    phase: "180°",
    representativeLetter: "A",
    definition:
      "Both hands circle in the same direction, half a cycle apart. When one reaches the top, the other reaches the bottom.",
    aliases: ["Split-Same", "SS", "Split time", "Follow time"],
    metaDescription:
      "Split Time, Same Direction: both hands turn the same way, half a cycle apart. Play the four-count loops in this mode with props or with hands only.",
  },
  TS: {
    slug: "together-time-same-direction",
    name: "Together Time, Same Direction",
    compactName: "Together-Same",
    timing: "Together",
    direction: "Same",
    phase: "0°",
    representativeLetter: "G",
    definition:
      "Both hands circle in the same direction and reach matching points at the same time.",
    aliases: ["Together-Same", "Tog-Same", "TS", "Parallel time"],
    metaDescription:
      "Together Time, Same Direction: both hands turn the same way and reach the same points together. Play the four-count loops in this mode, with props or hands.",
  },
  QS: {
    slug: "quarter-time-same-direction",
    name: "Quarter Time, Same Direction",
    compactName: "Quarter-Same",
    timing: "Quarter",
    direction: "Same",
    phase: "90° / 270°",
    representativeLetter: "S",
    definition:
      "Both hands circle in the same direction, a quarter-cycle apart. Either hand can lead.",
    aliases: ["Quarter-Same", "QS", "Quarter time", "90-degree phase"],
    metaDescription:
      "Quarter Time, Same Direction: both hands turn the same way, a quarter cycle apart, either hand leading. Play all eight four-count loops, with props or hands.",
  },
  SO: {
    slug: "split-time-opposite-direction",
    name: "Split Time, Opposite Direction",
    compactName: "Split-Opposite",
    timing: "Split",
    direction: "Opposite",
    phase: "180°",
    representativeLetter: "J",
    definition:
      "The hands circle in opposite directions. One reaches the bottom halfway between the other's downbeats.",
    aliases: ["Split-Opposite", "Split-Opp", "SO", "Split-time butterfly"],
    metaDescription:
      "Split Time, Opposite Direction: the hands turn opposite ways and pass on alternating beats. Play the four-count loops in this mode, with props or hands.",
  },
  TO: {
    slug: "together-time-opposite-direction",
    name: "Together Time, Opposite Direction",
    compactName: "Together-Opposite",
    timing: "Together",
    direction: "Opposite",
    phase: "0°",
    representativeLetter: "D",
    definition:
      "The hands circle in opposite directions and reach the top and bottom together.",
    aliases: ["Together-Opposite", "Tog-Opp", "TO", "Butterfly"],
    metaDescription:
      "Together Time, Opposite Direction: the hands turn opposite ways and meet on the same beat. Play the four-count loops in this mode, with props or hands.",
  },
  QO: {
    slug: "quarter-time-opposite-direction",
    name: "Quarter Time, Opposite Direction",
    compactName: "Quarter-Opposite",
    timing: "Quarter",
    direction: "Opposite",
    phase: "90° / 270°",
    representativeLetter: "M",
    definition:
      "The hands circle in opposite directions, a quarter-cycle apart. Either hand can lead.",
    aliases: [
      "Quarter-Opposite",
      "Quarter-Opp",
      "QO",
      "Quarter-time butterfly",
    ],
    metaDescription:
      "Quarter Time, Opposite Direction: the hands turn opposite ways, a quarter cycle apart. Play the four-count loops in this mode, with props or hands.",
  },
} as const satisfies Record<
  VtgMode,
  Omit<TimingDirectionArticle, "code" | "familyId">
>;

export const TIMING_DIRECTION_ARTICLES: readonly TimingDirectionArticle[] =
  MODE_ORDER.map((code) => ({
    code,
    familyId: MODE_FAMILY_ID[code],
    ...ARTICLE_BY_CODE[code],
  }));

export const TIMING_DIRECTION_ARTICLE_SLUGS = TIMING_DIRECTION_ARTICLES.map(
  ({ slug }) => slug
);

export function getTimingDirectionArticle(
  slug: string
): TimingDirectionArticle | undefined {
  return TIMING_DIRECTION_ARTICLES.find((article) => article.slug === slug);
}

export function getTimingDirectionArticleByPair(
  timing: TimingValue,
  direction: DirectionValue
): TimingDirectionArticle {
  const article = TIMING_DIRECTION_ARTICLES.find(
    (candidate) =>
      candidate.timing === timing && candidate.direction === direction
  );
  if (!article) {
    throw new Error(
      `Missing timing/direction article for ${timing}/${direction}`
    );
  }
  return article;
}
