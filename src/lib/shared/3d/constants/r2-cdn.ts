import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "#lib/shared/3d/domain/character-model.js";

import { resolveDesktopAssetUrl } from "#lib/shared/desktop/desktop-asset-runtime.js";

import { R2_CDN } from "./r2-origin";

export { R2_CDN };

/**
 * Square preview image for a character model. One owner for the path so the
 * picker grid and the performer-hub summary row can never drift apart.
 */
export function characterThumbnailUrl(characterId: CharacterId): string | null {
  const definition = CHARACTER_DEFINITIONS.find(
    (character) => character.id === characterId
  );
  if (
    definition?.availability === "local-evaluation" &&
    !definition.thumbnailPath
  ) {
    return null;
  }

  // An <img> never goes through three's loading manager, so the desktop
  // bundle rewrite has to be applied here by hand.
  return resolveDesktopAssetUrl(
    definition?.thumbnailPath ??
      `${R2_CDN}/models/avatars/thumbnails/${characterId}.webp`
  );
}
