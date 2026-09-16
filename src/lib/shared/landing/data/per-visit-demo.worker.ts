/**
 * Per-visit demo worker — runs the attract-demo roll off the main thread.
 *
 * The hero act regenerates a sequence for every prop change, forever. Measured
 * in Chrome on /composer: the FIRST roll of a page session costs 572 ms wall
 * clock containing a 135 ms blocking task (CSV fetch, 576 pictograph
 * constructions, engine module evaluation, first beam search), and a forced
 * ten-roll worst case is 21–37 ms in one task. None of that belongs on the
 * thread that has to paint the hero.
 *
 * The whole roll moves here rather than a single build: the loop, the quality
 * gate, and the per-roll deep clone are all main-thread cost, and keeping them
 * together means one message round trip per draw instead of ten.
 *
 * Protocol is one request, one response, correlated by id — see
 * per-visit-demo-worker-client.ts, which owns the main-thread half.
 */
import { rollPerVisitDemo } from "$lib/shared/landing/data/per-visit-demo-core";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export interface PerVisitDemoRequest {
  id: number;
  /** Structured-clone-safe subset of PerVisitDemoOptions. `random` is a
   *  function and cannot cross the boundary, so a caller that supplies one
   *  never reaches the worker (the client keeps it on the main thread). */
  propType?: PropType;
  startPlacement?: PictographData | null;
}

export type PerVisitDemoResponse =
  | { id: number; ok: true; sequence: SequenceData }
  /** The roll ran and produced nothing, or threw. The main thread substitutes
   *  the baked fallback — same outcome as the pre-worker code path. */
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener("message", (event: MessageEvent<PerVisitDemoRequest>) => {
  const { id, propType, startPlacement } = event.data ?? { id: -1 };
  void (async () => {
    try {
      const sequence = await rollPerVisitDemo({
        ...(propType ? { propType } : {}),
        ...(startPlacement ? { startPlacement } : {}),
      });
      if (!sequence) {
        scope.postMessage({
          id,
          ok: false,
          error: "roll produced no sequence",
        } satisfies PerVisitDemoResponse);
        return;
      }
      scope.postMessage({ id, ok: true, sequence } satisfies PerVisitDemoResponse);
    } catch (error) {
      scope.postMessage({
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies PerVisitDemoResponse);
    }
  })();
});
