/**
 * Reactive settings stand-in for followPropSource's regression tests.
 * followPropSource reads picks through a ShapeMatrixPropSource built over
 * this object, so the harness has to be real rune state for the effect to
 * re-run the way it does against the app's actual settings store.
 */
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export interface FollowPropSourceSettings {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
}

export const propSourceSettingsHarness: FollowPropSourceSettings = $state({
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogMode: false,
});

export function resetPropSourceSettingsHarness(): void {
  propSourceSettingsHarness.leftPropType = PropType.STAFF;
  propSourceSettingsHarness.rightPropType = PropType.STAFF;
  propSourceSettingsHarness.catDogMode = false;
}
