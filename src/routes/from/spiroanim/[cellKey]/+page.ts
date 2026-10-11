/**
 * `/from/spiroanim/<cellKey>` — the landing side of the cell-identity bridge.
 *
 * SpiroAnim links out with a cellKey; this load turns that key back into the
 * sequence its catalogue cell describes. It NEVER throws: an unrecognised or
 * malformed key is a `status: "unknown"` result and the page says so honestly.
 * A thrown error here would be a 500 for what is simply a link from a newer
 * version of the other app.
 */

import type { PageLoad } from "./$types";
import type {
  DeepLinkMap,
  ReturnLinkSources,
} from "#lib/features/spiroanim-bridge/domain/return-links.js";
import type { TranscriptionEntry } from "#lib/features/spiroanim-bridge/services/resolve-cell.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export const prerender = false;

/**
 * The resolver reads TKA's pictograph dataframes, which are fetched from
 * `/data/pictographs/*.csv` at runtime and have no server-side path. Rendering
 * this route on the server would therefore serve the "no bridge entry" card for
 * every valid cell and then contradict itself on hydration, so the whole route
 * is client-rendered. It carries `noindex` by design, so nothing is lost.
 */
export const ssr = false;

export type BridgePageData =
  | {
      status: "resolved";
      cellKey: string;
      sequence: SequenceData;
      entry: TranscriptionEntry;
      /** The SpiroAnim player URL for the same cell, or null when none exists. */
      returnLink: string | null;
    }
  | { status: "unknown"; cellKey: string };

export const load: PageLoad = async ({ params }): Promise<BridgePageData> => {
  const cellKey = params.cellKey ?? "";
  const unknown = { status: "unknown", cellKey } as const;

  try {
    // Dynamic, never static: the transcription alone is ~1.1 MB and belongs to
    // this route, not to the app's main chunk.
    const [cellKeyModule, returnLinksModule, resolverModule, transcription, vtgQtr, eightStep] =
      await Promise.all([
        import("#lib/features/spiroanim-bridge/domain/cell-key.js"),
        import("#lib/features/spiroanim-bridge/domain/return-links.js"),
        import("#lib/features/spiroanim-bridge/services/resolve-cell.js"),
        import("../../../../../docs/research/spiroanim/tka-transcription.json"),
        import("../../../../../docs/research/spiroanim/vtg-qtr-deep-links.json"),
        import("../../../../../docs/research/spiroanim/eightstep-deep-links.json"),
      ]);

    const parsed = cellKeyModule.parseCellKey(cellKey);
    if (!parsed) return unknown;

    const resolved = await resolverModule.resolveCell(
      cellKey,
      transcription.default as unknown as TranscriptionEntry[]
    );
    if (!resolved) return unknown;

    const sources: ReturnLinkSources = {
      vtgQtr: vtgQtr.default as unknown as DeepLinkMap,
      eightStep: eightStep.default as unknown as DeepLinkMap,
    };

    return {
      status: "resolved",
      cellKey,
      sequence: resolved.sequence,
      entry: resolved.entry,
      returnLink: returnLinksModule.getReturnLink(parsed, sources),
    };
  } catch (error) {
    // A broken artifact or a dataframe that would not load is still a link the
    // visitor clicked. Say nothing was found rather than failing the request.
    console.error("[spiroanim-bridge] could not resolve", cellKey, error);
    return unknown;
  }
};
