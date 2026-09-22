import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  neutralPresentation,
  resolvePresentation,
  type ResolvedPresentationValue,
} from "$lib/shared/foundation/services/presentation-intent";

/**
 * The look a public surface renders a sequence with. Mode-free by design:
 * the viewer's own settings are never an input. Recorded intent wins;
 * everything else (explicit default, legacy, malformed, no sequence) is the
 * one neutral look. See the 2026-09-17 creator presentation intent spec.
 */
export function resolveViewingPresentation(
  sequence: SequenceData | null | undefined
): ResolvedPresentationValue {
  const resolved = resolvePresentation(
    sequence?.creatorIntent,
    sequence?.id ?? "unknown"
  );
  return resolved.kind === "recorded" ? resolved.value : neutralPresentation();
}
