import {
  CHARACTER_DEFINITIONS,
  type CharacterId,
} from "#lib/shared/3d/domain/character-model.js";

import { resolveDesktopAssetUrl } from "#lib/shared/desktop/desktop-asset-runtime.js";

import { R2_CDN } from "./r2-origin";

export { R2_CDN };

/** Portraits of shipped characters: app static files, built by scripts/build-character-portraits.mjs. */
const SHIPPED_PORTRAITS = "/images/character-portraits";
/** A local-evaluation body's portrait stays beside its model, in the ignored bake-off folder. */
const LOCAL_PORTRAITS = "/models/avatars/bakeoff/portraits";

/**
 * The bust portrait a character's picker tile shows. One owner for the path so
 * every surface that draws a character's picture reads the same file. A local
 * body's portrait exists only on a machine that built it, so the tile keeps a
 * fallback for a picture that does not load.
 */
export function characterThumbnailUrl(characterId: CharacterId): string {
  const definition = CHARACTER_DEFINITIONS.find(
    (character) => character.id === characterId
  );
  const folder =
    definition?.availability === "local-evaluation"
      ? LOCAL_PORTRAITS
      : SHIPPED_PORTRAITS;

  // An <img> never goes through three's loading manager, so the desktop
  // bundle rewrite has to be applied here by hand.
  return resolveDesktopAssetUrl(
    definition?.thumbnailPath ?? `${folder}/${characterId}.webp`
  );
}
