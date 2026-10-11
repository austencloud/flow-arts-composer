import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
import type { AnimationPropConfig } from "#lib/shared/animation-engine/domain/animation-prop-config.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * App players follow the prop choices in Settings. Standalone players can skip
 * this adapter and stay independent of the authenticated application graph.
 */
export function getViewerAnimationPropConfig(): AnimationPropConfig {
  const settings = getSettings();
  return {
    leftPropType: settings.leftPropType || settings.propType || PropType.STAFF,
    rightPropType: settings.rightPropType || settings.propType || PropType.STAFF,
  };
}
