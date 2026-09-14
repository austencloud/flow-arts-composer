import { flushSync } from "svelte";
import { createViewerPropVisibilityState } from "$lib/shared/sequence-viewer/state/viewer-prop-visibility-state.svelte";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

type Settings = {
  leftPropType: PropType;
  rightPropType: PropType;
  catDogMode: boolean;
  propViewingMode?: "my-props" | "as-saved";
};

/**
 * Runs the viewer prop state under an effect root with a settings store the
 * test can read back. Updates apply synchronously so a test can assert the
 * pair right after a pick.
 */
export function createViewerPropHandHarness(initial: Settings) {
  let settings = $state<Settings>({ ...initial });
  const urlParams: Array<[string, string]> = [];
  const animationPairs: Array<[PropType, PropType]> = [];
  let state!: ReturnType<typeof createViewerPropVisibilityState>;
  const dispose = $effect.root(() => {
    state = createViewerPropVisibilityState(
      {
        imageComposition: { imgDarkMode: false } as never,
        getSequence: () => null,
        getHandPathMode: () => false,
        getInitialLeftVisible: () => true,
        getInitialRightVisible: () => true,
        getAnimationServicesReady: () => true,
        getHapticService: () => null,
        onUrlParamChange: (key, value) => urlParams.push([key, value]),
      },
      {
        getSettings: (() => settings) as never,
        updateSettings: ((patch: Partial<Settings>) => {
          settings = { ...settings, ...patch };
          return Promise.resolve();
        }) as never,
        getSequenceMotionVisibility: () => ({
          showLeftMotion: true,
          showRightMotion: true,
        }),
        updateAnimationPropTypes: (left, right) =>
          animationPairs.push([left, right]),
        setAnimationDarkMode: () => {},
        encodePropForUrl: (propType) => `enc:${propType}`,
      }
    );
  });
  flushSync();
  return {
    state,
    dispose,
    urlParams,
    animationPairs,
    get settings() {
      return settings;
    },
    flush: flushSync,
  };
}
