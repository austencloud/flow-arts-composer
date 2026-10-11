/**
 * Composer entry point for poi-legal option filtering.
 *
 * Reads the active per-hand prop types from settings and applies the poi
 * legality filter. Gated: dark in production, active only in dev builds or for
 * admin/tester roles until the feature is deliberately shipped. When the gate is
 * off (or neither hand is poi), it is the identity.
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
import { isAdmin } from "#lib/shared/auth/state/auth-state.svelte.js";
import { getPoiOptionFilterDecorator } from "../get-poi-option-filter-decorator";

/** Poi composer filtering is dark in production; on in dev or for admins/testers. */
export function isPoiComposerFilterEnabled(): boolean {
  return import.meta.env.DEV || isAdmin();
}

export function applyPoiLegalComposerFilter(
  options: readonly PictographData[],
  previous: PictographData | null,
  /** Explicit per-hand prop types (demo/preview surfaces that pin their own
   *  prop, e.g. the composer construct demo). Falls back to user settings. */
  propTypes?: { leftPropType?: PropType; rightPropType?: PropType }
): PictographData[] {
  if (!isPoiComposerFilterEnabled()) {
    return [...options];
  }
  const settings = getSettings();
  return getPoiOptionFilterDecorator().filterPoiLegalOptions(options, previous, {
    leftPropType: propTypes?.leftPropType ?? settings.leftPropType,
    rightPropType: propTypes?.rightPropType ?? settings.rightPropType,
  });
}
