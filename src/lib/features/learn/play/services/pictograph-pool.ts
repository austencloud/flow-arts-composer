/**
 * One shared Diamond-mode pictograph pool for the Play arcade.
 *
 * Hub previews and games both read this cache, so opening a game never starts
 * a second dataframe load. A failed load clears the promise so a visible retry
 * can make a fresh attempt.
 */
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { letterQueryHandler } from "#lib/shared/pictograph/tka-glyph/services/letter-query-handler.js";

export type PlayPictographPool = ReadonlyMap<string, readonly PictographData[]>;

let poolPromise: Promise<PlayPictographPool> | null = null;

export function loadPlayPictographPool(): Promise<PlayPictographPool> {
  if (poolPromise) return poolPromise;

  poolPromise = letterQueryHandler
    .getAllPictographVariations(GridMode.DIAMOND)
    .then((all) => {
      const byLetter = new Map<string, PictographData[]>();

      for (const pictograph of all) {
        const letter = pictograph.letter ? String(pictograph.letter) : null;
        if (!letter) continue;

        const variations = byLetter.get(letter) ?? [];
        variations.push(pictograph);
        byLetter.set(letter, variations);
      }

      return byLetter;
    })
    .catch((error: unknown) => {
      poolPromise = null;
      throw error;
    });

  return poolPromise;
}
