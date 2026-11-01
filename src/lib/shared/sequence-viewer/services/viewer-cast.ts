/**
 * Who the viewer is showing. A viewer shows one sequence. A tunnel whose
 * performers each dance their own sequence is shown whole only by the
 * ensemble views; every other view shows the lead, as a plain sequence page
 * would. The other performers' sequences open on their own pages from the
 * tunnel's cast rows.
 */
import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { resolveSequenceIdentityTitle } from "./viewer-title";
import type { TunnelComposition } from "../tunnel/tunnel-composition";
import { partnerTunnelAddressOf } from "../tunnel/partner-tunnel";
import type { SplitConfig, ViewerMode } from "./viewer-state-persistence";

export interface ViewerCastLink {
  performerId: string;
  /** What people call this performer, e.g. "Front". */
  label: string;
  /** The performer's word as people read it ("DJII", not the walked
   *  "DJIIDJII"), or "" when the sequence has none. */
  word: string;
  /** That sequence's own page. */
  href: string;
}

/**
 * One link per performer who dances a sequence of their own that has a page,
 * in composition order. A partner tunnel links each partner by the code in its
 * address; any other composition by the performer's source sequence id. A
 * generated tunnel (one lead plus copies of it) has no one else to open, so it
 * gets none.
 */
export function deriveViewerCastLinks(
  composition: TunnelComposition | null | undefined
): ViewerCastLink[] {
  if (!composition) return [];
  const partner = partnerTunnelAddressOf(composition);
  const partnerCodes = partner ? [partner.front, partner.back] : [];
  const links: ViewerCastLink[] = [];
  composition.performers.forEach((performer, index) => {
    const source = performer.source;
    if (source.kind !== "independent") return;
    const routeId = partnerCodes[index] ?? source.sourceSequenceId;
    if (!routeId) return;
    links.push({
      performerId: performer.id,
      label: performer.label,
      word: source.sequence.word
        ? simplifyRepeatedWord(source.sequence.word)
        : resolveSequenceIdentityTitle(source.sequence),
      href: `/sequence/${encodeURIComponent(routeId)}`,
    });
  });
  return links.length < 2 ? [] : links;
}

/**
 * Ensemble views draw the cast together: Tunnel, Performances and Post Studio,
 * and a side-by-side whose left pane is the tunnel. Every other view draws the
 * lead alone.
 */
export function isEnsembleView(
  mode: ViewerMode,
  split: Pick<SplitConfig, "leftPane">
): boolean {
  if (mode === "tunnel" || mode === "videos" || mode === "post-studio") {
    return true;
  }
  return mode === "split" && split.leftPane === "tunnel";
}
