/**
 * Real pictograph data for hub previews.
 *
 * The cards show REAL pictographs, not hand-drawn approximations — same CSV
 * dataset the games themselves quiz from (letterQueryHandler, cached
 * module-wide, so the hub warms the exact cache the games use on entry).
 * One variation per requested letter, first match wins; the letters are an
 * arbitrary visual sample, not a domain statement.
 *
 * Failure mode: resolves to an empty array (network/CSV error) — previews
 * render their stage without pictographs rather than erroring the hub.
 */
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { loadPlayPictographPool } from "../../services/pictograph-pool";

/** Resolve real PictographData for the requested letters (missing ones skipped). */
export async function loadPreviewPictographs(
  letters: string[]
): Promise<PictographData[]> {
  try {
    const pool = await loadPlayPictographPool();
    return letters
      .map((letter) => pool.get(letter)?.[0])
      .filter((p): p is PictographData => !!p);
  } catch {
    return [];
  }
}
