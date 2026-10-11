/**
 * The canonical POSTER look for a tunnel.
 *
 * A tunnel's poster used to be whatever the stage happened to be showing when
 * the shutter fell: a few steps of a fading trail, the props mid-swing, the grid
 * on. Next to a mandala poster — which is derived from geometry and therefore
 * shows the complete figure every time — it read as a screenshot rather than a
 * piece of work. Two causes, one shape:
 *
 *   1. FADE mode only ever shows a moving window of the path, so the still holds
 *      an arc, not the mandala the tunnel traces.
 *   2. The overlay decays per rendered frame, so how full that arc looks depends
 *      on the machine. The same tunnel published twice gave two pictures.
 *
 * So a poster is not a frame of the live view — it is the tunnel's COMPLETE
 * traced figure, and it is the same picture every time. That is what these
 * overrides produce: the trail stops fading, so the accumulator keeps every
 * stamp and the figure closes; the grid and the props step out of the way,
 * leaving the drawing itself; and the capture then waits for the figure to stop
 * growing rather than for a clock (see `tunnel-discovery-poster.ts`).
 *
 * Everything that is IDENTITY stays: colors, stroke width, glow, per-arm
 * spectrum, the config, the effect assignment. Only the display of the trail
 * over time changes, and only for the still.
 */

import {
  TAIL_LENGTH_MAX,
  TrailMode,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { TunnelSnapshot } from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import type { CollectedTunnel } from "./tunnel-collection-types";

/**
 * Long enough that the overlay's decay is arithmetically irrelevant over any
 * capture: `decayRateFor` turns this into ~0.006 alpha/second, so a 20-second
 * hold loses about a tenth of a percent. Zero is not usable — the same helper
 * treats a zero-length fade as "fade instantly" — and TrailMode.PERSISTENT
 * alone only widens the path-cache read window; it does not stop the GPU decay
 * the overlay applies to its accumulator.
 */
export const POSTER_NO_DECAY_FADE_MS = 10 * 60 * 1000;

/**
 * The trail a poster is drawn with. Takes the tunnel's own settings and changes
 * only what makes a still legible.
 */
export function posterTrailSettings(trail: TrailSettings): TrailSettings {
  return {
    ...trail,
    // Non-FADE flips the path-cache read window from "the last N steps" to
    // "everything since step 0", which is what draws the whole figure for the
    // base arm. The copies accumulate in the overlay instead, which is why the
    // decay below has to go too.
    mode: TrailMode.PERSISTENT,
    fadeDurationMs: POSTER_NO_DECAY_FADE_MS,
    // The ring buffer feeding the copies is bounded by tailLength; at the
    // maximum it holds enough recent motion that no arm's stroke breaks while
    // the accumulator is filling in behind it.
    tailLength: TAIL_LENGTH_MAX,
    // The props are the instrument, the trail is the work. In motion the props
    // read as performers; frozen, they are opaque bars sitting on top of the
    // drawing they made.
    hideProps: true,
    // Gap-free strokes. The live default, restated so a tunnel saved with it off
    // still gets a clean poster.
    usePathCache: true,
    // Future-path preview is a teaching mode, not a portrait.
    previewMode: false,
  };
}

/**
 * The same tunnel, described for a still. Pure — the stored record is untouched,
 * so this can be handed to the live preview component without the collection
 * ever seeing poster settings.
 */
export function tunnelForPoster(tunnel: CollectedTunnel): CollectedTunnel {
  const snapshot: TunnelSnapshot = {
    ...tunnel.snapshot,
    tunnel: {
      ...tunnel.snapshot.tunnel,
      // Scaffolding for building a tunnel, noise in a portrait of one.
      gridVisible: false,
    },
    trailRender: posterTrailSettings(tunnel.snapshot.trailRender),
  };
  return { ...tunnel, snapshot };
}
