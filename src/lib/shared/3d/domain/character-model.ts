import {
  Avatar3D,
  AVATAR_DEFINITIONS,
  DEFAULT_AVATAR_ID,
  getAvatarModelPath,
  prepareAvatarForDisplay,
  type AvatarDefinition,
  type AvatarId,
} from "@austencloud/scene-3d";
// Adds the default cast's not-yet-uploaded bodies to the catalog in dev, so
// anything that reads characters through this boundary sees them.
import "./default-cast-characters";

/**
 * The scene package still publishes its historical avatar vocabulary. Keep
 * that compatibility at one boundary so the product can speak consistently
 * about characters without forking the catalog or its asset IDs.
 */
export type CharacterId = AvatarId;
export type CharacterDefinition = AvatarDefinition;

export const CHARACTER_DEFINITIONS: readonly CharacterDefinition[] =
  AVATAR_DEFINITIONS;
export const DEFAULT_CHARACTER_ID: CharacterId = DEFAULT_AVATAR_ID;
export const getCharacterModelPath = getAvatarModelPath;
export const prepareCharacterForDisplay = prepareAvatarForDisplay;
export const Character3D = Avatar3D;
