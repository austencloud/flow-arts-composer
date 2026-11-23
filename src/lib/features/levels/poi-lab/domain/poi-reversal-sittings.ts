import type {
  PoiCandidateSelection,
  PoiReversalCandidate,
  PoiReversalLabel,
} from "./poi-reversal-candidates";

/**
 * Judging sittings: a fixed handful of reversal candidates, shown in order.
 *
 * Austen chose on 2026-11-22 to settle poi turnarounds in short sittings of
 * ten. Each sitting is picked by the poi desk to test one question; the page
 * shows it with `?sitting=<name>`. What each pick is meant to test lives on the
 * desk (E:/tka-poi), not here, so the page never hints at an expected verdict.
 */
export const POI_REVERSAL_SITTINGS: Readonly<
  Record<string, readonly string[]>
> = {
  /*
   * Sitting 1, 2026-11-22: does a poi turn around where it points out from
   * the hand, or where it lies level with the floor? Every candidate turns
   * around twice with the same hand-to-poi relation both times.
   */
  "1": [
    "poi-r0-dcw-s1-p2",
    "poi-r1-dcw-s3-p2",
    "poi-r1-dcw-s1-p8",
    "poi-r1-dcw-s1-p2",
    "poi-r1-dcw-s1-p4",
    "poi-r1-dcw-s3-p6",
    "poi-r1-dcw-s2-p1",
    "poi-r05-dcw-s1-p8",
    "poi-r1-dccw-s1-p8",
    "poi-r0-dcw-s1-p4",
  ],
};

export interface PoiReversalSitting {
  name: string;
  candidates: readonly PoiReversalCandidate[];
}

/** The named sitting, or null when the name is unknown or lists a missing id. */
export function resolvePoiReversalSitting(
  name: string | null | undefined,
  pool: readonly PoiReversalCandidate[]
): PoiReversalSitting | null {
  if (!name) return null;
  const ids = POI_REVERSAL_SITTINGS[name];
  if (!ids) return null;
  const byId = new Map(pool.map((candidate) => [candidate.id, candidate]));
  const candidates = ids.map((id) => byId.get(id));
  if (candidates.some((candidate) => !candidate)) return null;
  return { name, candidates: candidates as PoiReversalCandidate[] };
}

/** The first sitting candidate without a verdict yet; null once all are judged. */
export function selectNextSittingCandidate(
  labels: readonly PoiReversalLabel[],
  sitting: PoiReversalSitting
): PoiCandidateSelection | null {
  const judged = new Set(labels.map((label) => label.candidate.id));
  const next = sitting.candidates.find(
    (candidate) => !judged.has(candidate.id)
  );
  return next ? { candidate: next, reason: "sitting" } : null;
}

/** How many of the sitting's candidates already have a verdict. */
export function sittingJudgedCount(
  labels: readonly PoiReversalLabel[],
  sitting: PoiReversalSitting
): number {
  const judged = new Set(labels.map((label) => label.candidate.id));
  return sitting.candidates.filter((candidate) => judged.has(candidate.id))
    .length;
}
