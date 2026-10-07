import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** Where the page's one sequence came from. The hero's draws, a Construct
 * build, and a Generate or tunnel draw all write the same slot. */
export type PageSequenceSource =
  | "opening"
  | "hero"
  | "construct"
  | "generate"
  | "tunnel";

export interface PageSequence {
  sequence: SequenceData;
  source: PageSequenceSource;
}

/** The baked opening keeps the lower demonstrations usable before the hero
 * has drawn anything live. */
export function openingPageSequence(opening: SequenceData): PageSequence {
  return { sequence: opening, source: "opening" };
}

/** Last write wins. A missing sequence never replaces the current one, and
 * the same sequence from the same source returns the same state object so a
 * reactive effect that carries it does not loop. */
export function carryPageSequence(
  state: PageSequence,
  source: PageSequenceSource,
  next: SequenceData | null | undefined
): PageSequence {
  if (!next) return state;
  if (state.sequence.id === next.id && state.source === source) return state;
  return { sequence: next, source };
}

/** One honest line under the Keep stop's card. */
export function featuredCaption(source: PageSequenceSource): string {
  switch (source) {
    case "construct":
      return "The sequence you built.";
    case "generate":
    case "tunnel":
      return "The sequence you generated.";
    default:
      return "The sequence playing above.";
  }
}

/** The generator catches up to the page sequence when it is in view and the
 * page holds a different sequence. Its own draws set the page sequence, so
 * the next incoming id equals its current id and nothing churns. */
export function shouldAdoptCarriedSequence(
  current: SequenceData | null,
  incoming: SequenceData | null,
  inViewport: boolean
): incoming is SequenceData {
  return inViewport && incoming !== null && incoming.id !== current?.id;
}

/** The construct attract act is allowed to animate its own panel, but only a
 * real visitor interaction may carry that work into the rest of the page. */
export function isVisitorOwnedConstructSequence(
  visitorOwnsBuild: boolean,
  candidate: SequenceData | null
): candidate is SequenceData {
  return visitorOwnsBuild && candidate !== null;
}
