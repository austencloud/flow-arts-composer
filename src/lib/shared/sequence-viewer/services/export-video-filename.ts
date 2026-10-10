import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { sanitizeFilename } from "#lib/shared/foundation/services/file-downloader.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/**
 * Canonical exported-video filename. Collapses repeated kernels so the file is
 * "UΛ-.mp4" not "UΛ-UΛ-UΛ-UΛ-.mp4" (sanitizeFilename preserves Unicode, so Greek
 * glyphs survive), then appends an optional variant suffix — the tunnel stamps
 * "-tunnel-8x-mirror" so fold/mirror variants of one sequence don't collide.
 */
export function exportVideoFilename(
  sequence: SequenceData | null,
  suffix = "",
): string {
  const rawName =
    sequence?.displayName ||
    sequence?.intendedWord ||
    sequence?.word ||
    "sequence";
  const safeName = sanitizeFilename(simplifyRepeatedWord(rawName)) || "sequence";
  return `${safeName}${suffix}.mp4`;
}
