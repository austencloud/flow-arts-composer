import type { SequenceExportOptions } from "#lib/shared/render/domain/models/sequence-export-options.js";

/** Every rendered footer and global visibility flag must invalidate the blob. */
export function buildCardPreviewRenderKey(
  options: Partial<SequenceExportOptions>,
  visibilityState: unknown
): string {
  return `${JSON.stringify(options)}|${JSON.stringify(visibilityState)}`;
}
