/**
 * Spec lifecycle (2026-07-12 compositional-loop spec, D4): the stored
 * loopSpec is a proof certificate written by generation. Any beat-level
 * mutation invalidates it — detection takes over for display. The legacy
 * loopType string is kept (it is display provenance, not a certificate).
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { tryGetLoopDisplayCacheClearer } from "#lib/shared/loop-labeler/get-loop-display-resolver.js";

export function withLoopCertificateCleared(sequence: SequenceData): SequenceData {
  if (sequence.loopSpec === undefined) return sequence;
  const { loopSpec: _dropped, ...rest } = sequence;
  return rest as SequenceData;
}

/**
 * Evict the loop-display resolver's cache after a beat mutation. The cache
 * is keyed by sequence id (see loop-display-resolver.ts), which does not
 * change across an edit, so a stale cached LoopDisplay would otherwise
 * outlive the certificate strip and keep a card rendering the dead
 * certificate's components/period. Routed through the shared DI seam
 * (get-loop-display-resolver.ts) rather than importing
 * features/loop-labeler directly from the create module. No-op if the
 * resolver hasn't registered a clearer (unit tests, SSR before bootstrap).
 */
export function invalidateLoopDisplayCache(): void {
  tryGetLoopDisplayCacheClearer()?.();
}
