/**
 * Reactive settings stand-in for followPropSource's regression tests.
 * followPropSource reads picks through a ShapeMatrixPropSource built over
 * this object, so the harness has to be real rune state for the effect to
 * re-run the way it does against the app's actual settings store.
 */
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { followPropSource } from "$lib/shared/shape-matrix/app/state/follow-prop-source.svelte";
import type {
  ShapeMatrixAppState,
  ShapeMatrixPropSource,
} from "$lib/shared/shape-matrix/app/state/shape-matrix-app-state.svelte";

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

/**
 * Installs the real followPropSource effect in its own root, the way
 * ShapeMatrixApp.svelte's component scope hosts it, so a plain `.test.ts`
 * file can drive it without reaching into Svelte's internals. Returns the
 * root's cleanup.
 */
export function mountFollowPropSource(
  state: ShapeMatrixAppState,
  propSource: ShapeMatrixPropSource | undefined
): () => void {
  return $effect.root(() => {
    followPropSource(state, propSource);
  });
}
