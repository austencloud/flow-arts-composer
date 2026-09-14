import { captureSetupSnapshot } from "$lib/features/create/generate/domain/setup-snapshot";
import type { SavedGeneratorSetup } from "$lib/features/create/generate/domain/models/favorite-config";

/**
 * Reactive stand-in for the Generate panel's live config. The real panel
 * feeds favorite-state a `$state` config, so tests that edit a control after
 * applying a setup need the same reactivity for `activeSource` to recompute.
 */
export function createLiveConfigHarness(
  initial: SavedGeneratorSetup["config"]
) {
  const config = $state(structuredClone(initial));

  return {
    config,
    getLiveSnapshot: () => captureSetupSnapshot(config, null),
    setLevel(level: number) {
      config.level = level;
    },
  };
}
