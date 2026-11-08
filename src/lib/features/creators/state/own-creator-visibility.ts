/**
 * After "Show me in Creators" saves, make what is already loaded agree with it.
 *
 * The Creators roster and the map pins are module state kept until a full
 * reload, so without this the person's own row and pin stayed as they were
 * until they reloaded. The roster row is patched in place (the roster filters
 * hidden people through isListedCreator), and the pin cache is dropped so the
 * next map mount reads the pins again, after syncMapPinVisibility has moved
 * the pin.
 *
 * The dependencies are passed in so the unit test needs no Firestore.
 */

import type { EnhancedUserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";

export interface OwnVisibilityTargets {
  patchUser(userId: string, patch: Partial<EnhancedUserProfile>): void;
  invalidatePins(): void;
}

export function applyOwnCreatorVisibility(
  userId: string,
  hidden: boolean,
  targets: OwnVisibilityTargets
): void {
  targets.patchUser(userId, { isHidden: hidden });
  targets.invalidatePins();
}
