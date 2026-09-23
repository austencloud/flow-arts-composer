import {
  propFinishState,
  type PropBuild,
  type PropFinish,
} from "@austencloud/scene-3d";

import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

/**
 * The parts of a build one control changed. A performer override stores only
 * these, so every part the performer never touched (the triangle grip, which
 * only the global Grip pills set, above all) keeps following the scene default.
 */
export type PropBuildPatch = Partial<PropBuild>;

/** Writes a performer override. Omitted, the write goes to the scene default. */
export type PropBuildPatchSink = (patch: PropBuildPatch) => void;

export function writeFinish(
  finish: PropFinish,
  onBuildChange?: PropBuildPatchSink
): void {
  if (onBuildChange) return onBuildChange({ finish });
  propFinishState.set(finish);
}

export function writeFanAppearance(
  appearance: FanAppearance,
  onBuildChange?: PropBuildPatchSink
): void {
  if (onBuildChange) {
    return onBuildChange({
      fanBuild: appearance.build,
      fanFrameColor: appearance.frameColor,
      fanCover: appearance.cover,
    });
  }
  propFinishState.setFanBuild(appearance.build);
  propFinishState.setFanFrameColor(appearance.frameColor);
  propFinishState.setFanCover(appearance.cover);
}
