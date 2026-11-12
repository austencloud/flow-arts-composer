import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { rollPerVisitDemo } from "#lib/shared/landing/data/per-visit-demo-core.js";
import { rollInWorker } from "#lib/shared/landing/data/per-visit-demo-worker-client.js";

/**
 * Both public demos draw from the same prepared 16-step LOOP recipe, so the
 * Generate demo asks the hero's roll for it, pinned to intermediate.
 *
 * Until 2026-11-09 this built the sequence on the main thread from a cold
 * start: the first tap downloaded the engine chunks and the letter table, then
 * constructed every pictograph, while the hero animated beside it. A phone in
 * Khāmgaon sat on "Generating..." for more than 20 s. The hero's worker
 * (per-visit-demo.worker.ts) has already paid that cost by the time anyone
 * scrolls down to this demo, so a tap there is one warm off-thread roll.
 *
 * Without a worker the same quality-gated roll runs in-page, yielding between
 * attempts. Either way a roll that finds nothing throws an error the caller
 * classifies as "no-result".
 */
export async function generateComposerDemoSequence(): Promise<SequenceData> {
  const { DifficultyLevel } =
    await import("#lib/shared/foundation/domain/models/generation/generate-models.js");
  const difficulty = DifficultyLevel.INTERMEDIATE;

  const viaWorker = await rollInWorker({ difficulty });
  if (viaWorker.status === "ok") return viaWorker.sequence;
  if (viaWorker.status === "failed") {
    throw new Error(
      viaWorker.error && viaWorker.error !== "roll produced no sequence"
        ? viaWorker.error
        : "No valid sequence for the demo recipe"
    );
  }

  const sequence = await rollPerVisitDemo({ difficulty });
  if (!sequence) throw new Error("No valid sequence for the demo recipe");
  return sequence;
}
